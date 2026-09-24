from secureqr_evidence_log.evidence_log import EvidenceLog, GENESIS_HASH
import json
import pytest


def test_cadena_hashes_integra():
    log = EvidenceLog()

    e1 = log.append_event("cred-001", "verifier-A", 1000.0, "aceptado")
    e2 = log.append_event("cred-002", "verifier-A", 1001.0, "rechazado")
    e3 = log.append_event("cred-003", "verifier-B", 1002.0, "aceptado")

    assert e1.previous_hash == GENESIS_HASH
    assert e2.previous_hash == e1.hash
    assert e3.previous_hash == e2.hash


def test_detecta_eslabon_alterado():
    log = EvidenceLog()
    log.append_event("cred-001", "verifier-A", 1000.0, "aceptado")
    log.append_event("cred-002", "verifier-A", 1001.0, "rechazado")

    assert log.verify_chain() is True

    # Simulamos que alguien edito el almacenamiento por fuera de la API publica
    # (por ejemplo, editando el archivo .db a mano). El hash guardado se deja
    # intacto, para simular que no pudo recalcular la firma.
    log._conn.execute(
        "UPDATE events SET credential_id = ? WHERE seq = 1", ("cred-999",)
    )
    log._conn.commit()

    assert log.verify_chain() is False


def test_no_se_puede_reemplazar_events_desde_afuera():
    log = EvidenceLog()
    log.append_event("cred-001", "verifier-A", 1000.0, "aceptado")

    try:
        log.events = ()
        assert False, "se esperaba un error al intentar asignar log.events"
    except AttributeError:
        pass


def test_events_devuelve_una_tupla_no_editable():
    log = EvidenceLog()
    log.append_event("cred-001", "verifier-A", 1000.0, "aceptado")

    assert isinstance(log.events, tuple)
    try:
        log.events[0] = "algo"
        assert False, "se esperaba un error al intentar editar un elemento"
    except TypeError:
        pass


def test_hash_no_es_ambiguo_entre_reparticiones_distintas_de_los_mismos_campos():
    # Con un separador de texto ingenuo ("X|Y" + "Z" == "X" + "Y|Z" == "X|Y|Z"),
    # estos dos eventos habrian producido el mismo hash pese a tener
    # credential_id/verifier_id distintos.
    log1 = EvidenceLog()
    log2 = EvidenceLog()

    e1 = log1.append_event("X|Y", "Z", 1000.0, "aceptado")
    e2 = log2.append_event("X", "Y|Z", 1000.0, "aceptado")

    assert e1.hash != e2.hash

def test_exportar_lote_no_anclado_escribe_json(tmp_path):
    log = EvidenceLog()
    e1 = log.append_event("cred-001", "verifier-A", 1000.0, "aceptado")
    e2 = log.append_event("cred-002", "verifier-A", 1001.0, "aceptado")

    ruta = tmp_path / "lote.json"
    cantidad = log.export_unanchored_batch(str(ruta))

    assert cantidad == 2
    contenido = json.loads(ruta.read_text())
    assert contenido["hashes"] == [e1.hash, e2.hash]


def test_lote_vacio_no_escribe_archivo(tmp_path):
    log = EvidenceLog()
    ruta = tmp_path / "lote.json"

    cantidad = log.export_unanchored_batch(str(ruta))

    assert cantidad == 0
    assert not ruta.exists()


def test_marcar_lote_anclado_lo_excluye_del_siguiente_lote(tmp_path):
    log = EvidenceLog()
    e1 = log.append_event("cred-001", "verifier-A", 1000.0, "aceptado")
    e2 = log.append_event("cred-002", "verifier-A", 1001.0, "aceptado")

    log.mark_batch_anchored([e1.hash, e2.hash], merkle_root="a" * 64, anchored_at=2000.0)

    ruta = tmp_path / "lote.json"
    cantidad = log.export_unanchored_batch(str(ruta))
    assert cantidad == 0

    e3 = log.append_event("cred-003", "verifier-B", 1002.0, "aceptado")
    cantidad = log.export_unanchored_batch(str(ruta))
    assert cantidad == 1
    contenido = json.loads(ruta.read_text())
    assert contenido["hashes"] == [e3.hash]


def test_marcar_hash_inexistente_falla():
    log = EvidenceLog()
    log.append_event("cred-001", "verifier-A", 1000.0, "aceptado")

    with pytest.raises(ValueError):
        log.mark_batch_anchored(["hash-que-no-existe"], merkle_root="a" * 64, anchored_at=2000.0)