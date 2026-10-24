"""La lista firmada con `secureqr-revocation sign` la acepta el verificador real (#81)."""

from __future__ import annotations

from secureqr_issuer import create_credential_id
from secureqr_revocation.cli import PASSWORD_ENV
from secureqr_revocation.cli import main as revocation_cli

from test_revocation_refresh import Clock, _client
from test_service import (  # noqa: F401  (deployment es un fixture)
    ACCEPTED,
    NOW,
    PASSWORD,
    REJECTED,
    Deployment,
    _verify,
    deployment,
)


def _sign(deployment: Deployment, revoked: list[str], now: int, *, private=None) -> int:
    source = deployment.root / "revocados.txt"
    source.write_text("\n".join(revoked) + "\n", encoding="utf-8")
    return revocation_cli(
        [
            "sign",
            "--key", str(private or deployment.revocation_private),
            "--input", str(source),
            "--output", str(deployment.config.revocation_list_path),
        ],
        environ={PASSWORD_ENV: PASSWORD},
        interactive=False,
        clock=lambda: now,
    )


def test_cli_list_is_accepted_and_enforced(deployment: Deployment) -> None:
    revoked = create_credential_id()
    assert _sign(deployment, [revoked], NOW - 60) == 0

    client = _client(deployment, Clock())

    assert _verify(client, deployment.issue(revoked)) == REJECTED
    assert _verify(client, deployment.issue(create_credential_id())) == ACCEPTED


def test_daily_resign_is_picked_up_without_restart(deployment: Deployment) -> None:
    assert _sign(deployment, [], NOW - 60) == 0
    clock = Clock()
    client = _client(deployment, clock)
    credential = create_credential_id()
    assert _verify(client, deployment.issue(credential)) == ACCEPTED

    assert _sign(deployment, [credential], NOW) == 0
    clock.now += 30

    assert _verify(client, deployment.issue(credential)) == REJECTED


def test_cli_refuses_to_replace_the_list_with_another_key(deployment: Deployment) -> None:
    # Firmar por error con la clave de emisión dejaría al verificador sin arrancar tras
    # un reinicio (ADR-0014): el comando no reemplaza la lista vigente.
    before = deployment.config.revocation_list_path.read_bytes()

    code = _sign(deployment, [], NOW, private=deployment.issuer_private)

    assert code == 2
    assert deployment.config.revocation_list_path.read_bytes() == before
    assert _verify(_client(deployment, Clock()), deployment.issue(create_credential_id())) == ACCEPTED
