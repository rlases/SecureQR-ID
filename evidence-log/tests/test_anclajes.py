import json
import sqlite3

import pytest

from secureqr_evidence_log.evidence_log import (
    AnchoringError,
    AnchorMismatchError,
    AnchorReceipt,
    EvidenceLog,
    batch_id_for,
    merkle_root,
)

NOW = 1_800_000_000.0
VID = "ccav-test-1"

# Generados con `buildMerkleTree` de anchor/src/merkle.ts a partir de las hojas
# sha256("evento-<i>"): si cambia el algoritmo de uno, estas pruebas rompen en el otro.
MERKLE_VECTORS = {
    1: (
        [
            "7bdd8f56f48c382aad34a1a2c98099f57b2033350529673c0083e850aaa24736",
        ],
        "e8bb07719c6f87212a217839c52571fcfb9d4a49a6f1d8212b242b749bedc71c",
    ),
    2: (
        [
            "7bdd8f56f48c382aad34a1a2c98099f57b2033350529673c0083e850aaa24736",
            "db065a4e74b497538cc26074c3aebf7c16a36c9135c3f7fa66a458a5583c7682",
        ],
        "25ddf10e43c7cef8ed6f1b4b3b505432cc7366b024dcb6bbac8a6804cc4d8c1a",
    ),
    3: (
        [
            "7bdd8f56f48c382aad34a1a2c98099f57b2033350529673c0083e850aaa24736",
            "db065a4e74b497538cc26074c3aebf7c16a36c9135c3f7fa66a458a5583c7682",
            "ed703766618ec2adfc7ef2ba353c856038680cf89ab4f746d96799043d62648c",
        ],
        "842b275e54d3ad289ce1cfd62b19f06a1b38bcf116b9d53e76ad44905fe53316",
    ),
    4: (
        [
            "7bdd8f56f48c382aad34a1a2c98099f57b2033350529673c0083e850aaa24736",
            "db065a4e74b497538cc26074c3aebf7c16a36c9135c3f7fa66a458a5583c7682",
            "ed703766618ec2adfc7ef2ba353c856038680cf89ab4f746d96799043d62648c",
            "24cd224f678816ca81cd2757b19dc1e96221a80e67182ff159ae91df9dd5dce4",
        ],
        "2c30fc08fe8a2cb2fb2ed9307582c24a5642f4689429cd3869d6ed3eeb556d14",
    ),
    5: (
        [
            "7bdd8f56f48c382aad34a1a2c98099f57b2033350529673c0083e850aaa24736",
            "db065a4e74b497538cc26074c3aebf7c16a36c9135c3f7fa66a458a5583c7682",
            "ed703766618ec2adfc7ef2ba353c856038680cf89ab4f746d96799043d62648c",
            "24cd224f678816ca81cd2757b19dc1e96221a80e67182ff159ae91df9dd5dce4",
            "1d87aa9343163860dd8d959dbea7cc2959e561560345327a3488ed8166a288bc",
        ],
        "6eec73efa6e5e0d3790338499c811f5adc1609fbf0aa39fce8ad893a231bc38c",
    ),
    7: (
        [
            "7bdd8f56f48c382aad34a1a2c98099f57b2033350529673c0083e850aaa24736",
            "db065a4e74b497538cc26074c3aebf7c16a36c9135c3f7fa66a458a5583c7682",
            "ed703766618ec2adfc7ef2ba353c856038680cf89ab4f746d96799043d62648c",
            "24cd224f678816ca81cd2757b19dc1e96221a80e67182ff159ae91df9dd5dce4",
            "1d87aa9343163860dd8d959dbea7cc2959e561560345327a3488ed8166a288bc",
            "d21ca7d74fc3fb320b60e9518ab55d52afb65dd7b00e1bbe1893eb73dcd61bb9",
            "5f4655ee6858e2096d4ab5269b295f33c1dd3bf38340072418c06f7223c7fd69",
        ],
        "4de61abeae3fe5550a186371bfc57dba4bf6b43f097890f6a85231e8bfd1b7b0",
    ),
    8: (
        [
            "7bdd8f56f48c382aad34a1a2c98099f57b2033350529673c0083e850aaa24736",
            "db065a4e74b497538cc26074c3aebf7c16a36c9135c3f7fa66a458a5583c7682",
            "ed703766618ec2adfc7ef2ba353c856038680cf89ab4f746d96799043d62648c",
            "24cd224f678816ca81cd2757b19dc1e96221a80e67182ff159ae91df9dd5dce4",
            "1d87aa9343163860dd8d959dbea7cc2959e561560345327a3488ed8166a288bc",
            "d21ca7d74fc3fb320b60e9518ab55d52afb65dd7b00e1bbe1893eb73dcd61bb9",
            "5f4655ee6858e2096d4ab5269b295f33c1dd3bf38340072418c06f7223c7fd69",
            "20ece8ab41b25e0c5e8c8c17934f9aae14a124045b6d6714143780018d5f329d",
        ],
        "a373ae65f52219f7118d0f9f2b5ede383a5fe89bde840b1d86c83a47f70b136f",
    ),
}

