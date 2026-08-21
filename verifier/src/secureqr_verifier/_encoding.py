from __future__ import annotations

import base64
import binascii
from collections.abc import Mapping
from dataclasses import dataclass

import cbor2

TOKEN_VERSION = "SQRID/1"
IDENTIFIER_SIZE = 16
NONCE_SIZE = 16
SIGNATURE_SIZE = 64
MAX_TOKEN_TEXT_SIZE = 4096
MAX_CBOR_TIMESTAMP = (1 << 64) - 1
SIGNED_FIELD_NAMES = frozenset({"v", "kid", "cid", "iat", "exp", "n"})
TOKEN_FIELD_NAMES = SIGNED_FIELD_NAMES | {"sig"}


class TokenFormatError(ValueError):
    """El token no tiene la representacion canonica de SQRID/1."""


@dataclass(frozen=True, slots=True)
class TokenClaims:
    version: str
    key_id: str
    credential_id: str
    issued_at: int
    expires_at: int
    nonce: bytes
    signature: bytes

    def signed_fields(self) -> dict[str, object]:
        return {
            "v": self.version,
            "kid": self.key_id,
            "cid": self.credential_id,
            "iat": self.issued_at,
            "exp": self.expires_at,
            "n": self.nonce,
        }


def encode_base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode_base64url(value: str) -> bytes:
    if not isinstance(value, str) or not value or "=" in value:
        raise TokenFormatError
    if len(value) > MAX_TOKEN_TEXT_SIZE:
        raise TokenFormatError

    try:
        raw = base64.b64decode(
            value + "=" * (-len(value) % 4),
            altchars=b"-_",
            validate=True,
        )
    except (ValueError, binascii.Error, UnicodeEncodeError) as exc:
        raise TokenFormatError from exc

    if encode_base64url(raw) != value:
        raise TokenFormatError
    return raw


def validate_identifier(value: object) -> str:
    if not isinstance(value, str):
        raise TokenFormatError
    raw = _decode_base64url(value)
    if len(raw) != IDENTIFIER_SIZE:
        raise TokenFormatError
    return value


def _validate_timestamp(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TokenFormatError
    if value < 0 or value > MAX_CBOR_TIMESTAMP:
        raise TokenFormatError
    return value


def parse_token(token: str) -> TokenClaims:
    raw = _decode_base64url(token)
    try:
        fields = cbor2.loads(raw)
    except (cbor2.CBORDecodeError, ValueError, TypeError) as exc:
        raise TokenFormatError from exc

    if not isinstance(fields, dict) or set(fields) != TOKEN_FIELD_NAMES:
        raise TokenFormatError
    if cbor2.dumps(fields, canonical=True) != raw:
        raise TokenFormatError

    version = fields["v"]
    nonce = fields["n"]
    signature = fields["sig"]
    if not isinstance(version, str):
        raise TokenFormatError
    if not isinstance(nonce, bytes) or len(nonce) != NONCE_SIZE:
        raise TokenFormatError
    if not isinstance(signature, bytes):
        raise TokenFormatError

    return TokenClaims(
        version=version,
        key_id=validate_identifier(fields["kid"]),
        credential_id=validate_identifier(fields["cid"]),
        issued_at=_validate_timestamp(fields["iat"]),
        expires_at=_validate_timestamp(fields["exp"]),
        nonce=nonce,
        signature=signature,
    )


def canonical_signed_payload(fields: Mapping[str, object]) -> bytes:
    if set(fields) != SIGNED_FIELD_NAMES:
        raise TokenFormatError
    return cbor2.dumps(dict(fields), canonical=True)
