from __future__ import annotations

import base64

import cbor2
import pytest
from secureqr_verifier._encoding import TokenFormatError, parse_token


def _encode_raw(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _fields() -> dict[str, object]:
    identifier = _encode_raw(b"a" * 16)
    return {
        "v": "SQRID/1",
        "kid": identifier,
        "cid": identifier,
        "iat": 100,
        "exp": 200,
        "n": b"n" * 16,
        "sig": b"s" * 64,
    }


@pytest.mark.parametrize("token", ["", "abc=", "not+a-token", "A" * 4097])
def test_rejects_noncanonical_base64url(token: str) -> None:
    with pytest.raises(TokenFormatError):
        parse_token(token)


def test_rejects_noncanonical_cbor() -> None:
    fields = _fields()
    raw = cbor2.dumps(fields, canonical=False)
    assert raw != cbor2.dumps(fields, canonical=True)

    with pytest.raises(TokenFormatError):
        parse_token(_encode_raw(raw))


def test_rejects_trailing_cbor_data() -> None:
    raw = cbor2.dumps(_fields(), canonical=True) + b"\x00"

    with pytest.raises(TokenFormatError):
        parse_token(_encode_raw(raw))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("iat", True),
        ("iat", -1),
        ("exp", 1 << 64),
        ("n", b"short"),
        ("sig", "not-bytes"),
        ("cid", "not-an-id"),
    ],
)
def test_rejects_invalid_field_types_and_sizes(field: str, value: object) -> None:
    fields = _fields()
    fields[field] = value

    with pytest.raises(TokenFormatError):
        parse_token(_encode_raw(cbor2.dumps(fields, canonical=True)))


def test_rejects_unknown_fields() -> None:
    fields = _fields()
    fields["extra"] = "unsigned"

    with pytest.raises(TokenFormatError):
        parse_token(_encode_raw(cbor2.dumps(fields, canonical=True)))
