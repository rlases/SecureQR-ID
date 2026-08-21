from __future__ import annotations

import secrets
from dataclasses import dataclass
from pathlib import Path

import pytest

from secureqr_issuer import Issuer, KeyMetadata, create_key_pair

FIXED_TIME = 1_787_200_000
TOKEN_TTL_SECONDS = 90


@dataclass(frozen=True)
class KeyMaterial:
    private_path: Path
    public_path: Path
    password: str
    metadata: KeyMetadata


@pytest.fixture
def key_material(tmp_path: Path) -> KeyMaterial:
    private_path = tmp_path / "issuer-private.pem"
    public_path = tmp_path / "issuer-public.pem"
    password = secrets.token_urlsafe(24)
    metadata = create_key_pair(private_path, public_path, password)
    return KeyMaterial(private_path, public_path, password, metadata)


@pytest.fixture
def issuer(key_material: KeyMaterial) -> Issuer:
    return Issuer(
        private_key_path=key_material.private_path,
        password=key_material.password,
        token_ttl_seconds=TOKEN_TTL_SECONDS,
        clock=lambda: FIXED_TIME,
    )
