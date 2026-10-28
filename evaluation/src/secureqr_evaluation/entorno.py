"""Entorno aislado de una corrida (ADR-0019, punto 2).

Cada corrida crea, dentro de una carpeta propia:

- una clave de emisión y una de revocación **de prueba**, con una contraseña aleatoria
  que solo vive en memoria;
- la lista de revocación firmada;
- las dos SQLite del servicio (nonces y bitácora);
- un `verifier-service` real en `127.0.0.1`, arrancado con `uvicorn` en otro proceso.

Nunca usa la clave institucional ni datos del servidor del CCAV, y los titulares son
sintéticos: solo un `cid` aleatorio. La batería habla con el servicio únicamente por
`POST /api/verify`, igual que `verifier-web/`.
"""

from __future__ import annotations

import http.client
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from secureqr_issuer import Issuer, create_key_pair
from secureqr_revocation.revocation import sign_revocation_list

from .registro import configuracion_logging

# Vigencia del token y tolerancia de reloj de la corrida. La vigencia es la del piloto
# (60 s, ADR-0019); la tolerancia es configuración externa del servicio (ADR-0011).
TOKEN_TTL_SECONDS = 60
CLOCK_SKEW_SECONDS = 30
REVOCATION_MAX_AGE_SECONDS = 24 * 3600
REVOCATION_REFRESH_SECONDS = 1
VERIFIER_ID = "evaluacion-secureqr-id"
ARRANQUE_MAXIMO_SECONDS = 30.0


class EntornoError(Exception):
    """El entorno de la corrida no se pudo preparar o el servicio no arrancó."""


@dataclass(frozen=True, slots=True)
class Presentacion:
    """Lo que la batería observa al presentar un token.

    `aceptado` es la decisión pública; `motivo`, el código interno del registro del
    servicio (None si se aceptó); `ms`, el tiempo de ida y vuelta del lado del cliente;
    `variante`, cuál de las formas del caso se intentó, si tiene varias.
    """

    aceptado: bool
    motivo: str | None
    ms: float
    variante: str | None = None


