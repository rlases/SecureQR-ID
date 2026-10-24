import base64
import os
import secrets
import stat

import pytest

from secureqr_revocation.cli import PASSWORD_ENV, main
from secureqr_revocation.revocation import RevocationList, read_key_id
from cryptography.hazmat.primitives import serialization

PASSWORD = "contrasena-de-prueba-larga"
NOW = 1_800_000_000


def _cid():
    return base64.urlsafe_b64encode(secrets.token_bytes(16)).rstrip(b"=").decode("ascii")


def _run(argv, *, password=PASSWORD, prompt=None, interactive=False, now=NOW):
    environ = {PASSWORD_ENV: password} if password is not None else {}
    return main(
        argv,
        environ=environ,
        prompt=prompt or (lambda _: pytest.fail("no debe pedir contraseña")),
        interactive=interactive,
        clock=lambda: now,
    )


@pytest.fixture
def keys(tmp_path):
    private = tmp_path / "secretos" / "revocacion.pem"
    public_dir = tmp_path / "claves-revocacion"
    assert _run(["generate-key", "--private-key", str(private), "--public-dir", str(public_dir)]) == 0
    (public_file,) = public_dir.iterdir()
    public_key = serialization.load_pem_public_key(public_file.read_bytes())
    return private, public_dir, public_file.stem, public_key


def _sign(keys, tmp_path, lines, **kwargs):
    private, _, _, _ = keys
    source = tmp_path / "revocados.txt"
    source.write_text("\n".join(lines) + "\n", encoding="utf-8")
    output = tmp_path / "publicar" / "lista.sqrid"
    code = _run(["sign", "--key", str(private), "--input", str(source), "--output", str(output)], **kwargs)
    return code, output


def test_genera_par_con_permisos_y_nombre_por_kid(keys, capsys):
    private, public_dir, kid, _ = keys

    assert stat.S_IMODE(private.stat().st_mode) == 0o600
    assert (public_dir / f"{kid}.pem").exists()
    assert b"ENCRYPTED PRIVATE KEY" in private.read_bytes()


def test_no_sobrescribe_una_clave_existente(keys, capsys):
    private, public_dir, _, _ = keys
    before = private.read_bytes()

    code = _run(["generate-key", "--private-key", str(private), "--public-dir", str(public_dir)])

    assert code == 2
    assert private.read_bytes() == before
    assert "No se sobrescribe" in capsys.readouterr().err


def test_firma_una_lista_verificable_con_iat_actual(keys, tmp_path, capsys):
    _, _, kid, public_key = keys
    revoked = [_cid(), _cid()]

    code, output = _sign(keys, tmp_path, ["# exportado por mi-app-qr", "", *revoked])

    assert code == 0
    signed = output.read_bytes()
    assert read_key_id(signed) == kid
    lista = RevocationList.from_signed_bytes(signed, public_key, expected_key_id=kid)
    assert lista.issued_at == NOW
    assert all(lista.is_revoked(cid) for cid in revoked)
    assert not lista.is_revoked(_cid())
    assert f"kid={kid} iat={NOW} revocados=2" in capsys.readouterr().out


def test_lista_vacia_sirve_para_el_refirmado_diario(keys, tmp_path):
    _, _, kid, public_key = keys

    code, output = _sign(keys, tmp_path, [])

    assert code == 0
    lista = RevocationList.from_signed_bytes(output.read_bytes(), public_key, expected_key_id=kid)
    assert lista.issued_at == NOW


def test_refirmar_reemplaza_la_lista_y_avanza_iat(keys, tmp_path):
    _, _, kid, public_key = keys
    cid = _cid()
    _sign(keys, tmp_path, [cid], now=NOW)

    code, output = _sign(keys, tmp_path, [cid], now=NOW + 86_400)

    assert code == 0
    lista = RevocationList.from_signed_bytes(output.read_bytes(), public_key, expected_key_id=kid)
    assert lista.issued_at == NOW + 86_400
    assert [p.name for p in output.parent.iterdir()] == ["lista.sqrid"]


def test_descarta_duplicados_y_lo_informa(keys, tmp_path, capsys):
    cid = _cid()

    code, _ = _sign(keys, tmp_path, [cid, cid, cid])

    assert code == 0
    assert "revocados=1 duplicados_descartados=2" in capsys.readouterr().out


@pytest.mark.parametrize("bad", ["corto", "a" * 22 + "=", "+" * 22, "A" * 23, "AAAAAAAAAAAAAAAAAAAAAB"])
def test_cid_mal_formado_detiene_todo_sin_mostrarlo(keys, tmp_path, capsys, bad):
    code, output = _sign(keys, tmp_path, [_cid(), bad])

    assert code == 2
    assert not output.exists()
    err = capsys.readouterr().err
    assert "Línea 2" in err
    assert bad not in err


