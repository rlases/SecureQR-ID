from __future__ import annotations

import base64
import json
import logging
import secrets
from pathlib import Path

import cbor2
import pytest
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from conftest import FIXED_TIME, TOKEN_TTL_SECONDS, KeyMaterial
from secureqr_issuer import (
    ConfigurationError,
    CredentialIdError,
    Issuer,
    KeyCreationError,
    KeyLoadError,
    create_credential_id,
    create_key_pair,
)
from secureqr_issuer._encoding import (
    SIGNED_FIELD_NAMES,
    TOKEN_FIELD_NAMES,
    canonical_signed_payload,
    encode_base64url,
)
from secureqr_issuer.issuer import P256_ORDER


def _decode_token(token: str) -> tuple[dict[str, object], bytes]:
    assert "=" not in token
    raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
    fields = cbor2.loads(raw)
    assert isinstance(fields, dict)
    assert cbor2.dumps(fields, canonical=True) == raw
    return fields, raw


def _load_public_key(public_pem: bytes) -> ec.EllipticCurvePublicKey:
    public_key = serialization.load_pem_public_key(public_pem)
    assert isinstance(public_key, ec.EllipticCurvePublicKey)
    return public_key


def _verify_fields(
    public_key: ec.EllipticCurvePublicKey, fields: dict[str, object]
) -> None:
    signature = fields["sig"]
    assert isinstance(signature, bytes)
    r = int.from_bytes(signature[:32], "big")
    s = int.from_bytes(signature[32:], "big")
    der_signature = encode_dss_signature(r, s)
    signed_fields = {name: fields[name] for name in SIGNED_FIELD_NAMES}
    public_key.verify(
        der_signature,
        canonical_signed_payload(signed_fields),
        ec.ECDSA(hashes.SHA256()),
    )


def test_issue_token_is_well_formed_and_signature_is_valid(issuer: Issuer) -> None:
    credential_id = create_credential_id()

    fields, _ = _decode_token(issuer.issue_token(credential_id))

    assert set(fields) == TOKEN_FIELD_NAMES
    assert fields["v"] == "SQRID/1"
    assert fields["kid"] == issuer.kid
    assert fields["cid"] == credential_id
    assert fields["iat"] == FIXED_TIME
    assert fields["exp"] == FIXED_TIME + TOKEN_TTL_SECONDS
    assert isinstance(fields["n"], bytes) and len(fields["n"]) == 16
    assert isinstance(fields["sig"], bytes) and len(fields["sig"]) == 64
    _verify_fields(_load_public_key(issuer.public_key_pem()), fields)


def test_key_id_is_derived_from_the_signing_public_key(issuer: Issuer) -> None:
    public_key = _load_public_key(issuer.public_key_pem())
    public_der = public_key.public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    digest = hashes.Hash(hashes.SHA256())
    digest.update(public_der)

    assert issuer.kid == encode_base64url(digest.finalize()[:16])


def test_signature_uses_fixed_width_low_s_form(issuer: Issuer) -> None:
    fields, _ = _decode_token(issuer.issue_token(create_credential_id()))
    signature = fields["sig"]
    assert isinstance(signature, bytes)

    r = int.from_bytes(signature[:32], "big")
    s = int.from_bytes(signature[32:], "big")
    assert 1 <= r < P256_ORDER
    assert 1 <= s <= P256_ORDER // 2


def test_signature_covers_every_payload_field(issuer: Issuer) -> None:
    fields, _ = _decode_token(issuer.issue_token(create_credential_id()))
    public_key = _load_public_key(issuer.public_key_pem())
    replacements: dict[str, object] = {
        "v": "SQRID/2",
        "kid": create_credential_id(),
        "cid": create_credential_id(),
        "iat": int(fields["iat"]) + 1,
        "exp": int(fields["exp"]) + 1,
        "n": secrets.token_bytes(16),
    }

    for field_name, replacement in replacements.items():
        modified = {**fields, field_name: replacement}
        with pytest.raises(InvalidSignature):
            _verify_fields(public_key, modified)


def test_nonce_is_unique_in_a_reasonable_sample(issuer: Issuer) -> None:
    credential_id = create_credential_id()
    nonces = {
        _decode_token(issuer.issue_token(credential_id))[0]["n"] for _ in range(256)
    }

    assert len(nonces) == 256


