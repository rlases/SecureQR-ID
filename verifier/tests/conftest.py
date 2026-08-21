from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest
from secureqr_issuer import Issuer, create_credential_id, create_key_pair

NOW = 1_800_000_000
KEY_PASSWORD = "test-only-password"


@dataclass(frozen=True)
class IssuerEnvironment:
    private_key_path: Path
    trusted_keys_path: Path
    key_id: str
    credential_id: str

    def issue(
        self,
        *,
        issued_at: int = NOW,
        ttl_seconds: int = 120,
        credential_id: str | None = None,
    ) -> str:
        issuer = Issuer(
            self.private_key_path,
            KEY_PASSWORD,
            ttl_seconds,
            clock=lambda: issued_at,
        )
        return issuer.issue_token(credential_id or self.credential_id)


@pytest.fixture
def issuer_environment(tmp_path: Path) -> IssuerEnvironment:
    private_key_path = tmp_path / "issuer-private.pem"
    temporary_public_path = tmp_path / "issuer-public.pem"
    metadata = create_key_pair(
        private_key_path,
        temporary_public_path,
        KEY_PASSWORD,
    )
    trusted_keys_path = tmp_path / "trusted-keys"
    trusted_keys_path.mkdir()
    temporary_public_path.replace(trusted_keys_path / f"{metadata.kid}.pem")
    return IssuerEnvironment(
        private_key_path=private_key_path,
        trusted_keys_path=trusted_keys_path,
        key_id=metadata.kid,
        credential_id=create_credential_id(),
    )