def test_contrasena_incorrecta_no_filtra_nada(keys, tmp_path, capsys):
    wrong = "otra-contrasena-equivocada"

    code, output = _sign(keys, tmp_path, [_cid()], password=wrong)

    assert code == 2
    assert not output.exists()
    captured = capsys.readouterr()
    assert "contraseña incorrecta" in captured.err
    assert wrong not in captured.err + captured.out
    assert PASSWORD not in captured.err + captured.out


def test_contrasena_corta_se_rechaza(tmp_path, capsys):
    code = _run(
        ["generate-key", "--private-key", str(tmp_path / "k.pem"), "--public-dir", str(tmp_path / "pub")],
        password="corta",
    )

    assert code == 2
    assert not (tmp_path / "k.pem").exists()
    assert "16 bytes" in capsys.readouterr().err


def test_sin_terminal_ni_variable_no_pide_nada(keys, tmp_path, capsys):
    code, _ = _sign(keys, tmp_path, [_cid()], password=None, interactive=False)

    assert code == 2
    assert PASSWORD_ENV in capsys.readouterr().err


def test_en_terminal_pide_la_contrasena(keys, tmp_path):
    asked = []

    def prompt(text):
        asked.append(text)
        return PASSWORD

    code, _ = _sign(keys, tmp_path, [_cid()], password=None, prompt=prompt, interactive=True)

    assert code == 0
    assert len(asked) == 1


def test_generar_en_terminal_confirma_la_contrasena(tmp_path, capsys):
    answers = iter([PASSWORD, "otra-cosa-distinta-larga"])

    code = _run(
        ["generate-key", "--private-key", str(tmp_path / "k.pem"), "--public-dir", str(tmp_path / "pub")],
        password=None,
        prompt=lambda _: next(answers),
        interactive=True,
    )

    assert code == 2
    assert "no coinciden" in capsys.readouterr().err
    assert not (tmp_path / "k.pem").exists()


def test_la_contrasena_no_se_acepta_como_argumento(keys, tmp_path):
    private, _, _, _ = keys
    with pytest.raises(SystemExit):
        main(["sign", "--key", str(private), "--input", "x", "--output", "y", "--password", PASSWORD])


def test_la_salida_no_puede_pisar_la_entrada_ni_la_clave(keys, tmp_path, capsys):
    private, _, _, _ = keys
    source = tmp_path / "revocados.txt"
    source.write_text(_cid() + "\n", encoding="utf-8")
    key_before = private.read_bytes()

    for target in (source, private):
        code = _run(["sign", "--key", str(private), "--input", str(source), "--output", str(target)])
        assert code == 2
    assert private.read_bytes() == key_before


def test_clave_que_no_es_p256_se_rechaza(tmp_path, capsys):
    from cryptography.hazmat.primitives.asymmetric import ec

    other = ec.generate_private_key(ec.SECP384R1())
    path = tmp_path / "p384.pem"
    path.write_bytes(
        other.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.BestAvailableEncryption(PASSWORD.encode()),
        )
    )
    source = tmp_path / "revocados.txt"
    source.write_text("", encoding="utf-8")

    code = _run(["sign", "--key", str(path), "--input", str(source), "--output", str(tmp_path / "o")])

    assert code == 2
    assert "P-256" in capsys.readouterr().err


def test_se_puede_ejecutar_como_modulo(tmp_path):
    import subprocess
    import sys

    env = {**os.environ, PASSWORD_ENV: PASSWORD}
    result = subprocess.run(
        [sys.executable, "-m", "secureqr_revocation", "generate-key",
         "--private-key", str(tmp_path / "k.pem"), "--public-dir", str(tmp_path / "pub")],
        capture_output=True, text=True, env=env, stdin=subprocess.DEVNULL,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.startswith("kid=")


def test_no_reemplaza_una_lista_firmada_con_otra_clave(keys, tmp_path, capsys):
    _sign(keys, tmp_path, [_cid()])
    output = tmp_path / "publicar" / "lista.sqrid"
    before = output.read_bytes()
    other_private = tmp_path / "otra.pem"
    assert _run(["generate-key", "--private-key", str(other_private), "--public-dir", str(tmp_path / "otra-pub")]) == 0
    source = tmp_path / "revocados.txt"

    code = _run(["sign", "--key", str(other_private), "--input", str(source), "--output", str(output)])

    assert code == 2
    assert output.read_bytes() == before
    assert "--allow-key-change" in capsys.readouterr().err

    code = _run(["sign", "--key", str(other_private), "--input", str(source), "--output", str(output), "--allow-key-change"])

    assert code == 0
    assert read_key_id(output.read_bytes()) == (tmp_path / "otra-pub").iterdir().__next__().stem
