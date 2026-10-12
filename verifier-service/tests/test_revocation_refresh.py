"""Recarga en caliente, antigüedad máxima y sincronización de la lista (ADR-0015)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from secureqr_issuer import Issuer, create_credential_id
from secureqr_verifier_service import ServiceConfig, StartupError, create_service_app
from secureqr_verifier_service.service import RevocationLoader
from secureqr_verifier_service.sync import (
    UNCHANGED,
    UPDATED,
    SyncError,
    main,
    sync_revocation_list,
)

from test_service import (  # noqa: F401  (deployment es un fixture)
    ACCEPTED,
    DAY,
    NOW,
    PASSWORD,
    REJECTED,
    Deployment,
    _events,
    _verify,
    deployment,
)


class Clock:
    def __init__(self, now: int = NOW) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def _client(deployment: Deployment, clock: Clock) -> TestClient:
    return TestClient(create_service_app(deployment.config, clock=clock))


def _signed_list(deployment: Deployment, revoked: list[str], issued_at: int) -> bytes:
    path = deployment.config.revocation_list_path
    original = path.read_bytes()
    deployment.write_list(revoked, issued_at=issued_at)
    data = path.read_bytes()
    path.write_bytes(original)
    return data


def _loader(deployment: Deployment) -> RevocationLoader:
    return RevocationLoader(
        deployment.config.revocation_keys_dir, deployment.config.trusted_keys_dir
    )


def test_new_list_applies_without_restart(deployment: Deployment) -> None:
    clock = Clock()
    client = _client(deployment, clock)
    credential = create_credential_id()
    assert _verify(client, deployment.issue(credential)) == ACCEPTED

    deployment.write_list([credential], issued_at=NOW)
    clock.now += 30

    assert _verify(client, deployment.issue(credential)) == REJECTED
    assert len(_events(deployment)) == 1


def _token_at(deployment: Deployment, now: int) -> str:
    issuer = Issuer(deployment.issuer_private, PASSWORD, 120, clock=lambda: now)
    return issuer.issue_token(create_credential_id())


def test_stale_list_rejects_everything_and_recovers(deployment: Deployment) -> None:
    clock = Clock()
    client = _client(deployment, clock)

    clock.now = NOW - 60 + DAY + 1
    assert _verify(client, _token_at(deployment, clock.now)) == REJECTED

    deployment.write_list([], issued_at=clock.now)
    clock.now += 30
    assert _verify(client, _token_at(deployment, clock.now)) == ACCEPTED


def test_service_starts_with_a_stale_list(deployment: Deployment) -> None:
    deployment.write_list([], issued_at=NOW - 2 * DAY)

    client = _client(deployment, Clock())

    assert client.get("/api/health").json() == {"status": "ready"}
    assert _verify(client, deployment.issue(create_credential_id())) == REJECTED


def test_future_dated_list_prevents_startup(deployment: Deployment) -> None:
    deployment.write_list([], issued_at=NOW + 3600)

    with pytest.raises(StartupError, match="fecha futura"):
        _client(deployment, Clock())


def test_rolled_back_list_is_ignored(deployment: Deployment) -> None:
    clock = Clock()
    credential = create_credential_id()
    deployment.write_list([credential], issued_at=NOW)
    client = _client(deployment, clock)

    deployment.write_list([], issued_at=NOW - 3600)
    clock.now += 30

    assert _verify(client, deployment.issue(credential)) == REJECTED


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("SQRID_REVOCATION_MAX_AGE_SECONDS", "59"),
        ("SQRID_REVOCATION_MAX_AGE_SECONDS", str(30 * DAY + 1)),
        ("SQRID_REVOCATION_REFRESH_SECONDS", "0"),
        ("SQRID_REVOCATION_REFRESH_SECONDS", "3601"),
        ("SQRID_REVOCATION_REFRESH_SECONDS", "dos"),
    ],
)
def test_revocation_timing_must_be_in_range(
    deployment: Deployment, name: str, value: str
) -> None:
    environment = deployment.environment()
    environment[name] = value

    with pytest.raises(StartupError, match=name):
        ServiceConfig.from_environment(environment)


def test_refresh_must_be_shorter_than_max_age(deployment: Deployment) -> None:
    environment = deployment.environment()
    environment["SQRID_REVOCATION_MAX_AGE_SECONDS"] = "120"
    environment["SQRID_REVOCATION_REFRESH_SECONDS"] = "120"

    with pytest.raises(StartupError, match="menor"):
        ServiceConfig.from_environment(environment)


# --- Sincronización -------------------------------------------------------------

URL = "https://revocacion.example.edu.co/lista.sqrid"


def test_sync_installs_a_newer_list(deployment: Deployment) -> None:
    credential = create_credential_id()
    published = _signed_list(deployment, [credential], NOW)
    path = deployment.config.revocation_list_path

    result = sync_revocation_list(
        URL, path, _loader(deployment), 30, fetch=lambda url: published, clock=lambda: NOW
    )

    assert result == UPDATED
    assert path.read_bytes() == published
    assert [p.name for p in path.parent.iterdir() if p.name.startswith(".")] == []


def test_sync_keeps_current_file_when_published_list_is_older(
    deployment: Deployment,
) -> None:
    path = deployment.config.revocation_list_path
    older = _signed_list(deployment, [], NOW - 3600)
    before = path.read_bytes()

    result = sync_revocation_list(
        URL, path, _loader(deployment), 30, fetch=lambda url: older, clock=lambda: NOW
    )

    assert result == UNCHANGED
    assert path.read_bytes() == before


@pytest.mark.parametrize("published", [b"basura", b""])
def test_sync_rejects_invalid_list_without_touching_disk(
    deployment: Deployment, published: bytes
) -> None:
    path = deployment.config.revocation_list_path
    before = path.read_bytes()

    with pytest.raises(SyncError):
        sync_revocation_list(
            URL, path, _loader(deployment), 30, fetch=lambda url: published
        )

    assert path.read_bytes() == before


def test_sync_rejects_list_signed_by_issuer_key(deployment: Deployment) -> None:
    path = deployment.config.revocation_list_path
    before = path.read_bytes()
    deployment.write_list([], private=deployment.issuer_private, issued_at=NOW)
    forged = path.read_bytes()
    path.write_bytes(before)

    with pytest.raises(SyncError):
        sync_revocation_list(
            URL, path, _loader(deployment), 30, fetch=lambda url: forged, clock=lambda: NOW
        )
    assert path.read_bytes() == before


def test_sync_rejects_future_dated_list(deployment: Deployment) -> None:
    published = _signed_list(deployment, [], NOW + 3600)

    with pytest.raises(SyncError):
        sync_revocation_list(
            URL,
            deployment.config.revocation_list_path,
            _loader(deployment),
            30,
            fetch=lambda url: published,
            clock=lambda: NOW,
        )


def test_sync_recovers_a_missing_or_corrupt_local_file(deployment: Deployment) -> None:
    published = _signed_list(deployment, [], NOW)
    path = deployment.config.revocation_list_path
    path.write_bytes(b"corrupto")

    result = sync_revocation_list(
        URL, path, _loader(deployment), 30, fetch=lambda url: published, clock=lambda: NOW
    )

    assert result == UPDATED
    assert path.read_bytes() == published


@pytest.mark.parametrize(
    "url", ["http://revocacion.example.edu.co/lista", "file:///etc/passwd", "https://"]
)
def test_sync_requires_https(deployment: Deployment, url: str) -> None:
    def never(url: str) -> bytes:
        raise AssertionError("No debe descargar")

    with pytest.raises(SyncError, match="https"):
        sync_revocation_list(
            url, deployment.config.revocation_list_path, _loader(deployment), 30, fetch=never
        )


def test_sync_network_failure_leaves_file_intact(deployment: Deployment) -> None:
    path = deployment.config.revocation_list_path
    before = path.read_bytes()

    def offline(url: str) -> bytes:
        raise SyncError("No se pudo descargar la lista de revocación.")

    with pytest.raises(SyncError):
        sync_revocation_list(URL, path, _loader(deployment), 30, fetch=offline)
    assert path.read_bytes() == before


def test_sync_command_reports_through_exit_code(
    deployment: Deployment, capsys: pytest.CaptureFixture[str]
) -> None:
    import time

    now = int(time.time())  # main usa el reloj real
    deployment.write_list([], issued_at=now - 3600)
    published = _signed_list(deployment, [], now)
    environment = deployment.environment()
    environment["SQRID_REVOCATION_URL"] = URL

    assert main(environment, fetch=lambda url: published) == 0
    assert "updated" in capsys.readouterr().out

    del environment["SQRID_REVOCATION_URL"]
    assert main(environment, fetch=lambda url: published) == 1
    assert "SQRID_REVOCATION_URL" in capsys.readouterr().err


def test_synced_list_is_picked_up_by_running_service(deployment: Deployment) -> None:
    clock = Clock()
    client = _client(deployment, clock)
    credential = create_credential_id()
    published = _signed_list(deployment, [credential], NOW)

    sync_revocation_list(
        URL,
        deployment.config.revocation_list_path,
        _loader(deployment),
        30,
        fetch=lambda url: published,
        clock=lambda: NOW,
    )
    clock.now += 30

    assert _verify(client, deployment.issue(credential)) == REJECTED
