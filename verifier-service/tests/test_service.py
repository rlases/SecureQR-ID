"""Arranque de producción con piezas reales: issuer, verifier, revocation, evidence-log."""

from __future__ import annotations

import shutil
import time
from dataclasses import dataclass, replace
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from fastapi.testclient import TestClient
from secureqr_evidence_log.evidence_log import EvidenceLog
from secureqr_issuer import Issuer, create_credential_id, create_key_pair
from secureqr_revocation.revocation import sign_revocation_list
from secureqr_verifier.keys import derive_key_id
from secureqr_verifier_service import (
    ServiceConfig,
    StartupError,
    create_app_from_environment,
    create_service_app,
)
from secureqr_verifier_service.service import REQUIRED_VARIABLES

NOW = 1_800_000_000
PASSWORD = "test-only-password"
DAY = 24 * 3600


@dataclass
class Deployment:
    root: Path
    issuer_private: Path
    issuer_kid: str
    revocation_private: Path
    revocation_kid: str
    config: ServiceConfig

    def issue(self, credential_id: str, *, private: Path | None = None) -> str:
        issuer = Issuer(private or self.issuer_private, PASSWORD, 120, clock=lambda: NOW)
        return issuer.issue_token(credential_id)

    def write_list(
        self,
        revoked: list[str],
        *,
        private: Path | None = None,
        issued_at: int = NOW - 60,
    ) -> None:
        key_path = private or self.revocation_private
        private_key = serialization.load_pem_private_key(
            key_path.read_bytes(), PASSWORD.encode()
        )
        kid = derive_key_id(private_key.public_key())
        self.config.revocation_list_path.write_bytes(
            sign_revocation_list(private_key, kid, revoked, issued_at)
        )

    def environment(self) -> dict[str, str]:
        c = self.config
        return {
            "SQRID_VERIFIER_ID": c.verifier_id,
            "SQRID_TRUSTED_KEYS_DIR": str(c.trusted_keys_dir),
            "SQRID_REVOCATION_KEYS_DIR": str(c.revocation_keys_dir),
            "SQRID_REVOCATION_LIST_PATH": str(c.revocation_list_path),
            "SQRID_REPLAY_DB_PATH": str(c.replay_db_path),
            "SQRID_EVIDENCE_DB_PATH": str(c.evidence_db_path),
            "SQRID_CLOCK_SKEW_SECONDS": str(c.clock_skew_seconds),
            "SQRID_REVOCATION_MAX_AGE_SECONDS": str(c.revocation_max_age_seconds),
            "SQRID_REVOCATION_REFRESH_SECONDS": str(c.revocation_refresh_seconds),
        }


def _key_pair(private_dir: Path, public_dir: Path, name: str) -> tuple[Path, str]:
    private_path = private_dir / f"{name}-private.pem"
    temporary_public = private_dir / f"{name}-public.pem"
    metadata = create_key_pair(private_path, temporary_public, PASSWORD)
    public_dir.mkdir(exist_ok=True)
    temporary_public.replace(public_dir / f"{metadata.kid}.pem")
    return private_path, metadata.kid


@pytest.fixture
def deployment(tmp_path: Path) -> Deployment:
    secrets = tmp_path / "secrets"
    secrets.mkdir()
    issuer_private, issuer_kid = _key_pair(secrets, tmp_path / "trusted-keys", "issuer")
    revocation_private, revocation_kid = _key_pair(
        secrets, tmp_path / "revocation-keys", "revocation"
    )
    config = ServiceConfig(
        verifier_id="ccav-pitalito-porteria-1",
        trusted_keys_dir=tmp_path / "trusted-keys",
        revocation_keys_dir=tmp_path / "revocation-keys",
        revocation_list_path=tmp_path / "revocation.sqrid",
        replay_db_path=tmp_path / "state" / "replay.sqlite3",
        evidence_db_path=tmp_path / "state" / "evidence.sqlite3",
        clock_skew_seconds=30,
        revocation_max_age_seconds=DAY,
        revocation_refresh_seconds=30,
    )
    result = Deployment(
        tmp_path, issuer_private, issuer_kid, revocation_private, revocation_kid, config
    )
    result.write_list([])
    return result


def _client(deployment: Deployment, config: ServiceConfig | None = None) -> TestClient:
    return TestClient(create_service_app(config or deployment.config, clock=lambda: NOW))


def _verify(client: TestClient, token: str) -> dict[str, object]:
    return client.post("/api/verify", json={"token": token}).json()


def _events(deployment: Deployment) -> tuple:
    log = EvidenceLog(str(deployment.config.evidence_db_path))
    try:
        assert log.verify_chain() is True
        return log.events
    finally:
        log.close()


ACCEPTED = {"accepted": True, "message": "Token aceptado."}
REJECTED = {"accepted": False, "message": "Token rechazado."}


def test_accepted_token_is_recorded_end_to_end(deployment: Deployment) -> None:
    credential_id = create_credential_id()

    assert _verify(_client(deployment), deployment.issue(credential_id)) == ACCEPTED

    events = _events(deployment)
    assert len(events) == 1
    assert events[0].credential_id == credential_id
    assert events[0].verifier_id == "ccav-pitalito-porteria-1"


def test_real_revocation_list_rejects_revoked_credential(deployment: Deployment) -> None:
    revoked = create_credential_id()
    deployment.write_list([revoked])
    client = _client(deployment)

    assert _verify(client, deployment.issue(revoked)) == REJECTED
    assert _verify(client, deployment.issue(create_credential_id())) == ACCEPTED
    assert len(_events(deployment)) == 1


