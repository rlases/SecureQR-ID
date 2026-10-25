import json
import sys

import pytest

from secureqr_evidence_log.cli import (
    EXIT_ALERT,
    EXIT_ANCHOR_FAILED,
    EXIT_OK,
    EXIT_USAGE,
    main,
)
from secureqr_evidence_log.evidence_log import EvidenceLog, merkle_root

NOW = 1_800_000_000.0
VID = "ccav-test-1"

# Doble de `anchor/ anclar`: lee el lote y escribe un recibo según el modo pedido.
FAKE_ANCHOR = r'''
import json, sys
from secureqr_evidence_log.evidence_log import merkle_root
mode = sys.argv[1]
args = dict(zip(sys.argv[2::2], sys.argv[3::2]))
batch = json.load(open(args["--batch"]))
if mode == "falla":
    print("Fabric no responde", file=sys.stderr); sys.exit(1)
if mode == "alerta":
    print("la raiz en Fabric no coincide", file=sys.stderr); sys.exit(3)
if mode == "cuelga":
    import time; time.sleep(30)
receipt = {
    "version": 1,
    "batch_id": batch["batch_id"],
    "merkle_root": merkle_root(batch["hashes"]),
    "first_event": batch["first_event"],
    "last_event": batch["last_event"],
    "event_count": len(batch["hashes"]),
    "transaction_id": "tx-" + batch["batch_id"],
    "block_number": 42,
    "anchored_at": 1800000000.0,
}
if mode == "otro-lote":
    receipt["batch_id"] = "otra-instalacion:seq-999999-999999"
if mode == "raiz-ajena":
    receipt["merkle_root"] = "f" * 64
if mode == "sin-recibo":
    sys.exit(0)
json.dump(receipt, open(args["--receipt"], "w"))
'''


@pytest.fixture
def setup(tmp_path):
    db = tmp_path / "evidence.db"
    log = EvidenceLog(str(db))
    for i in range(5):
        log.append_event(f"cred-{i}", "verifier-A", 1000.0 + i, "aceptado")
    log.close()
    script = tmp_path / "fake_anchor.py"
    script.write_text(FAKE_ANCHOR)
    return db, script, tmp_path / "trabajo"


def _cycle(setup, mode, *extra):
    db, script, workdir = setup
    command = f'"{sys.executable}" "{script}" {mode}'
    return main(
        [
            "cycle", "--db", str(db), "--verifier-id", VID, "--workdir", str(workdir),
            "--anchor-command", command, *extra,
        ],
        clock=lambda: NOW,
    )


def _anchors(db):
    log = EvidenceLog(str(db))
    try:
        return log.anchors
    finally:
        log.close()


def test_ciclo_exitoso_registra_y_avanza(setup, capsys):
    assert _cycle(setup, "ok", "--max-events", "3") == EXIT_OK
    assert _cycle(setup, "ok", "--max-events", "3") == EXIT_OK
    assert _cycle(setup, "ok", "--max-events", "3") == EXIT_OK

    anchors = _anchors(setup[0])
    assert [a.batch_id for a in anchors] == [f"{VID}:seq-000001-000003", f"{VID}:seq-000004-000005"]
    out = capsys.readouterr().out
    assert f"{VID}:seq-000001-000003 anclado (transacción tx-{VID}:seq-000001-000003, bloque 42)" in out
    assert "sin eventos pendientes" in out


def test_falla_de_fabric_no_registra_y_se_reintenta_igual(setup, capsys):
    assert _cycle(setup, "falla") == EXIT_ANCHOR_FAILED
    assert _anchors(setup[0]) == ()
    assert "se reintentará" in capsys.readouterr().err

    assert _cycle(setup, "ok") == EXIT_OK
    assert [a.batch_id for a in _anchors(setup[0])] == [f"{VID}:seq-000001-000005"]


def test_recibo_escrito_pero_no_registrado_se_recupera(setup, capsys):
    # La raíz entró a Fabric y anchor/ escribió el recibo, pero se cortó la luz antes
    # de registrarlo: la siguiente corrida exporta el mismo lote (mismo loteId), anchor/
    # devuelve el mismo recibo y el registro queda hecho una sola vez.
    db, script, workdir = setup
    log = EvidenceLog(str(db))
    first = log.export_pending_batch(str(workdir / "lote.json"), VID)
    log.close()

    assert _cycle(setup, "ok") == EXIT_OK
    anchors = _anchors(db)
    assert [a.batch_id for a in anchors] == [first.batch_id]
    receipt = workdir / "recibo.json"
    assert main(["record-receipt", "--db", str(db), "--receipt", str(receipt)]) == EXIT_OK
    assert "ya estaba registrado" in capsys.readouterr().out
    assert len(_anchors(db)) == 1


def test_alerta_de_anchor_se_propaga(setup, capsys):
    assert _cycle(setup, "alerta") == EXIT_ALERT
    assert "ALERTA" in capsys.readouterr().err
    assert _anchors(setup[0]) == ()


@pytest.mark.parametrize("mode", ["otro-lote", "sin-recibo", "raiz-ajena"])
def test_recibo_que_no_corresponde_alerta(setup, capsys, mode):
    assert _cycle(setup, mode) == EXIT_ALERT
    assert _anchors(setup[0]) == ()