def test_credential_id_is_canonical_and_unique() -> None:
    identifiers = {create_credential_id() for _ in range(256)}

    assert len(identifiers) == 256
    assert all(len(identifier) == 22 and "=" not in identifier for identifier in identifiers)


def test_canonical_payload_ignores_mapping_insertion_order() -> None:
    first = {
        "v": "SQRID/1",
        "kid": create_credential_id(),
        "cid": create_credential_id(),
        "iat": FIXED_TIME,
        "exp": FIXED_TIME + TOKEN_TTL_SECONDS,
        "n": secrets.token_bytes(16),
    }
    second = {key: first[key] for key in reversed(tuple(first))}

    assert canonical_signed_payload(first) == canonical_signed_payload(second)


@pytest.mark.parametrize(
    "credential_id",
    ["documento-no-opaco", "not-base64url", "A" * 21, "A" * 22 + "=", "", None],
)
def test_rejects_non_opaque_credential_ids(
    issuer: Issuer, credential_id: object
) -> None:
    with pytest.raises(CredentialIdError) as error:
        issuer.issue_token(credential_id)  # type: ignore[arg-type]

    if credential_id not in ("", None):
        assert str(credential_id) not in str(error.value)


@pytest.mark.parametrize("ttl", [0, -1, True, 1.5, "90"])
def test_rejects_invalid_token_lifetime(key_material: KeyMaterial, ttl: object) -> None:
    with pytest.raises(ConfigurationError):
        Issuer(
            key_material.private_path,
            key_material.password,
            ttl,  # type: ignore[arg-type]
        )


def test_private_key_is_encrypted_and_not_returned(
    issuer: Issuer, key_material: KeyMaterial
) -> None:
    private_pem = key_material.private_path.read_bytes()
    public_pem = issuer.public_key_pem()
    token = issuer.issue_token(create_credential_id())

    assert b"BEGIN ENCRYPTED PRIVATE KEY" in private_pem
    assert b"BEGIN PRIVATE KEY" not in private_pem
    assert b"PRIVATE KEY" not in public_pem
    assert "PRIVATE KEY" not in repr(issuer)
    assert "PRIVATE KEY" not in token
    assert not hasattr(issuer, "private_key")
    with pytest.raises(TypeError):
        json.dumps(issuer)


def test_key_load_failure_does_not_leak_password_or_log_secret(
    key_material: KeyMaterial, caplog: pytest.LogCaptureFixture
) -> None:
    wrong_password = secrets.token_urlsafe(24)
    with caplog.at_level(logging.DEBUG), pytest.raises(KeyLoadError) as error:
        Issuer(key_material.private_path, wrong_password, TOKEN_TTL_SECONDS)

    assert wrong_password not in str(error.value)
    assert wrong_password not in caplog.text
    assert key_material.private_path.read_text(encoding="ascii") not in caplog.text


def test_rejects_unencrypted_private_key(tmp_path: Path) -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_path = tmp_path / "unencrypted.pem"
    private_path.write_bytes(
        private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )

    with pytest.raises(KeyLoadError):
        Issuer(private_path, secrets.token_urlsafe(24), TOKEN_TTL_SECONDS)


def test_rejects_private_key_from_another_curve(tmp_path: Path) -> None:
    password = secrets.token_urlsafe(24)
    private_key = ec.generate_private_key(ec.SECP384R1())
    private_path = tmp_path / "p384.pem"
    private_path.write_bytes(
        private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.BestAvailableEncryption(password.encode("utf-8")),
        )
    )

    with pytest.raises(KeyLoadError):
        Issuer(private_path, password, TOKEN_TTL_SECONDS)


def test_key_creation_never_overwrites_existing_material(
    key_material: KeyMaterial,
) -> None:
    original_private = key_material.private_path.read_bytes()
    original_public = key_material.public_path.read_bytes()

    with pytest.raises(KeyCreationError):
        create_key_pair(
            key_material.private_path,
            key_material.public_path,
            secrets.token_urlsafe(24),
        )

    assert key_material.private_path.read_bytes() == original_private
    assert key_material.public_path.read_bytes() == original_public