def test_token_signed_with_revocation_key_is_rejected(deployment: Deployment) -> None:
    token = deployment.issue(
        create_credential_id(), private=deployment.revocation_private
    )

    assert _verify(_client(deployment), token) == REJECTED
    assert _events(deployment) == ()


def test_factory_reads_configuration_from_environment(
    deployment: Deployment, monkeypatch: pytest.MonkeyPatch
) -> None:
    # La fábrica usa el reloj real: la lista debe estar fechada ahora, no en NOW.
    deployment.write_list([], issued_at=int(time.time()) - 60)
    for name, value in deployment.environment().items():
        monkeypatch.setenv(name, value)

    response = TestClient(create_app_from_environment()).get("/api/health")

    assert response.json() == {"status": "ready"}


def test_every_variable_is_required(deployment: Deployment) -> None:
    for name in REQUIRED_VARIABLES:
        environment = deployment.environment()
        environment[name] = "  "
        with pytest.raises(StartupError, match=name):
            ServiceConfig.from_environment(environment)


@pytest.mark.parametrize("skew", ["-1", "61", "30.5", "treinta", "1e1"])
def test_clock_skew_must_be_an_integer_in_range(deployment: Deployment, skew: str) -> None:
    environment = deployment.environment()
    environment["SQRID_CLOCK_SKEW_SECONDS"] = skew

    with pytest.raises(StartupError, match="SQRID_CLOCK_SKEW_SECONDS"):
        ServiceConfig.from_environment(environment)


def test_missing_revocation_list_prevents_startup(deployment: Deployment) -> None:
    deployment.config.revocation_list_path.unlink()

    with pytest.raises(StartupError, match="lista de revocación"):
        _client(deployment)


def test_tampered_revocation_list_prevents_startup(deployment: Deployment) -> None:
    path = deployment.config.revocation_list_path
    data = bytearray(path.read_bytes())
    data[-5] ^= 0xFF
    path.write_bytes(bytes(data))

    with pytest.raises(StartupError, match="lista de revocación"):
        _client(deployment)


def test_list_signed_by_unknown_key_prevents_startup(
    deployment: Deployment, tmp_path: Path
) -> None:
    rogue_private, _ = _key_pair(tmp_path / "secrets", tmp_path / "rogue-keys", "rogue")
    deployment.write_list([], private=rogue_private)

    with pytest.raises(StartupError, match="lista de revocación"):
        _client(deployment)


def test_list_signed_by_issuer_key_prevents_startup(deployment: Deployment) -> None:
    deployment.write_list([], private=deployment.issuer_private)

    with pytest.raises(StartupError, match="lista de revocación"):
        _client(deployment)


def test_shared_key_directories_prevent_startup(deployment: Deployment) -> None:
    config = replace(deployment.config, revocation_keys_dir=deployment.config.trusted_keys_dir)

    with pytest.raises(StartupError, match="distinto"):
        _client(deployment, config)


def test_revocation_key_trusted_for_tokens_prevents_startup(
    deployment: Deployment,
) -> None:
    name = f"{deployment.revocation_kid}.pem"
    shutil.copy(
        deployment.config.revocation_keys_dir / name,
        deployment.config.trusted_keys_dir / name,
    )

    with pytest.raises(StartupError, match="deben ser distintas"):
        _client(deployment)


def test_missing_key_directory_prevents_startup(deployment: Deployment) -> None:
    shutil.rmtree(deployment.config.revocation_keys_dir)

    with pytest.raises(StartupError, match="directorios"):
        _client(deployment)


@pytest.mark.parametrize("evidence", [":memory:", "replay"])
def test_evidence_log_must_be_its_own_file(deployment: Deployment, evidence: str) -> None:
    path = deployment.config.replay_db_path if evidence == "replay" else Path(evidence)
    config = replace(deployment.config, evidence_db_path=path)

    with pytest.raises(StartupError, match="SQRID_EVIDENCE_DB_PATH"):
        _client(deployment, config)


def test_broken_evidence_chain_prevents_startup(deployment: Deployment) -> None:
    _verify(_client(deployment), deployment.issue(create_credential_id()))
    log = EvidenceLog(str(deployment.config.evidence_db_path))
    # Quien edita el archivo puede quitar el disparador de solo agregar (ADR-0017),
    # pero no recalcular el hash sin que verify_chain() lo detecte.
    log._conn.execute("DROP TRIGGER events_no_update")
    log._conn.execute("UPDATE events SET verifier_id = 'otro' WHERE seq = 1")
    log.close()

    with pytest.raises(StartupError, match="verify_chain"):
        _client(deployment)


@pytest.mark.parametrize("verifier_id", [" porteria", "porteria\n1", "x" * 129])
def test_invalid_verifier_id_prevents_startup(
    deployment: Deployment, verifier_id: str
) -> None:
    config = replace(deployment.config, verifier_id=verifier_id)

    with pytest.raises(StartupError, match="SQRID_VERIFIER_ID"):
        _client(deployment, config)


def test_state_survives_restart(deployment: Deployment) -> None:
    token = deployment.issue(create_credential_id())
    assert _verify(_client(deployment), token) == ACCEPTED

    restarted = _client(deployment)

    assert _verify(restarted, token) == REJECTED
    assert _verify(restarted, deployment.issue(create_credential_id())) == ACCEPTED
    events = _events(deployment)
    assert len(events) == 2
    assert events[1].previous_hash == events[0].hash