def _log_with(n, db=None):
    log = EvidenceLog(db or ":memory:")
    for i in range(n):
        log.append_event(f"cred-{i:03d}", "verifier-A", 1000.0 + i, "aceptado")
    return log


def _pin(log, tmp_path, max_events=500, vid=VID):
    """Fija y exporta el lote como lo hace el ciclo."""
    return log.export_pending_batch(
        str(tmp_path / "lote.json"), vid, max_events, fixed_at=NOW
    )


def _receipt(batch, *, root=None, tx="tx-1", block=7, at=NOW, **overrides):
    values = dict(
        batch_id=batch.batch_id,
        merkle_root=root or merkle_root(batch.hashes),
        first_event=batch.first_event,
        last_event=batch.last_event,
        event_count=len(batch.hashes),
        transaction_id=tx,
        block_number=block,
        anchored_at=at,
    )
    values.update(overrides)
    return AnchorReceipt(**values)


@pytest.mark.parametrize("n", sorted(MERKLE_VECTORS))
def test_raiz_de_merkle_coincide_con_anchor(n):
    leaves, root = MERKLE_VECTORS[n]

    assert merkle_root(leaves) == root


def test_raiz_de_lote_vacio_es_error():
    with pytest.raises(ValueError):
        merkle_root([])


def test_lote_id_lleva_la_instalacion():
    assert batch_id_for("ccav-portal-1", 101, 600) == "ccav-portal-1:seq-000101-000600"
    assert batch_id_for(VID, 1, 1_234_567) == f"{VID}:seq-000001-1234567"


@pytest.mark.parametrize("bad", ["", " x", "x ", "a\nb", "x" * 129, None, 7])
def test_verifier_id_invalido(bad):
    with pytest.raises(ValueError):
        batch_id_for(bad, 1, 2)


def test_dos_instalaciones_no_chocan_en_el_mismo_rango():
    a, b = _log_with(2), _log_with(2)

    batch_a = a.pending_batch("instalacion-a")
    batch_b = b.pending_batch("instalacion-b")

    assert batch_a.batch_id != batch_b.batch_id
    assert batch_a.batch_id.endswith(":seq-000001-000002")


def test_lote_pendiente_contiguo_y_limitado():
    log = _log_with(7)

    batch = log.pending_batch(VID, max_events=3)

    assert (batch.first_event, batch.last_event) == (1, 3)
    assert batch.batch_id == f"{VID}:seq-000001-000003"
    assert list(batch.hashes) == [e.hash for e in log.events[:3]]


def test_consultar_el_lote_pendiente_no_escribe_nada():
    log = _log_with(3)

    log.pending_batch(VID)

    assert log._conn.execute("SELECT COUNT(*) FROM lotes").fetchone()[0] == 0


def test_sin_eventos_no_hay_lote(tmp_path):
    log = EvidenceLog()

    assert log.pending_batch(VID) is None
    assert log.export_pending_batch(str(tmp_path / "lote.json"), VID) is None
    assert not (tmp_path / "lote.json").exists()


def test_exporta_solo_hashes_y_numeros(tmp_path):
    log = _log_with(2)
    path = tmp_path / "lote.json"

    batch = log.export_pending_batch(str(path), VID)

    data = json.loads(path.read_text())
    assert data == {
        "version": 1,
        "batch_id": f"{VID}:seq-000001-000002",
        "first_event": 1,
        "last_event": 2,
        "hashes": [e.hash for e in log.events],
    }
    assert "cred-000" not in path.read_text()
    assert batch.batch_id == data["batch_id"]


