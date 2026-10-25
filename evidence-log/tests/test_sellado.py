import subprocess

import pytest

from secureqr_evidence_log.cli import EXIT_ANCHOR_FAILED, EXIT_OK, EXIT_USAGE, main
from secureqr_evidence_log.sealing import (
    SealingError,
    normalize_block_hash,
    seal_block_hash,
    upgrade_pending,
)

H = "ab" * 32


class FakeOts:
    """Doble del cliente `ots`: stamp crea el .ots; upgrade deja la copia .bak."""

    def __init__(self, *, stamp_ok=True, upgrade_ok=True, raises=None):
        self.stamp_ok, self.upgrade_ok, self.raises = stamp_ok, upgrade_ok, raises
        self.calls = []

    def __call__(self, command, **kwargs):
        if self.raises:
            raise self.raises
        self.calls.append(command[1])
        target = command[2]
        ok = self.stamp_ok if command[1] == "stamp" else self.upgrade_ok
        if ok and command[1] == "stamp":
            open(target + ".ots", "wb").write(b"pendiente")
        if ok and command[1] == "upgrade":
            open(target + ".bak", "wb").write(b"pendiente")
        return subprocess.CompletedProcess(command, 0 if ok else 1, "", "")


def test_sella_y_completa(tmp_path):
    ots = FakeOts()
    r = seal_block_hash(H.upper(), tmp_path, runner=ots)
    assert (r.stamped, r.upgraded, r.pending) == (True, True, False)
    assert (tmp_path / f"bloque-{H}.txt").read_text().strip() == H
    assert (tmp_path / f"bloque-{H}.txt.ots").exists()
    assert ots.calls == ["stamp", "upgrade"]


def test_sin_red_queda_sin_comprobante_y_no_lanza(tmp_path):
    r = seal_block_hash(H, tmp_path, runner=FakeOts(stamp_ok=False))
    assert (r.stamped, r.pending) == (False, True)
    # La siguiente corrida reintenta y termina el trabajo.
    r = seal_block_hash(H, tmp_path, runner=FakeOts())
    assert r.pending is False


def test_calendario_sin_confirmar_queda_pendiente_y_se_reintenta(tmp_path):
    r = seal_block_hash(H, tmp_path, runner=FakeOts(upgrade_ok=False))
    assert (r.stamped, r.upgraded) == (True, False)
    ots = FakeOts()
    assert upgrade_pending(tmp_path, runner=ots)[0].pending is False
    assert ots.calls == ["upgrade"]  # no vuelve a sellar


def test_idempotente_no_vuelve_a_sellar(tmp_path):
    seal_block_hash(H, tmp_path, runner=FakeOts())
    ots = FakeOts()
    seal_block_hash(H, tmp_path, runner=ots)
    assert ots.calls == []


@pytest.mark.parametrize("error", [OSError("no existe ots"), subprocess.TimeoutExpired("ots", 1)])
def test_cliente_ausente_o_colgado_no_lanza(tmp_path, error):
    r = seal_block_hash(H, tmp_path, runner=FakeOts(raises=error))
    assert r.pending is True


@pytest.mark.parametrize("bad", ["", "xyz", "ab" * 31, "zz" * 32, "../" + "ab" * 30])
def test_hash_invalido(bad):
    with pytest.raises(SealingError):
        normalize_block_hash(bad)


def test_cli_hash_invalido_y_cliente_ausente(tmp_path, capsys):
    assert main(["seal", "--seals-dir", str(tmp_path), "--block-hash", "nope"]) == EXIT_USAGE
    code = main(
        ["seal", "--seals-dir", str(tmp_path), "--block-hash", H, "--ots-command", "no-existe-ots"]
    )
    assert code == EXIT_ANCHOR_FAILED
    assert "pendiente" in capsys.readouterr().out


def test_cli_con_cliente_falso(tmp_path, capsys):
    fake = tmp_path / "fake_ots.py"
    fake.write_text(
        "import sys\n"
        "if sys.argv[1] == 'stamp': open(sys.argv[2] + '.ots', 'wb').write(b'x')\n"
        "if sys.argv[1] == 'upgrade': open(sys.argv[2] + '.bak', 'wb').write(b'x')\n"
    )
    seals = tmp_path / "sellos"
    cmd = f'"{__import__("sys").executable}" "{fake}"'
    assert main(["seal", "--seals-dir", str(seals), "--block-hash", H, "--ots-command", cmd]) == EXIT_OK
    assert "completo" in capsys.readouterr().out
    assert main(["seal-upgrade", "--seals-dir", str(seals), "--ots-command", cmd]) == EXIT_OK
