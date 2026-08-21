from __future__ import annotations

import base64
import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import cbor2
import pytest
from secureqr_issuer import Issuer, create_credential_id, create_key_pair
from secureqr_verifier import (
    ConfigurationError,
    DirectoryKeyResolver,
    SqliteReplayStore,
    Verifier,
)
from secureqr_verifier.verifier import P256_ORDER

from conftest import KEY_PASSWORD, NOW, IssuerEnvironment


class RevocationStatus:
    def __init__(self, value: object = False) -> None:
        self.value = value
        self.calls = 0

    def is_revoked(self, credential_id: str) -> object:
        self.calls += 1
        return self.value


class UnavailableRevocation:
    def is_revoked(self, credential_id: str) -> bool:
        raise ConnectionError


class BarrierRevocation:
    def __init__(self, barrier: Barrier) -> None:
        self._barrier = barrier

    def is_revoked(self, credential_id: str) -> bool:
        self._barrier.wait(timeout=5)
        return False


class BombReplayStore:
    def observe_time(self, now: int, clock_skew_seconds: int) -> bool:
        raise AssertionError("La firma invalida no debe alcanzar tiempo.")

    def has_seen(self, key_id: str, nonce: bytes, now: int) -> bool:
        raise AssertionError("La firma invalida no debe alcanzar replay.")

    def consume(
        self, key_id: str, nonce: bytes, valid_until: int, now: int
    ) -> bool:
        raise AssertionError("La firma invalida no debe consumir el nonce.")


class FailingReplayStore:
    def __init__(self, failure: str) -> None:
        self._failure = failure

    def observe_time(self, now: int, clock_skew_seconds: int) -> bool:
        if self._failure == "time":
            raise OSError
        return True

    def has_seen(self, key_id: str, nonce: bytes, now: int) -> bool:
        if self._failure == "nonce":
            raise OSError
        return False

    def consume(
        self, key_id: str, nonce: bytes, valid_until: int, now: int
    ) -> bool:
        if self._failure == "consume":
            raise OSError
        return True


class RecordingReplayStore:
    def __init__(self, database_path: Path, events: list[str]) -> None:
        self._delegate = SqliteReplayStore(database_path)
        self._events = events

    def observe_time(self, now: int, clock_skew_seconds: int) -> bool:
        self._events.append("time")
        return self._delegate.observe_time(now, clock_skew_seconds)

    def has_seen(self, key_id: str, nonce: bytes, now: int) -> bool:
        self._events.append("nonce")
        return self._delegate.has_seen(key_id, nonce, now)

    def consume(
        self, key_id: str, nonce: bytes, valid_until: int, now: int
    ) -> bool:
        self._events.append("consume")
        return self._delegate.consume(key_id, nonce, valid_until, now)


class RecordingRevocation:
    def __init__(self, events: list[str]) -> None:
        self._events = events

    def is_revoked(self, credential_id: str) -> bool:
        self._events.append("revocation")
        return False


def _decode_token(token: str) -> dict[str, object]:
    raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
    return cbor2.loads(raw)


def _encode_token(fields: dict[str, object]) -> str:
    raw = cbor2.dumps(fields, canonical=True)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _invalid_signature(token: str) -> str:
    fields = _decode_token(token)
    fields["sig"] = b"\x01" * 64
    return _encode_token(fields)


def _make_verifier(
    environment: IssuerEnvironment,
    database_path: Path,
    revocation_checker: object,
    *,
    now: int = NOW,
    clock_skew_seconds: int = 0,
) -> Verifier:
    return Verifier(
        DirectoryKeyResolver(environment.trusted_keys_path),
        SqliteReplayStore(database_path),
        revocation_checker,
        clock_skew_seconds,
        clock=lambda: now,
    )


