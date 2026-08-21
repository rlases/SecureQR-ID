from __future__ import annotations

import base64
import secrets
from pathlib import Path

import cbor2

from secureqr_issuer._encoding import decode_identifier
from secureqr_issuer.cli import main


def test_generate_cid_command(capsys) -> None:
    assert main(["generate-cid"]) == 0

    credential_id = capsys.readouterr().out.strip()
    assert len(decode_identifier(credential_id)) == 16


def test_cli_generates_keys_and_issues_token(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    private_path = tmp_path / "private.pem"
    public_path = tmp_path / "public.pem"
    password = secrets.token_urlsafe(24)
    monkeypatch.setenv("SQRID_PRIVATE_KEY_PATH", str(private_path))
    monkeypatch.setenv("SQRID_PUBLIC_KEY_PATH", str(public_path))
    monkeypatch.setenv("SQRID_PRIVATE_KEY_PASSWORD", password)
    monkeypatch.setenv("SQRID_TOKEN_TTL_SECONDS", "75")

    assert main(["generate-key"]) == 0
    key_output = capsys.readouterr().out.strip()
    assert key_output.startswith("kid=")

    assert main(["generate-cid"]) == 0
    credential_id = capsys.readouterr().out.strip()
    assert main(["issue", "--cid", credential_id]) == 0
    token = capsys.readouterr().out.strip()
    raw_token = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
    fields = cbor2.loads(raw_token)

    assert fields["kid"] == key_output.removeprefix("kid=")
    assert fields["cid"] == credential_id
    assert fields["exp"] - fields["iat"] == 75


def test_cli_reports_missing_configuration_without_values(monkeypatch, capsys) -> None:
    for name in (
        "SQRID_PRIVATE_KEY_PATH",
        "SQRID_PRIVATE_KEY_PASSWORD",
        "SQRID_TOKEN_TTL_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)

    assert main(["issue", "--cid", create_valid_cid()]) == 2
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "Error: Falta la variable de entorno SQRID_PRIVATE_KEY_PASSWORD.\n"


def create_valid_cid() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(16)).rstrip(b"=").decode("ascii")
