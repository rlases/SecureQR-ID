from __future__ import annotations

import os
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

from ._encoding import (
    IDENTIFIER_SIZE,
    NONCE_SIZE,
    TOKEN_VERSION,
    canonical_signed_payload,
    decode_identifier,
    encode_base64url,
    encode_token,
)

P256_ORDER = int(
    "FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",
    16,
)
P256_SCALAR_SIZE = 32
MINIMUM_PASSWORD_BYTES = 16
MAX_CBOR_TIMESTAMP = (1 << 64) - 1


class IssuerError(Exception):
    """Error base del modulo emisor."""


class ConfigurationError(IssuerError):
    """Configuracion ausente o insegura."""


class CredentialIdError(IssuerError):
    """Identificador de credencial fuera del formato opaco requerido."""


class KeyLoadError(IssuerError):
    """La clave privada no se pudo cargar de forma segura."""


class KeyCreationError(IssuerError):
    """El par de claves no se pudo crear sin sobrescribir material existente."""


@dataclass(frozen=True, slots=True)
class KeyMetadata:
    kid: str
    public_key_pem: bytes


def _password_bytes(password: str) -> bytes:
    if not isinstance(password, str) or not password:
        raise ConfigurationError("La contrasena de la clave privada es obligatoria.")
    encoded = password.encode("utf-8")
    if len(encoded) < MINIMUM_PASSWORD_BYTES:
        raise ConfigurationError(
            "La contrasena de la clave privada debe tener al menos 16 bytes."
        )
    return encoded


def _public_key_pem(public_key: ec.EllipticCurvePublicKey) -> bytes:
    return public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def _key_id(public_key: ec.EllipticCurvePublicKey) -> str:
    public_der = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    digest = hashes.Hash(hashes.SHA256())
    digest.update(public_der)
    return encode_base64url(digest.finalize()[:16])


def _write_new_file(path: Path, content: bytes, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_BINARY"):
        flags |= os.O_BINARY

    descriptor = os.open(path, flags, mode)
    with os.fdopen(descriptor, "wb") as output:
        output.write(content)


def create_key_pair(
    private_key_path: str | os.PathLike[str],
    public_key_path: str | os.PathLike[str],
    password: str,
) -> KeyMetadata:
    """Crea un par P-256 cifrado y nunca sobrescribe archivos existentes."""

    private_path = Path(private_key_path)
    public_path = Path(public_key_path)
    if private_path.resolve() == public_path.resolve():
        raise KeyCreationError("Las rutas de clave privada y publica deben ser distintas.")
    if private_path.exists() or public_path.exists():
        raise KeyCreationError("No se sobrescribe material criptografico existente.")

    password_bytes = _password_bytes(password)
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.BestAvailableEncryption(password_bytes),
    )
    public_pem = _public_key_pem(public_key)

    try:
        _write_new_file(private_path, private_pem, 0o600)
        _write_new_file(public_path, public_pem, 0o644)
    except (FileExistsError, OSError) as exc:
        raise KeyCreationError(
            "No se pudo crear el par de claves sin sobrescribir archivos."
        ) from exc

    return KeyMetadata(kid=_key_id(public_key), public_key_pem=public_pem)


def _load_private_key(
    private_key_path: str | os.PathLike[str], password: str
) -> ec.EllipticCurvePrivateKey:
    password_bytes = _password_bytes(password)
    try:
        pem = Path(private_key_path).read_bytes()
        private_key = serialization.load_pem_private_key(pem, password=password_bytes)
    except (OSError, TypeError, ValueError, UnsupportedAlgorithm):
        raise KeyLoadError(
            "No se pudo cargar una clave privada P-256 cifrada."
        ) from None

    if not isinstance(private_key, ec.EllipticCurvePrivateKey) or not isinstance(
        private_key.curve, ec.SECP256R1
    ):
        raise KeyLoadError("No se pudo cargar una clave privada P-256 cifrada.")
    return private_key


def _compact_signature(
    private_key: ec.EllipticCurvePrivateKey, payload: bytes
) -> bytes:
    der_signature = private_key.sign(payload, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der_signature)
    if s > P256_ORDER // 2:
        s = P256_ORDER - s
    return r.to_bytes(P256_SCALAR_SIZE, "big") + s.to_bytes(
        P256_SCALAR_SIZE, "big"
    )


def create_credential_id() -> str:
    """Genera un identificador opaco de credencial con 128 bits de CSPRNG."""

    return encode_base64url(secrets.token_bytes(IDENTIFIER_SIZE))


class Issuer:
    """Emite tokens SQRID/1 sin exponer la clave privada institucional."""

    __slots__ = ("__private_key", "_clock", "_kid", "_token_ttl_seconds")

    def __init__(
        self,
        private_key_path: str | os.PathLike[str],
        password: str,
        token_ttl_seconds: int,
        *,
        clock: Callable[[], float] | None = None,
    ) -> None:
        if (
            isinstance(token_ttl_seconds, bool)
            or not isinstance(token_ttl_seconds, int)
            or token_ttl_seconds <= 0
        ):
            raise ConfigurationError(
                "La vigencia del token debe ser un entero positivo configurado externamente."
            )

        self.__private_key = _load_private_key(private_key_path, password)
        self._kid = _key_id(self.__private_key.public_key())
        self._token_ttl_seconds = token_ttl_seconds
        self._clock = clock if clock is not None else time.time

    @property
    def kid(self) -> str:
        return self._kid

    @property
    def token_ttl_seconds(self) -> int:
        return self._token_ttl_seconds

    def public_key_pem(self) -> bytes:
        return _public_key_pem(self.__private_key.public_key())

    def issue_token(self, credential_id: str) -> str:
        try:
            decode_identifier(credential_id)
        except ValueError:
            raise CredentialIdError(
                "El cid debe ser un identificador opaco Base64url de 128 bits."
            ) from None

        try:
            issued_at = int(self._clock())
        except (OverflowError, TypeError, ValueError):
            raise ConfigurationError(
                "El reloj del emisor no produjo un instante valido."
            ) from None

        expires_at = issued_at + self._token_ttl_seconds
        if issued_at < 0 or expires_at > MAX_CBOR_TIMESTAMP:
            raise ConfigurationError("El reloj del emisor esta fuera del rango admitido.")

        signed_fields: dict[str, object] = {
            "v": TOKEN_VERSION,
            "kid": self._kid,
            "cid": credential_id,
            "iat": issued_at,
            "exp": expires_at,
            "n": secrets.token_bytes(NONCE_SIZE),
        }
        payload = canonical_signed_payload(signed_fields)
        signature = _compact_signature(self.__private_key, payload)
        return encode_token({**signed_fields, "sig": signature})

    def __repr__(self) -> str:
        return (
            f"Issuer(kid={self._kid!r}, "
            f"token_ttl_seconds={self._token_ttl_seconds!r})"
        )
