"""Servidor de `mi-app-qr` para el caso M3, arrancado aparte y usado solo por HTTP.

Python no importa código Node (ADR-0005): la batería arranca `node dist/index.js` con una
base, una clave `ASIGNACIONES_KEY` y un administrador propios de la corrida, crea
titulares sintéticos por el portal y consulta `GET /api/titulares/integridad` (#119).
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import secrets
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ_REPOSITORIO = Path(__file__).resolve().parents[3]
SERVIDOR = RAIZ_REPOSITORIO / "mi-app-qr" / "server"
ARRANQUE_MAXIMO_SECONDS = 30.0


class MiAppQrError(Exception):
    """El servidor de mi-app-qr no está compilado, no arrancó o respondió algo inesperado."""


def _puerto_libre() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class MiAppQr:
    def __init__(self, carpeta: Path) -> None:
        if not (SERVIDOR / "dist" / "index.js").is_file():
            raise MiAppQrError(
                "M3 necesita mi-app-qr/server compilado: npm install && npm run build en esa carpeta."
            )
        self.carpeta = Path(carpeta)
        self.carpeta.mkdir(parents=True, exist_ok=True)
        self.base = self.carpeta / "app.db"
        self.cabeza = self.carpeta / "cabeza.json"
        self.compromisos = self.carpeta / "compromisos.json"
        self._usuario = "admin-evaluacion"
        self._password = secrets.token_urlsafe(24)
        # La clave HMAC vive solo en el entorno del proceso; el ataque M3 no la usa.
        self._clave = secrets.token_hex(32)
        self._sesion_secreta = secrets.token_urlsafe(32)
        self._proceso: subprocess.Popen[bytes] | None = None
        self._puerto: int | None = None
        self._cliente: urllib.request.OpenerDirector | None = None

    def iniciar(self) -> None:
        self._puerto = _puerto_libre()
        variables = {
            "DB_PATH": str(self.base),
            "PORT": str(self._puerto),
            "SESSION_SECRET": self._sesion_secreta,
            "ASIGNACIONES_KEY": self._clave,
            "SEED_ADMIN_USERNAME": self._usuario,
            "SEED_ADMIN_PASSWORD": self._password,
            "ALTA_MAX_POR_IP": "100000",
            "ASIGNACIONES_CABEZA_PATH": str(self.cabeza),
            "ASIGNACIONES_COMPROMISOS_PATH": str(self.compromisos),
        }
        entorno = {k: v for k, v in os.environ.items() if not k.startswith(("TLS_", "ISSUER_"))}
        salida = open(self.carpeta / "servidor.log", "ab")
        try:
            self._proceso = subprocess.Popen(
                ["node", "dist/index.js"],
                cwd=SERVIDOR,
                env={**entorno, **variables},
                stdout=salida,
                stderr=subprocess.STDOUT,
            )
        finally:
            salida.close()
        limite = time.monotonic() + ARRANQUE_MAXIMO_SECONDS
        while time.monotonic() < limite:
            if self._proceso.poll() is not None:
                break
            try:
                with urllib.request.urlopen(self._url("/api/portal/alta"), timeout=2):
                    self._cliente = None
                    return
            except (OSError, urllib.error.URLError):
                time.sleep(0.2)
        self.detener()
        cola = (self.carpeta / "servidor.log").read_text(errors="replace")[-2000:]
        raise MiAppQrError(f"mi-app-qr no arrancó.\n{cola}")

    def detener(self) -> None:
        if self._proceso is None:
            return
        self._proceso.terminate()
        try:
            self._proceso.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self._proceso.kill()
            self._proceso.wait()
        self._proceso = None

    def reiniciar(self) -> None:
        self.detener()
        self.iniciar()

    def _url(self, ruta: str) -> str:
        return f"http://127.0.0.1:{self._puerto}{ruta}"

    def _pedir(self, metodo: str, ruta: str, cuerpo: object | None = None, *, admin: bool) -> object:
        if admin and self._cliente is None:
            self._cliente = urllib.request.build_opener(
                urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
            )
            self._pedir_con(self._cliente, "POST", "/api/auth/login",
                            {"username": self._usuario, "password": self._password})
        cliente = self._cliente if admin else urllib.request.build_opener()
        return self._pedir_con(cliente, metodo, ruta, cuerpo)

    def _pedir_con(self, cliente, metodo: str, ruta: str, cuerpo: object | None) -> object:
        datos = None if cuerpo is None else json.dumps(cuerpo).encode()
        peticion = urllib.request.Request(
            self._url(ruta), data=datos, method=metodo,
            headers={"Content-Type": "application/json"},
        )
        try:
            with cliente.open(peticion, timeout=30) as respuesta:
                texto = respuesta.read()
        except urllib.error.HTTPError as exc:
            raise MiAppQrError(f"{metodo} {ruta} respondió {exc.code}") from None
        return json.loads(texto) if texto else None

    def poblar(self, titulares: int) -> None:
        """Un estamento base y titulares sintéticos dados de alta por el portal."""
        estamento = self._pedir(
            "POST", "/api/estamentos", {"nombre": "Sintético", "requiereConfirmacion": False},
            admin=True,
        )
        assert isinstance(estamento, dict)
        self._pedir("POST", f"/api/estamentos/{estamento['id']}/base", admin=True)
        for n in range(1, titulares + 1):
            self._pedir(
                "POST", "/api/portal/alta",
                {
                    "nombre": f"Titular Sintético {n:03d}",
                    "documento": f"9{secrets.randbelow(10**9):09d}",
                    "correo": f"sintetico{n:03d}@ejemplo.test",
                    "estamentoId": estamento["id"],
                    "autorizaDatos": True,
                },
                admin=False,
            )

    def integridad(self) -> dict:
        respuesta = self._pedir("GET", "/api/titulares/integridad", admin=True)
        assert isinstance(respuesta, dict)
        return respuesta["verificacion"]