def test_accepts_token_emitted_by_real_issuer(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    verifier = _make_verifier(
        issuer_environment,
        tmp_path / "replay.sqlite3",
        RevocationStatus(False),
    )

    result = verifier.verify(issuer_environment.issue())

    assert result.accepted is True
    assert result.credential_id == issuer_environment.credential_id
    assert result.message == "Token aceptado."


def test_invalid_signature_stops_the_validation_chain(
    issuer_environment: IssuerEnvironment,
) -> None:
    revocation = RevocationStatus(False)
    verifier = Verifier(
        DirectoryKeyResolver(issuer_environment.trusted_keys_path),
        BombReplayStore(),
        revocation,
        0,
        clock=lambda: NOW,
    )

    result = verifier.verify(_invalid_signature(issuer_environment.issue()))

    assert result.accepted is False
    assert revocation.calls == 0


def test_expired_token_is_rejected_before_nonce_and_revocation(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    events: list[str] = []
    verifier = Verifier(
        DirectoryKeyResolver(issuer_environment.trusted_keys_path),
        RecordingReplayStore(tmp_path / "replay.sqlite3", events),
        RecordingRevocation(events),
        0,
        clock=lambda: NOW,
    )

    result = verifier.verify(
        issuer_environment.issue(issued_at=NOW - 121, ttl_seconds=120)
    )

    assert result.accepted is False
    assert events == ["time"]


def test_second_use_is_rejected_and_survives_process_restart(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    database_path = tmp_path / "replay.sqlite3"
    token = issuer_environment.issue()
    first = _make_verifier(
        issuer_environment, database_path, RevocationStatus(False)
    )
    restarted = _make_verifier(
        issuer_environment, database_path, RevocationStatus(False)
    )

    assert first.verify(token).accepted is True
    assert restarted.verify(token).accepted is False


def test_revoked_token_is_rejected(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    verifier = _make_verifier(
        issuer_environment,
        tmp_path / "replay.sqlite3",
        RevocationStatus(True),
    )

    assert verifier.verify(issuer_environment.issue()).accepted is False


@pytest.mark.parametrize("revocation", [UnavailableRevocation(), RevocationStatus(None)])
def test_unavailable_or_invalid_revocation_fails_closed_without_consuming_nonce(
    issuer_environment: IssuerEnvironment,
    tmp_path: Path,
    revocation: object,
) -> None:
    database_path = tmp_path / "replay.sqlite3"
    token = issuer_environment.issue()
    unavailable = _make_verifier(issuer_environment, database_path, revocation)
    recovered = _make_verifier(
        issuer_environment, database_path, RevocationStatus(False)
    )

    assert unavailable.verify(token).accepted is False
    assert recovered.verify(token).accepted is True


def test_unknown_key_id_is_rejected(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    other_private = tmp_path / "other-private.pem"
    other_public = tmp_path / "other-public.pem"
    create_key_pair(other_private, other_public, KEY_PASSWORD)
    other_issuer = Issuer(other_private, KEY_PASSWORD, 120, clock=lambda: NOW)
    token = other_issuer.issue_token(create_credential_id())
    verifier = _make_verifier(
        issuer_environment,
        tmp_path / "replay.sqlite3",
        RevocationStatus(False),
    )

    assert verifier.verify(token).accepted is False


def test_high_s_signature_is_rejected_even_when_mathematically_valid(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    fields = _decode_token(issuer_environment.issue())
    signature = fields["sig"]
    assert isinstance(signature, bytes)
    r = int.from_bytes(signature[:32], "big")
    low_s = int.from_bytes(signature[32:], "big")
    fields["sig"] = r.to_bytes(32, "big") + (P256_ORDER - low_s).to_bytes(32, "big")
    verifier = _make_verifier(
        issuer_environment,
        tmp_path / "replay.sqlite3",
        RevocationStatus(False),
    )

    assert verifier.verify(_encode_token(fields)).accepted is False


def test_clock_skew_boundaries_are_explicit(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    at_future_limit = issuer_environment.issue(issued_at=NOW + 30)
    beyond_future_limit = issuer_environment.issue(issued_at=NOW + 31)
    accepted = _make_verifier(
        issuer_environment,
        tmp_path / "accepted.sqlite3",
        RevocationStatus(False),
        clock_skew_seconds=30,
    )
    rejected = _make_verifier(
        issuer_environment,
        tmp_path / "rejected.sqlite3",
        RevocationStatus(False),
        clock_skew_seconds=30,
    )

    assert accepted.verify(at_future_limit).accepted is True
    assert rejected.verify(beyond_future_limit).accepted is False


def test_expiration_at_skew_boundary_is_rejected(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    token = issuer_environment.issue(issued_at=NOW - 70, ttl_seconds=10)
    verifier = _make_verifier(
        issuer_environment,
        tmp_path / "replay.sqlite3",
        RevocationStatus(False),
        clock_skew_seconds=60,
    )

    assert verifier.verify(token).accepted is False


def test_clock_rollback_is_rejected_after_restart(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    database_path = tmp_path / "replay.sqlite3"
    first = _make_verifier(
        issuer_environment, database_path, RevocationStatus(False), now=NOW
    )
    restarted_with_old_clock = _make_verifier(
        issuer_environment,
        database_path,
        RevocationStatus(False),
        now=NOW - 100,
    )

    assert first.verify(issuer_environment.issue()).accepted is True
    old_token = issuer_environment.issue(issued_at=NOW - 100)
    assert restarted_with_old_clock.verify(old_token).accepted is False


def test_validation_order_is_signature_time_nonce_revocation_then_consume(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    events: list[str] = []
    verifier = Verifier(
        DirectoryKeyResolver(issuer_environment.trusted_keys_path),
        RecordingReplayStore(tmp_path / "replay.sqlite3", events),
        RecordingRevocation(events),
        0,
        clock=lambda: NOW,
    )

    assert verifier.verify(issuer_environment.issue()).accepted is True
    assert events == ["time", "nonce", "revocation", "consume"]


def test_concurrent_verifiers_accept_the_nonce_only_once(
    issuer_environment: IssuerEnvironment, tmp_path: Path
) -> None:
    database_path = tmp_path / "replay.sqlite3"
    token = issuer_environment.issue()
    barrier = Barrier(2)
    verifiers = [
        _make_verifier(
            issuer_environment,
            database_path,
            BarrierRevocation(barrier),
        )
        for _ in range(2)
    ]

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda verifier: verifier.verify(token), verifiers))

    assert sum(result.accepted for result in results) == 1


@pytest.mark.parametrize("failure", ["time", "nonce", "consume"])
def test_replay_storage_failure_rejects_at_every_stage(
    issuer_environment: IssuerEnvironment,
    failure: str,
) -> None:
    verifier = Verifier(
        DirectoryKeyResolver(issuer_environment.trusted_keys_path),
        FailingReplayStore(failure),
        RevocationStatus(False),
        0,
        clock=lambda: NOW,
    )

    assert verifier.verify(issuer_environment.issue()).accepted is False


@pytest.mark.parametrize("clock_skew_seconds", [-1, 61, True, 1.5, "5"])
def test_clock_skew_rejects_implicit_or_unsafe_values(
    issuer_environment: IssuerEnvironment,
    tmp_path: Path,
    clock_skew_seconds: object,
) -> None:
    with pytest.raises(ConfigurationError):
        Verifier(
            DirectoryKeyResolver(issuer_environment.trusted_keys_path),
            SqliteReplayStore(tmp_path / "replay.sqlite3"),
            RevocationStatus(False),
            clock_skew_seconds,  # type: ignore[arg-type]
        )


def test_rejections_are_generic_and_logs_do_not_expose_token_data(
    issuer_environment: IssuerEnvironment,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    token = issuer_environment.issue()
    verifier = _make_verifier(
        issuer_environment,
        tmp_path / "replay.sqlite3",
        RevocationStatus(False),
    )
    caplog.set_level(logging.WARNING)

    result = verifier.verify(_invalid_signature(token))

    assert result.accepted is False
    assert result.credential_id is None
    assert result.message == "Token rechazado."
    logged = " ".join(
        str(value)
        for record in caplog.records
        for value in record.__dict__.values()
    )
    assert token not in logged
    assert issuer_environment.credential_id not in logged
    assert issuer_environment.key_id not in logged