def _puerto_libre() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Entorno:
    """Despliegue de prueba de `verifier-service` en una carpeta que la corrida posee."""

    def __init__(self, carpeta: Path) -> None:
        self.carpeta = Path(carpeta)
        self.carpeta.mkdir(parents=True, exist_ok=True)
        self._secretos = self.carpeta / "secretos"
        self._secretos.mkdir(mode=0o700)
        self.claves_emision = self.carpeta / "claves-emision"
        self.claves_revocacion = self.carpeta / "claves-revocacion"
        self.lista_revocacion = self.carpeta / "revocacion.sqrid"
        self.base_nonces = self.carpeta / "estado" / "nonces.sqlite3"
        self.base_bitacora = self.carpeta / "estado" / "bitacora.sqlite3"
        self.registro = self.carpeta / "registro-servicio.jsonl"
        self._password = secrets.token_urlsafe(32)

        self.emision_privada, self.kid_emision = self._par_de_claves(
            "emision", self.claves_emision
        )
        self.revocacion_privada, self.kid_revocacion = self._par_de_claves(
            "revocacion", self.claves_revocacion
        )
        self.escribir_lista([])

        self._proceso: subprocess.Popen[bytes] | None = None
        self._puerto: int | None = None
        self._emisor: Issuer | None = None
        self._local = threading.local()
        self._registro_lock = threading.Lock()
        self._registro_leido = 0

    # --- Material de prueba -------------------------------------------------------------

    def _par_de_claves(self, nombre: str, directorio_publico: Path) -> tuple[Path, str]:
        privada = self._secretos / f"{nombre}-privada.pem"
        publica_temporal = self._secretos / f"{nombre}-publica.pem"
        metadatos = create_key_pair(privada, publica_temporal, self._password)
        directorio_publico.mkdir(exist_ok=True)
        publica_temporal.replace(directorio_publico / f"{metadatos.kid}.pem")
        return privada, metadatos.kid

    def cargar_privada(self, ruta: Path) -> ec.EllipticCurvePrivateKey:
        """Clave privada de prueba de esta corrida (para casos que firman a mano)."""
        clave = serialization.load_pem_private_key(
            ruta.read_bytes(), self._password.encode()
        )
        assert isinstance(clave, ec.EllipticCurvePrivateKey)
        return clave

    def emisor(
        self, *, ttl: int = TOKEN_TTL_SECONDS, reloj: Callable[[], float] | None = None
    ) -> Issuer:
        """`issuer/` como librería, con la clave de emisión de prueba."""
        if ttl == TOKEN_TTL_SECONDS and reloj is None:
            if self._emisor is None:
                self._emisor = Issuer(self.emision_privada, self._password, ttl)
            return self._emisor
        return Issuer(self.emision_privada, self._password, ttl, clock=reloj)

    def escribir_lista(self, revocados: list[str], *, emitida_en: int | None = None) -> None:
        """Firma y guarda la lista con la clave de revocación de prueba (reemplazo atómico)."""
        firmada = sign_revocation_list(
            self.cargar_privada(self.revocacion_privada),
            self.kid_revocacion,
            revocados,
            int(time.time()) - 1 if emitida_en is None else emitida_en,
        )
        temporal = self.lista_revocacion.with_suffix(".tmp")
        temporal.write_bytes(firmada)
        temporal.replace(self.lista_revocacion)

    # --- Servicio -------------------------------------------------------------------------

    def _variables(self) -> dict[str, str]:
        return {
            "SQRID_VERIFIER_ID": VERIFIER_ID,
            "SQRID_TRUSTED_KEYS_DIR": str(self.claves_emision),
            "SQRID_REVOCATION_KEYS_DIR": str(self.claves_revocacion),
            "SQRID_REVOCATION_LIST_PATH": str(self.lista_revocacion),
            "SQRID_REPLAY_DB_PATH": str(self.base_nonces),
            "SQRID_EVIDENCE_DB_PATH": str(self.base_bitacora),
            "SQRID_CLOCK_SKEW_SECONDS": str(CLOCK_SKEW_SECONDS),
            "SQRID_REVOCATION_MAX_AGE_SECONDS": str(REVOCATION_MAX_AGE_SECONDS),
            "SQRID_REVOCATION_REFRESH_SECONDS": str(REVOCATION_REFRESH_SECONDS),
        }

    def configuracion(self) -> dict[str, object]:
        """Parámetros del servicio bajo prueba, para `entorno.json`."""
        return {
            "token_ttl_seconds": TOKEN_TTL_SECONDS,
            "clock_skew_seconds": CLOCK_SKEW_SECONDS,
            "revocation_max_age_seconds": REVOCATION_MAX_AGE_SECONDS,
            "revocation_refresh_seconds": REVOCATION_REFRESH_SECONDS,
            "verifier_id": VERIFIER_ID,
        }

    def iniciar(self) -> None:
        if self._proceso is not None:
            raise EntornoError("El servicio ya está en marcha.")
        configuracion = self.carpeta / "logging.json"
        configuracion.write_text(json.dumps(configuracion_logging(self.registro)))
        self._puerto = _puerto_libre()
        salida = open(self.carpeta / "servicio.log", "ab")
        try:
            self._proceso = subprocess.Popen(
                [
                    sys.executable, "-m", "uvicorn", "--factory",
                    "secureqr_verifier_service:create_app_from_environment",
                    "--host", "127.0.0.1", "--port", str(self._puerto),
                    "--log-config", str(configuracion), "--no-access-log",
                ],
                env={**os.environ, **self._variables()},
                stdout=salida,
                stderr=subprocess.STDOUT,
            )
        finally:
            salida.close()
        self._esperar_listo()

    def _esperar_listo(self) -> None:
        limite = time.monotonic() + ARRANQUE_MAXIMO_SECONDS
        while time.monotonic() < limite:
            assert self._proceso is not None
            if self._proceso.poll() is not None:
                break
            try:
                conexion = http.client.HTTPConnection("127.0.0.1", self._puerto, timeout=2)
                conexion.request("GET", "/api/health")
                if conexion.getresponse().status == 200:
                    conexion.close()
                    return
            except OSError:
                pass
            time.sleep(0.1)
        self.detener()
        cola = (self.carpeta / "servicio.log").read_text(errors="replace")[-2000:]
        raise EntornoError(f"verifier-service no arrancó.\n{cola}")

    def detener(self) -> None:
        conexion = getattr(self._local, "conexion", None)
        if conexion is not None:
            conexion.close()
            self._local.conexion = None
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

    def __enter__(self) -> Entorno:
        self.iniciar()
        return self

    def __exit__(self, *_: object) -> None:
        self.detener()

    # --- Presentación de tokens -----------------------------------------------------------

    def _conexion(self) -> http.client.HTTPConnection:
        conexion = getattr(self._local, "conexion", None)
        if conexion is None or conexion.port != self._puerto:
            conexion = http.client.HTTPConnection("127.0.0.1", self._puerto, timeout=30)
            self._local.conexion = conexion
        return conexion

    def presentar(self, token: str) -> tuple[bool, float]:
        """`POST /api/verify` y la decisión pública, con su tiempo del lado del cliente."""
        if self._proceso is None:
            raise EntornoError("El servicio no está en marcha.")
        cuerpo = json.dumps({"token": token})
        conexion = self._conexion()
        inicio = time.perf_counter()
        conexion.request(
            "POST", "/api/verify", body=cuerpo, headers={"Content-Type": "application/json"}
        )
        respuesta = conexion.getresponse()
        datos = respuesta.read()
        ms = (time.perf_counter() - inicio) * 1000
        return json.loads(datos).get("accepted") is True, ms

    def motivos_nuevos(self) -> list[str]:
        """Códigos de motivo registrados por el servicio desde la última lectura."""
        with self._registro_lock:
            if not self.registro.exists():
                return []
            with self.registro.open("rb") as archivo:
                archivo.seek(self._registro_leido)
                datos = archivo.read()
            # Solo líneas completas: una a medio escribir se lee en la próxima llamada.
            completo = datos[: datos.rfind(b"\n") + 1]
            self._registro_leido += len(completo)
        motivos = []
        for linea in completo.splitlines():
            codigo = json.loads(linea).get("reason_code")
            if codigo:
                motivos.append(codigo)
        return motivos

    def verificar(self, token: str) -> Presentacion:
        """Presenta un token y devuelve la decisión con su motivo interno.

        Para presentaciones de a una: el motivo es el último que el servicio registró
        mientras atendía esta petición. El registro se escribe antes de responder.
        """
        self.motivos_nuevos()
        aceptado, ms = self.presentar(token)
        motivos = self.motivos_nuevos()
        return Presentacion(aceptado, None if aceptado else (motivos[-1] if motivos else None), ms)