def test_timeout_de_anchor_no_registra(setup, capsys):
    assert _cycle(setup, "cuelga", "--timeout-seconds", "1") == EXIT_ANCHOR_FAILED
    assert _anchors(setup[0]) == ()


def test_comando_de_anchor_inexistente(setup, capsys):
    db, _, workdir = setup
    code = main([
        "cycle", "--db", str(db), "--verifier-id", VID, "--workdir", str(workdir),
        "--anchor-command", "/no/existe anclar",
    ])
    assert code == EXIT_ANCHOR_FAILED


def test_export_record_y_status_por_separado(setup, capsys, tmp_path):
    db, script, _ = setup
    lote = tmp_path / "lote.json"
    assert main(["export-batch", "--db", str(db), "--verifier-id", VID, "--output", str(lote), "--max-events", "2"]) == EXIT_OK
    assert f"lote={VID}:seq-000001-000002 eventos=2" in capsys.readouterr().out

    batch = json.loads(lote.read_text())
    receipt = tmp_path / "recibo.json"
    receipt.write_text(json.dumps({
        "version": 1, "batch_id": batch["batch_id"], "merkle_root": merkle_root(batch["hashes"]),
        "first_event": 1, "last_event": 2, "event_count": 2,
        "transaction_id": "tx-1", "block_number": 3, "anchored_at": NOW,
    }))
    assert main(["record-receipt", "--db", str(db), "--receipt", str(receipt)], clock=lambda: NOW) == EXIT_OK
    assert main(["record-receipt", "--db", str(db), "--receipt", str(receipt)], clock=lambda: NOW) == EXIT_OK
    assert capsys.readouterr().out.splitlines() == ["registrado", "ya estaba registrado"]

    assert main(["status", "--db", str(db)], clock=lambda: NOW) == EXIT_OK
    status = json.loads(capsys.readouterr().out)
    assert status["pending_events"] == 3
    assert status["stale"] is True
    assert status["last_batch_id"] == f"{VID}:seq-000001-000002"


def test_recibo_contradictorio_por_record_receipt_alerta(setup, capsys, tmp_path):
    db = setup[0]
    lote = tmp_path / "lote.json"
    assert main(["export-batch", "--db", str(db), "--verifier-id", VID, "--output", str(lote)]) == EXIT_OK
    batch = json.loads(lote.read_text())
    base = {"version": 1, "batch_id": batch["batch_id"], "first_event": 1, "last_event": 5,
            "event_count": 5, "transaction_id": "tx", "block_number": 1, "anchored_at": NOW}
    first = tmp_path / "r1.json"
    first.write_text(json.dumps({**base, "merkle_root": merkle_root(batch["hashes"])}))
    second = tmp_path / "r2.json"
    second.write_text(json.dumps({**base, "merkle_root": "b" * 64}))

    assert main(["record-receipt", "--db", str(db), "--receipt", str(first)]) == EXIT_OK
    assert main(["record-receipt", "--db", str(db), "--receipt", str(second)]) == EXIT_ALERT
    assert "ALERTA" in capsys.readouterr().err


def test_ciclo_con_eventos_nuevos_entre_reintentos_reutiliza_el_mismo_lote(setup, capsys):
    # La raíz entra a Fabric pero el recibo no se registra; llegan eventos; la siguiente
    # corrida debe volver a publicar exactamente el mismo rango (mismo loteId).
    db, _, workdir = setup
    assert _cycle(setup, "sin-recibo", "--max-events", "3") == EXIT_ALERT
    first = json.loads((workdir / "lote.json").read_text())["batch_id"]
    log = EvidenceLog(str(db))
    for i in range(10):
        log.append_event(f"nuevo-{i}", "verifier-A", 2000.0 + i, "aceptado")
    log.close()

    assert _cycle(setup, "ok", "--max-events", "500") == EXIT_OK

    assert json.loads((workdir / "lote.json").read_text())["batch_id"] == first
    assert [a.batch_id for a in _anchors(db)] == [first]
    assert first == f"{VID}:seq-000001-000003"


def test_ciclo_escribe_el_archivo_de_estado(setup, tmp_path):
    estado = tmp_path / "estado" / "anclaje.json"

    assert _cycle(setup, "falla", "--status-file", str(estado)) == EXIT_ANCHOR_FAILED
    data = json.loads(estado.read_text())
    assert data["pending_events"] == 5 and data["written_at"] == NOW

    assert _cycle(setup, "ok", "--status-file", str(estado)) == EXIT_OK
    data = json.loads(estado.read_text())
    assert data["pending_events"] == 0
    assert data["last_batch_id"] == f"{VID}:seq-000001-000005"
    assert data["stale"] is False


def test_verifier_id_invalido_es_error_de_uso(setup, capsys, tmp_path):
    db = setup[0]
    with pytest.raises(SystemExit) as exc:
        main(["export-batch", "--db", str(db), "--verifier-id", " ", "--output", str(tmp_path / "l.json")])
    assert exc.value.code == 2


def test_bitacora_inexistente_o_en_memoria(tmp_path, capsys):
    assert main(["status", "--db", str(tmp_path / "no-existe.db")]) == EXIT_USAGE
    assert main(["status", "--db", ":memory:"]) == EXIT_USAGE
