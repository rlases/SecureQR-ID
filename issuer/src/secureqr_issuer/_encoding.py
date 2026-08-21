from __future__ import annotations

import base64
import binascii
from collections.abc import Mapping

import cbor2

TOKEN_VERSION = "SQRID/1"
IDENTIFIER_SIZE = 16
NONCE_SIZE = 16
SIGNATURE_SIZE = 64
SIGNED_FIELD_NAMES = frozenset({"v", "kid", "cid", "iat", "exp", "n"})
TOKEN_FIELD_NAMES = SIGNED_FIELD_NAMES | {"sig"}


def encode_base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def decode_identifier(value: str) -> bytes:
    if not isinstance(value, str) or not value or "=" in value:
        raise ValueError("El identificador no usa Base64url canonico.")

    try:
        raw = base64.b64decode(
            value + "=" * (-len(value) % 4),
            altchars=b"-_",
            validate=True,
        )
    except (ValueError, binascii.Error) as exc:
        raise ValueError("El identificador no usa Base64url canonico.") from exc

    if len(raw) != IDENTIFIER_SIZE or encode_base64url(raw) != value:
        raise ValueError("El identificador debe representar exactamente 128 bits.")
    return raw


def canonical_signed_payload(fields: Mapping[str, object]) -> bytes:
    if set(fields) != SIGNED_FIELD_NAMES:
        raise ValueError("El payload firmado no tiene el esquema SQRID/1 exacto.")
    return cbor2.dumps(dict(fields), canonical=True)


def encode_token(fields: Mapping[str, object]) -> str:
    if set(fields) != TOKEN_FIELD_NAMES:
        raise ValueError("El token no tiene el esquema SQRID/1 exacto.")
    return encode_base64url(cbor2.dumps(dict(fields), canonical=True))