def test_exportar_fija_el_lote_en_la_tabla_lotes(tmp_path):
    log = _log_with(3)

    batch = _pin(log, tmp_path)

    row = log._conn.execute(
        "SELECT batch_id, first_event, last_event, event_count, merkle_root, fixed_at "
        "FROM lotes"
    ).fetchall()
    assert row == [(batch.batch_id, 1, 3, 3, merkle_root(batch.hashes), NOW)]


def test_el_rango_queda_fijo_aunque_lleguen_eventos_nuevos(tmp_path):
    # Caso de la revisión de #99: exportar, llegar eventos, no registrar el recibo
    # (la raíz pudo entrar a Fabric) y volver a exportar → el MISMO loteId y rango.
    log = _log_with(3)
    first = _pin(log, tmp_path)
    for i in range(30):
        log.append_event(f"nuevo-{i}", "verifier-A", 2000.0 + i, "aceptado")

    again = _pin(log, tmp_path)

    assert again == first
    assert again.batch_id == f"{VID}:seq-000001-000003"
    assert log.pending_batch(VID) == first
    assert log._conn.execute("SELECT COUNT(*) FROM lotes").fetchone()[0] == 1


def test_el_lote_fijado_conserva_su_id_aunque_cambie_la_configuracion(tmp_path):
    log = _log_with(5)
    first = _pin(log, tmp_path, max_events=3)

    again = _pin(log, tmp_path, max_events=500, vid="otra-instalacion")

    assert again == first


def test_registrar_recibo_fija_el_lote_siguiente_con_los_eventos_nuevos(tmp_path):
    log = _log_with(3)
    batch = _pin(log, tmp_path)
    for i in range(2):
        log.append_event(f"nuevo-{i}", "verifier-A", 2000.0 + i, "aceptado")

    assert log.record_anchor(_receipt(batch), recorded_at=NOW) is True

    following = _pin(log, tmp_path)
    assert (following.first_event, following.last_event) == (4, 5)
    assert following.batch_id == f"{VID}:seq-000004-000005"
    assert log.is_anchored(3) and not log.is_anchored(4)
    assert log.anchors[0].transaction_id == "tx-1"


def test_registrar_recibo_avanza_al_siguiente_lote(tmp_path):
    log = _log_with(5)
    batch = _pin(log, tmp_path, max_events=3)

    assert log.record_anchor(_receipt(batch), recorded_at=NOW) is True

    following = log.pending_batch(VID, max_events=3)
    assert (following.first_event, following.last_event) == (4, 5)


def test_registrar_dos_veces_es_idempotente(tmp_path):
    log = _log_with(2)
    receipt = _receipt(_pin(log, tmp_path))

    assert log.record_anchor(receipt, recorded_at=NOW) is True
    assert log.record_anchor(receipt, recorded_at=NOW + 60) is False
    assert len(log.anchors) == 1


def test_recibo_distinto_para_lote_ya_registrado_alerta(tmp_path):
    log = _log_with(2)
    batch = _pin(log, tmp_path)
    log.record_anchor(_receipt(batch), recorded_at=NOW)

    with pytest.raises(AnchorMismatchError):
        log.record_anchor(_receipt(batch, root="b" * 64), recorded_at=NOW)
    assert log.anchors[0].merkle_root == merkle_root(batch.hashes)


def test_raiz_ajena_con_rango_valido_no_se_registra(tmp_path):
    # Hallazgo P1 de la revisión: una raíz sintética ajena se aceptaba con un rango y
    # una cantidad existentes y dejaba pending_events = 0.
    log = _log_with(3)
    batch = _pin(log, tmp_path)

    with pytest.raises(AnchoringError, match="no coinciden"):
        log.record_anchor(_receipt(batch, root="f" * 64), recorded_at=NOW)

    assert log.anchors == ()
    assert log.anchoring_status(NOW).pending_events == 3
    assert log.pending_batch(VID) == batch


def test_recibo_sin_lote_fijado_no_se_registra():
    log = _log_with(3)
    batch = log.pending_batch(VID)  # solo consultado, nunca fijado

    with pytest.raises(AnchoringError, match="lote fijado"):
        log.record_anchor(_receipt(batch), recorded_at=NOW)

    assert log.anchors == ()


