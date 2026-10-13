import json
import sqlite3

import pytest

from secureqr_evidence_log.evidence_log import (
    AnchoringError,
    AnchorMismatchError,
    AnchorReceipt,
    EvidenceLog,
    batch_id_for,
)

NOW = 1_800_000_000.0


def _log_with(n, db=None):
    log = EvidenceLog(db or ":memory:")
    for i in range(n):
        log.append_event(f"cred-{i:03d}", "verifier-A", 1000.0 + i, "aceptado")
    return log


def _receipt(batch, *, root="a" * 64, tx="tx-1", block=7, at=NOW, **overrides):
    values = dict(
        batch_id=batch.batch_id,
        merkle_root=root,
        first_event=batch.first_event,
        last_event=batch.last_event,
        event_count=len(batch.hashes),
        transaction_id=tx,
        block_number=block,
        anchored_at=at,
    )
    values.update(overrides)
    return AnchorReceipt(**values)


def test_lote_id_determinista():
    assert batch_id_for(101, 600) == "seq-000101-000600"
    assert batch_id_for(1, 1_234_567) == "seq-000001-1234567"


def test_lote_pendiente_contiguo_y_limitado():
    log = _log_with(7)

    batch = log.pending_batch(max_events=3)

    assert (batch.first_event, batch.last_event) == (1, 3)
    assert batch.batch_id == "seq-000001-000003"
    assert list(batch.hashes) == [e.hash for e in log.events[:3]]


def test_sin_eventos_no_hay_lote(tmp_path):
    log = EvidenceLog()

    assert log.pending_batch() is None
    assert log.export_pending_batch(str(tmp_path / "lote.json")) is None
    assert not (tmp_path / "lote.json").exists()


def test_exporta_solo_hashes_y_numeros(tmp_path):
    log = _log_with(2)
    path = tmp_path / "lote.json"

    batch = log.export_pending_batch(str(path))

    data = json.loads(path.read_text())
    assert data == {
        "version": 1,
        "batch_id": "seq-000001-000002",
        "first_event": 1,
        "last_event": 2,
        "hashes": [e.hash for e in log.events],
    }
    assert "cred-000" not in path.read_text()
    assert batch.batch_id == data["batch_id"]


def test_mientras_no_se_registre_el_recibo_el_lote_se_repite_igual():
    log = _log_with(3)
    first = log.pending_batch()
    log.append_event("cred-nuevo", "verifier-A", 2000.0, "aceptado")

    again = log.pending_batch(max_events=3)

    assert again == first


def test_registrar_recibo_avanza_al_siguiente_lote():
    log = _log_with(5)
    batch = log.pending_batch(max_events=3)

    assert log.record_anchor(_receipt(batch), recorded_at=NOW) is True

    following = log.pending_batch(max_events=3)
    assert (following.first_event, following.last_event) == (4, 5)
    assert log.is_anchored(3) and not log.is_anchored(4)
    assert log.anchors[0].transaction_id == "tx-1"


def test_registrar_dos_veces_es_idempotente():
    log = _log_with(2)
    batch = log.pending_batch()
    receipt = _receipt(batch)

    assert log.record_anchor(receipt, recorded_at=NOW) is True
    assert log.record_anchor(receipt, recorded_at=NOW + 60) is False
    assert len(log.anchors) == 1


def test_recibo_distinto_para_lote_ya_registrado_alerta():
    log = _log_with(2)
    batch = log.pending_batch()
    log.record_anchor(_receipt(batch), recorded_at=NOW)

    with pytest.raises(AnchorMismatchError):
        log.record_anchor(_receipt(batch, root="b" * 64), recorded_at=NOW)
    assert log.anchors[0].merkle_root == "a" * 64


