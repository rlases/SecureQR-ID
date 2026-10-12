"""Integracion verifier/ + evidence-log/ reales (issue #45, ADR-0013).

`evidence-log/` se instala solo como dependencia de prueba, igual que `issuer/`:
el paquete `secureqr_verifier` no lo importa.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest
from secureqr_issuer import create_credential_id
from fastapi.testclient import TestClient
from secureqr_evidence_log.evidence_log import GENESIS_HASH, EvidenceLog
from secureqr_verifier import (
    ConfigurationError,
    DirectoryKeyResolver,
    RecordingVerifier,
    SqliteReplayStore,
    VerificationResult,
    Verifier,
)
from secureqr_verifier.web import create_app

from conftest import NOW, IssuerEnvironment
from test_verifier import RevocationStatus, _invalid_signature

VERIFIER_ID = "ccav-pitalito-porteria-1"
EVENT_TIME = 1_800_000_000.25


def _verifier(
    environment: IssuerEnvironment, replay_path: Path, revoked: bool = False
) -> Verifier:
    return Verifier(
        DirectoryKeyResolver(environment.trusted_keys_path),
        SqliteReplayStore(replay_path),
        RevocationStatus(revoked),
        0,
        clock=lambda: NOW,
    )


def _recording(
    environment: IssuerEnvironment,
    tmp_path: Path,
    evidence_log: object,
    *,
    revoked: bool = False,
    logger: logging.Logger | None = None,
) -> RecordingVerifier:
    return RecordingVerifier(
        _verifier(environment, tmp_path / "replay.sqlite3", revoked),
        evidence_log,
        VERIFIER_ID,
        clock=lambda: EVENT_TIME,
        logger=logger,
    )


class FailingEvidenceLog:
    def __init__(self) -> None:
        self.calls = 0

    def append_event(self, *args: object) -> object:
        self.calls += 1
        raise OSError("disk full at /var/lib/secureqr-id/evidence.sqlite3")


class ExplodingVerifier:
    def verify(self, token: str) -> VerificationResult:
        raise RuntimeError("boom")


class SpyEvidenceLog:
    def __init__(self) -> None:
        self.events: list[tuple[object, ...]] = []

    def append_event(self, *args: object) -> object:
        self.events.append(args)
        return None


def test_accepted_validation_produces_a_chained_event(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    evidence_log = EvidenceLog(str(tmp_path / "evidence.sqlite3"))
    verifier = _recording(issuer_environment, tmp_path, evidence_log)

    first = verifier.verify(issuer_environment.issue())
    second_credential = create_credential_id()
    second = verifier.verify(issuer_environment.issue(credential_id=second_credential))

    assert first.accepted is True
    assert second.accepted is True
    events = evidence_log.events
    assert len(events) == 2
    assert events[0].credential_id == issuer_environment.credential_id
    assert events[0].verifier_id == VERIFIER_ID
    assert events[0].timestamp == EVENT_TIME
    assert events[0].decision == "aceptado"
    assert events[0].previous_hash == GENESIS_HASH
    assert events[1].credential_id == second_credential
    assert events[1].previous_hash == events[0].hash
    assert evidence_log.verify_chain() is True


def test_chain_survives_restart_and_keeps_growing(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    evidence_path = str(tmp_path / "evidence.sqlite3")
    first_log = EvidenceLog(evidence_path)
    _recording(issuer_environment, tmp_path, first_log).verify(
        issuer_environment.issue()
    )
    first_log.close()

    reopened = EvidenceLog(evidence_path)
    result = _recording(issuer_environment, tmp_path, reopened).verify(
        issuer_environment.issue(credential_id=create_credential_id())
    )

    assert result.accepted is True
    events = reopened.events
    assert len(events) == 2
    assert events[1].previous_hash == events[0].hash
    assert reopened.verify_chain() is True


@pytest.mark.parametrize("case", ["signature", "replay", "revoked", "garbage"])
def test_rejections_are_not_recorded(
    issuer_environment: IssuerEnvironment, tmp_path: Path, case: str
) -> None:
    evidence_log = EvidenceLog(str(tmp_path / "evidence.sqlite3"))
    verifier = _recording(
        issuer_environment, tmp_path, evidence_log, revoked=case == "revoked"
    )
    token = issuer_environment.issue()
    if case == "signature":
        token = _invalid_signature(token)
    elif case == "garbage":
        token = "no-es-un-token"
    elif case == "replay":
        assert verifier.verify(token).accepted is True

    result = verifier.verify(token)

    assert result == VerificationResult(False, None, "Token rechazado.")
    expected = 1 if case == "replay" else 0
    assert len(evidence_log.events) == expected
    assert evidence_log.verify_chain() is True


def test_evidence_failure_rejects_without_leaking_details(
    issuer_environment: IssuerEnvironment,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    failing_log = FailingEvidenceLog()
    logger = logging.getLogger("test.evidence")
    verifier = _recording(issuer_environment, tmp_path, failing_log, logger=logger)
    token = issuer_environment.issue()

    with caplog.at_level(logging.WARNING, logger="test.evidence"):
        result = verifier.verify(token)

    assert failing_log.calls == 1
    assert result == VerificationResult(False, None, "Token rechazado.")
    assert [r.reason_code for r in caplog.records] == ["evidence_log_unavailable"]
    logged = " ".join(r.getMessage() + str(r.__dict__) for r in caplog.records)
    assert issuer_environment.credential_id not in logged
    assert token not in logged
    assert "disk full" not in logged


def test_evidence_failure_burns_the_nonce(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    # Documenta la consecuencia elegida en ADR-0013: el nonce ya se consumio,
    # asi que reintentar el mismo token tras recuperar la bitacora se rechaza.
    token = issuer_environment.issue()
    _recording(issuer_environment, tmp_path, FailingEvidenceLog()).verify(token)

    evidence_log = EvidenceLog(str(tmp_path / "evidence.sqlite3"))
    retry = _recording(issuer_environment, tmp_path, evidence_log).verify(token)

    assert retry.accepted is False
    assert evidence_log.events == ()


def test_inner_verifier_failure_rejects_and_records_nothing() -> None:
    spy = SpyEvidenceLog()
    verifier = RecordingVerifier(ExplodingVerifier(), spy, VERIFIER_ID)

    assert verifier.verify("token").accepted is False
    assert spy.events == []


@pytest.mark.parametrize(
    "inner_result",
    [
        VerificationResult(True, None, "Token aceptado."),
        VerificationResult(True, "", "Token aceptado."),
        VerificationResult(True, "con\nsalto", "Token aceptado."),
        "accepted",
    ],
)
def test_malformed_acceptance_is_rejected(inner_result: object) -> None:
    class Stub:
        def verify(self, token: str) -> object:
            return inner_result

    spy = SpyEvidenceLog()
    verifier = RecordingVerifier(Stub(), spy, VERIFIER_ID)  # type: ignore[arg-type]

    assert verifier.verify("token") == VerificationResult(
        False, None, "Token rechazado."
    )
    assert spy.events == []


@pytest.mark.parametrize("clock_value", [float("nan"), float("inf"), -1.0, True, "1"])
def test_invalid_clock_rejects_and_records_nothing(clock_value: object) -> None:
    class Accepting:
        def verify(self, token: str) -> VerificationResult:
            return VerificationResult(True, "Y2lk", "Token aceptado.")

    spy = SpyEvidenceLog()
    verifier = RecordingVerifier(
        Accepting(), spy, VERIFIER_ID, clock=lambda: clock_value  # type: ignore[arg-type,return-value]
    )

    assert verifier.verify("token").accepted is False
    assert spy.events == []


@pytest.mark.parametrize(
    ("verifier", "recorder", "verifier_id"),
    [
        (None, SpyEvidenceLog(), VERIFIER_ID),
        (ExplodingVerifier(), None, VERIFIER_ID),
        (ExplodingVerifier(), SpyEvidenceLog(), ""),
        (ExplodingVerifier(), SpyEvidenceLog(), " porteria "),
        (ExplodingVerifier(), SpyEvidenceLog(), "porteria\n1"),
        (ExplodingVerifier(), SpyEvidenceLog(), "x" * 129),
        (ExplodingVerifier(), SpyEvidenceLog(), None),
        (ExplodingVerifier(), SpyEvidenceLog(), 1),
    ],
)
def test_configuration_is_explicit(
    verifier: object, recorder: object, verifier_id: object
) -> None:
    with pytest.raises(ConfigurationError):
        RecordingVerifier(verifier, recorder, verifier_id)  # type: ignore[arg-type]


def test_http_adapter_records_acceptance_without_exposing_it(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    evidence_log = EvidenceLog(str(tmp_path / "evidence.sqlite3"))
    client = TestClient(
        create_app(_recording(issuer_environment, tmp_path, evidence_log))
    )

    response = client.post("/api/verify", json={"token": issuer_environment.issue()})

    assert response.status_code == 200
    assert response.json() == {"accepted": True, "message": "Token aceptado."}
    assert issuer_environment.credential_id not in response.text
    assert len(evidence_log.events) == 1
    assert evidence_log.verify_chain() is True


def test_http_adapter_rejects_when_evidence_is_unavailable(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    client = TestClient(
        create_app(_recording(issuer_environment, tmp_path, FailingEvidenceLog()))
    )

    response = client.post("/api/verify", json={"token": issuer_environment.issue()})

    assert response.json() == {"accepted": False, "message": "Token rechazado."}


def test_concurrent_acceptances_share_one_linear_chain(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    workers = 6
    evidence_log = EvidenceLog(str(tmp_path / "evidence.sqlite3"))
    tokens = [
        issuer_environment.issue(credential_id=create_credential_id())
        for _ in range(workers)
    ]
    barrier = Barrier(workers)

    def verify(index: int) -> bool:
        verifier = RecordingVerifier(
            _verifier(issuer_environment, tmp_path / "replay.sqlite3"),
            evidence_log,
            VERIFIER_ID,
            clock=lambda: EVENT_TIME,
        )
        barrier.wait(timeout=5)
        return verifier.verify(tokens[index]).accepted

    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(verify, range(workers)))

    assert results == [True] * workers
    events = evidence_log.events
    assert len(events) == workers
    assert len({e.previous_hash for e in events}) == workers
    assert evidence_log.verify_chain() is True
