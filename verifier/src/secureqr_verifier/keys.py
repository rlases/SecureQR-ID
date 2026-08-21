from __future__ import annotations

import hashlib
import hmac
from pathlib import Path
from typing import Protocol

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from ._encoding import TokenFormatError, encode_base64url, validate_identifier


class KeyResolutionError(Exception):
    """La clave solicitada no pertenece al directorio confiable."""


class PublicKeyResolver(Protocol):
    def resolve(self, key_id: str) -> ec.EllipticCurvePublicKey:
        """Devuelve la clave publica asociada al identificador."""


def derive_key_id(public_key: ec.EllipticCurvePublicKey) -> str:
    public_der = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return encode_base64url(hashlib.sha256(public_der).digest()[:16])


def validate_public_key(
    public_key: object, expected_key_id: str
) -> ec.EllipticCurvePublicKey:
    if not isinstance(public_key, ec.EllipticCurvePublicKey) or not isinstance(
        public_key.curve, ec.SECP256R1
    ):
        raise KeyResolutionError
    if not hmac.compare_digest(derive_key_id(public_key), expected_key_id):
        raise KeyResolutionError
    return public_key


class DirectoryKeyResolver:
    """Resuelve claves P-256 desde archivos externos nombrados por su `kid`."""

    __slots__ = ("_directory",)

    def __init__(self, directory: str | Path) -> None:
        self._directory = Path(directory)
        if not self._directory.is_dir():
            raise KeyResolutionError

    def resolve(self, key_id: str) -> ec.EllipticCurvePublicKey:
        try:
            validate_identifier(key_id)
            pem = (self._directory / f"{key_id}.pem").read_bytes()
            public_key = serialization.load_pem_public_key(pem)
        except (OSError, TokenFormatError, TypeError, ValueError):
            raise KeyResolutionError from None
        return validate_public_key(public_key, key_id)