@pytest.mark.parametrize(
    "overrides",
    [
        {"first_event": 2, "batch_id": "seq-000002-000003"},  # no empieza en el primero pendiente
        {"last_event": 9, "batch_id": "seq-000001-000009", "event_count": 9},  # eventos que no existen
        {"event_count": 2},  # cantidad que no coincide
        {"batch_id": "seq-000001-000004"},  # loteId que no corresponde al rango
        {"merkle_root": "XYZ"},
        {"merkle_root": "A" * 64},
        {"transaction_id": "  "},
        {"block_number": -1},
        {"anchored_at": float("nan")},
    ],
)
def test_recibos_inconsistentes_no_se_registran(overrides):
    log = _log_with(3)
    batch = log.pending_batch()

    with pytest.raises(AnchoringError):
        log.record_anchor(_receipt(batch, **overrides), recorded_at=NOW)
    assert log.anchors == ()
    assert log.pending_batch() == batch


def test_no_hay_update_ni_delete_sobre_eventos_ni_anclajes():
    log = _log_with(2)
    log.record_anchor(_receipt(log.pending_batch()), recorded_at=NOW)

    for sql in (
        "UPDATE events SET decision = 'rechazado' WHERE seq = 1",
        "DELETE FROM events WHERE seq = 1",
        "UPDATE events SET anchored_at = 1 WHERE seq = 1",
        "UPDATE anclajes SET merkle_root = 'x'",
        "DELETE FROM anclajes",
    ):
        with pytest.raises(sqlite3.IntegrityError):
            log._conn.execute(sql)
    assert len(log.events) == 2 and len(log.anchors) == 1
    assert log.verify_chain() is True


def test_el_codigo_no_tiene_update_ni_delete():
    import inspect

    import secureqr_evidence_log.evidence_log as module

    source = inspect.getsource(module).upper()
    for statement in ("UPDATE EVENTS", "DELETE FROM EVENTS", "UPDATE ANCLAJES", "DELETE FROM ANCLAJES"):
        assert statement not in source.replace("BEFORE UPDATE ON", "").replace("BEFORE DELETE ON", "")


def test_estado_para_el_panel():
    log = _log_with(3)

    status = log.anchoring_status(now=1000.0 + 7200 + 1)

    assert status.pending_events == 3
    assert status.oldest_pending_timestamp == 1000.0
    assert status.stale is True
    assert status.last_batch_id is None

    log.record_anchor(_receipt(log.pending_batch()), recorded_at=NOW)
    status = log.anchoring_status(now=NOW)
    assert status.pending_events == 0 and status.stale is False
    assert status.last_batch_id == "seq-000001-000003"
    assert status.last_anchored_at == NOW


def test_estado_no_alerta_antes_de_dos_horas():
    log = _log_with(1)

    assert log.anchoring_status(now=1000.0 + 7199).stale is False
    assert log.anchoring_status(now=1000.0 + 10, stale_after_seconds=5).stale is True


def test_persistencia_de_anclajes(tmp_path):
    db = str(tmp_path / "evidence.db")
    log = _log_with(4, db)
    log.record_anchor(_receipt(log.pending_batch(max_events=2)), recorded_at=NOW)
    log.close()

    reopened = EvidenceLog(db)

    assert reopened.pending_batch().first_event == 3
    assert reopened.verify_chain() is True


def test_bitacora_creada_antes_de_adr_0017_sigue_funcionando(tmp_path):
    db = tmp_path / "vieja.db"
    conn = sqlite3.connect(db)
    conn.execute(
        "CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, credential_id TEXT NOT NULL, "
        "verifier_id TEXT NOT NULL, timestamp REAL NOT NULL, decision TEXT NOT NULL, "
        "previous_hash TEXT NOT NULL, hash TEXT NOT NULL, anchored_at REAL, merkle_root TEXT)"
    )
    conn.commit()
    conn.close()

    log = EvidenceLog(str(db))
    log.append_event("cred-001", "verifier-A", 1000.0, "aceptado")

    assert log.pending_batch().batch_id == "seq-000001-000001"
    with pytest.raises(sqlite3.IntegrityError):
        log._conn.execute("UPDATE events SET decision = 'x'")