def test_recibo_de_otra_instalacion_no_se_registra(tmp_path):
    log = _log_with(3)
    batch = _pin(log, tmp_path)
    ajeno = _receipt(batch, batch_id=batch_id_for("otra-instalacion", 1, 3))

    with pytest.raises(AnchoringError, match="lote fijado"):
        log.record_anchor(ajeno, recorded_at=NOW)

    assert log.anchors == ()


@pytest.mark.parametrize(
    "overrides",
    [
        {"first_event": 2, "batch_id": f"{VID}:seq-000002-000003"},  # no es el lote fijado
        {"last_event": 9, "batch_id": f"{VID}:seq-000001-000009", "event_count": 9},
        {"event_count": 2},  # cantidad que no coincide
        {"batch_id": f"{VID}:seq-000001-000004"},  # loteId que no corresponde al rango
        {"batch_id": "seq-000001-000003"},  # loteId sin instalación
        {"merkle_root": "XYZ"},
        {"merkle_root": "A" * 64},
        {"transaction_id": "  "},
        {"block_number": -1},
        {"anchored_at": float("nan")},
    ],
)
def test_recibos_inconsistentes_no_se_registran(overrides, tmp_path):
    log = _log_with(3)
    batch = _pin(log, tmp_path)

    with pytest.raises(AnchoringError):
        log.record_anchor(_receipt(batch, **overrides), recorded_at=NOW)
    assert log.anchors == ()
    assert log.pending_batch(VID) == batch


def test_lote_fijado_alterado_en_la_bitacora_alerta(tmp_path):
    log = _log_with(3)
    _pin(log, tmp_path)
    log._conn.execute("DROP TRIGGER events_no_update")  # simula manipulación de la base
    log._conn.execute("UPDATE events SET hash = ? WHERE seq = 2", ("0" * 64,))

    with pytest.raises(AnchoringError, match="no coincide"):
        log.pending_batch(VID)
    with pytest.raises(AnchoringError, match="no coincide"):
        _pin(log, tmp_path)


def test_no_hay_update_ni_delete_sobre_eventos_lotes_ni_anclajes(tmp_path):
    log = _log_with(2)
    log.record_anchor(_receipt(_pin(log, tmp_path)), recorded_at=NOW)

    for sql in (
        "UPDATE events SET decision = 'rechazado' WHERE seq = 1",
        "DELETE FROM events WHERE seq = 1",
        "UPDATE events SET anchored_at = 1 WHERE seq = 1",
        "UPDATE lotes SET merkle_root = 'x'",
        "DELETE FROM lotes",
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
    for statement in (
        "UPDATE EVENTS",
        "DELETE FROM EVENTS",
        "UPDATE LOTES",
        "DELETE FROM LOTES",
        "UPDATE ANCLAJES",
        "DELETE FROM ANCLAJES",
    ):
        assert statement not in source.replace("BEFORE UPDATE ON", "").replace("BEFORE DELETE ON", "")


def test_estado_para_el_panel(tmp_path):
    log = _log_with(3)

    status = log.anchoring_status(now=1000.0 + 7200 + 1)

    assert status.pending_events == 3
    assert status.oldest_pending_timestamp == 1000.0
    assert status.stale is True
    assert status.last_batch_id is None

    log.record_anchor(_receipt(_pin(log, tmp_path)), recorded_at=NOW)
    status = log.anchoring_status(now=NOW)
    assert status.pending_events == 0 and status.stale is False
    assert status.last_batch_id == f"{VID}:seq-000001-000003"
    assert status.last_anchored_at == NOW


def test_estado_no_alerta_antes_de_dos_horas():
    log = _log_with(1)

    assert log.anchoring_status(now=1000.0 + 7199).stale is False
    assert log.anchoring_status(now=1000.0 + 10, stale_after_seconds=5).stale is True


def test_persistencia_de_lotes_y_anclajes(tmp_path):
    db = str(tmp_path / "evidence.db")
    log = _log_with(4, db)
    log.record_anchor(_receipt(_pin(log, tmp_path, max_events=2)), recorded_at=NOW)
    second = _pin(log, tmp_path, max_events=2)  # fijado, sin recibo
    log.close()

    reopened = EvidenceLog(db)

    assert reopened.pending_batch(VID, max_events=500) == second
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

    assert log.pending_batch(VID).batch_id == f"{VID}:seq-000001-000001"
    with pytest.raises(sqlite3.IntegrityError):
        log._conn.execute("UPDATE events SET decision = 'x'")
