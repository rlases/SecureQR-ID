"""Servicio local de emisión (issue #83, ADR-0016 punto 6).

`mi-app-qr` necesita un token nuevo cada pocos segundos por titular; si invocara la CLI
tendría que guardar la contraseña de la clave. En su lugar, `issuer/` corre como un
proceso de larga duración:

- el custodio escribe la contraseña una vez al arrancarlo y la clave queda solo en la
  memoria de este proceso;
- escucha únicamente en la interfaz de bucle local (`127.0.0.1` o `::1`);
- solo atiende solicitudes con el secreto compartido de la instalación, que permite
  pedir tokens pero no leer la clave.

Contrato HTTP:

    POST /v1/tokens   Authorization: Bearer <secreto>   {"cid": "<cid>"}
      200 {"token": "<SQRID/1>", "expires_in": <segundos>}
      400 solicitud inválida · 401 sin secreto o secreto incorrecto
    GET  /health      200 {"status": "ready"}  (sin autenticación, no revela nada)

Solo usa la biblioteca estándar: `issuer/` no suma dependencias.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import os
import secrets
import socket
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .issuer import ConfigurationError, CredentialIdError, Issuer, IssuerError

MAX_BODY_BYTES = 1024
SECRET_BYTES = 32
TOKEN_PATH = "/v1/tokens"
HEALTH_PATH = "/health"

logger = logging.getLogger(__name__)


class ServiceError(IssuerError):
    """El servicio no puede arrancar o atender de forma segura."""


def _digest(value: bytes) -> bytes:
    return hashlib.sha256(value).digest()


class SharedSecret:
    """Secreto de la instalación; solo se compara, nunca se devuelve ni se registra."""

    __slots__ = ("__digest",)

    def __init__(self, value: bytes) -> None:
        if len(value) < SECRET_BYTES:
            raise ServiceError(
                f"El secreto compartido debe tener al menos {SECRET_BYTES} bytes."
            )
        self.__digest = _digest(value)

    @classmethod
    def from_file(cls, path: str | os.PathLike[str]) -> SharedSecret:
        try:
            raw = Path(path).read_bytes().strip()
        except OSError:
            raise ServiceError("No se pudo leer el archivo del secreto compartido.") from None
        return cls(raw)

    def matches(self, presented: bytes) -> bool:
        # Se comparan resúmenes de longitud fija, en tiempo constante.
        return hmac.compare_digest(self.__digest, _digest(presented))

    def __repr__(self) -> str:
        return "SharedSecret(<oculto>)"


def generate_secret_file(path: str | os.PathLike[str]) -> None:
    """Crea el secreto compartido (256 bits, CSPRNG) sin sobrescribir; permisos 0600."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    try:
        descriptor = os.open(target, flags, 0o600)
    except FileExistsError:
        raise ServiceError("No se sobrescribe un secreto compartido existente.") from None
    with os.fdopen(descriptor, "wb") as file:
        file.write(secrets.token_urlsafe(SECRET_BYTES).encode("ascii") + b"\n")


def require_loopback(host: str) -> str:
    """Solo se acepta una dirección de bucle local literal: nunca la red."""
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        raise ServiceError(
            "La dirección de escucha debe ser 127.0.0.1 o ::1, no un nombre."
        ) from None
    if not address.is_loopback:
        raise ServiceError(
            "El servicio de emisión solo escucha en la interfaz local (127.0.0.1 o ::1)."
        )
    return str(address)


class _Handler(BaseHTTPRequestHandler):
    server_version = "SecureQR-ID-issuer"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    # Atributos que asigna `create_server`.
    issuer: Issuer
    secret: SharedSecret

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        # El registro por defecto escribe la línea de la solicitud en stderr; aquí no se
        # registra nada por solicitud (ni cid ni token). Los rechazos usan códigos.
        return

    def _send(self, status: HTTPStatus, body: dict[str, object]) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(payload)

    def _reject(self, status: HTTPStatus, reason_code: str) -> None:
        logger.warning("issuer_service_rejected", extra={"reason_code": reason_code})
        # Un rechazo puede ocurrir antes de leer el cuerpo: si la conexión siguiera
        # abierta, los bytes sin leer se interpretarían como otra solicitud.
        self.close_connection = True
        self._send(status, {"error": status.phrase})

    def do_GET(self) -> None:  # noqa: N802
        if self.path == HEALTH_PATH:
            self._send(HTTPStatus.OK, {"status": "ready"})
        else:
            self._reject(HTTPStatus.NOT_FOUND, "unknown_path")

    def do_POST(self) -> None:  # noqa: N802
        if self.path != TOKEN_PATH:
            self._reject(HTTPStatus.NOT_FOUND, "unknown_path")
            return

        authorization = self.headers.get("Authorization", "")
        scheme, _, presented = authorization.partition(" ")
        if scheme != "Bearer" or not presented or not self.secret.matches(
            presented.strip().encode("utf-8")
        ):
            self._reject(HTTPStatus.UNAUTHORIZED, "bad_secret")
            return

        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._reject(HTTPStatus.BAD_REQUEST, "no_length")
            return
        if not 0 < length <= MAX_BODY_BYTES:
            self._reject(HTTPStatus.BAD_REQUEST, "body_size")
            return

        try:
            body = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._reject(HTTPStatus.BAD_REQUEST, "bad_json")
            return
        if (
            not isinstance(body, dict)
            or set(body) != {"cid"}
            or not isinstance(body["cid"], str)
        ):
            self._reject(HTTPStatus.BAD_REQUEST, "bad_schema")
            return

        try:
            token = self.issuer.issue_token(body["cid"])
        except CredentialIdError:
            self._reject(HTTPStatus.BAD_REQUEST, "bad_cid")
            return
        except IssuerError:
            self._reject(HTTPStatus.INTERNAL_SERVER_ERROR, "issue_failed")
            return

        self._send(
            HTTPStatus.OK,
            {"token": token, "expires_in": self.issuer.token_ttl_seconds},
        )


def create_server(
    issuer: Issuer, secret: SharedSecret, host: str, port: int
) -> ThreadingHTTPServer:
    """Crea el servidor sin arrancarlo. `port=0` elige un puerto libre (pruebas)."""
    if not isinstance(issuer, Issuer) or not isinstance(secret, SharedSecret):
        raise ConfigurationError("El servicio necesita un Issuer y un secreto compartido.")
    host = require_loopback(host)
    handler = type("IssuerHandler", (_Handler,), {"issuer": issuer, "secret": secret})
    server_class = ThreadingHTTPServer
    if ":" in host:
        server_class = type(
            "IPv6Server", (ThreadingHTTPServer,), {"address_family": socket.AF_INET6}
        )
    try:
        server = server_class((host, port), handler)
    except OSError:
        raise ServiceError(f"No se pudo escuchar en {host}:{port}.") from None
    server.daemon_threads = True
    server.handle_error = _quiet_handle_error  # type: ignore[method-assign]
    return server


def _quiet_handle_error(request: object, client_address: object) -> None:
    # El manejador por defecto imprime la traza completa; aquí basta un código.
    logger.warning("issuer_service_connection_error")


def serve(issuer: Issuer, secret: SharedSecret, host: str, port: int) -> None:
    """Atiende hasta que se detenga el proceso (Ctrl+C o el gestor de servicios)."""
    server = create_server(issuer, secret, host, port)
    address, bound_port = server.server_address[:2]
    print(f"Servicio de emisión listo en {address}:{bound_port} (kid={issuer.kid})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
