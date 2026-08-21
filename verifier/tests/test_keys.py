from __future__ import annotations

from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from secureqr_verifier import DirectoryKeyResolver, KeyResolutionError
from secureqr_verifier.keys import derive_key_id


def _public_pem(public_key: ec.EllipticCurvePublicKey) -> bytes:
    return public_key.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def test_rejects_unknown_key(tmp_path: Path) -> None:
    with pytest.raises(KeyResolutionError):
        DirectoryKeyResolver(tmp_path).resolve("YWFhYWFhYWFhYWFhYWFhYQ")


def test_rejects_noncanonical_key_id_before_building_a_path(tmp_path: Path) -> None:
    with pytest.raises(KeyResolutionError):
        DirectoryKeyResolver(tmp_path).resolve("../issuer-private")


def test_rejects_file_whose_name_does_not_match_key(tmp_path: Path) -> None:
    key = ec.generate_private_key(ec.SECP256R1()).public_key()
    wrong_id = "YWFhYWFhYWFhYWFhYWFhYQ"
    (tmp_path / f"{wrong_id}.pem").write_bytes(_public_pem(key))

    with pytest.raises(KeyResolutionError):
        DirectoryKeyResolver(tmp_path).resolve(wrong_id)


def test_rejects_curve_other_than_p256(tmp_path: Path) -> None:
    key = ec.generate_private_key(ec.SECP384R1()).public_key()
    key_id = derive_key_id(key)
    (tmp_path / f"{key_id}.pem").write_bytes(_public_pem(key))

    with pytest.raises(KeyResolutionError):
        DirectoryKeyResolver(tmp_path).resolve(key_id)
