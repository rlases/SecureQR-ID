from secureqr_evidence_log.evidence_log import EvidenceLog


def test_la_bitacora_sobrevive_a_reiniciar_el_programa(tmp_path):
    db_path = tmp_path / "evidence.db"

    # "Primera ejecucion del programa": se crea la bitacora y se agregan eventos
    log1 = EvidenceLog(db_path=str(db_path))
    log1.append_event("cred-001", "verifier-A", 1000.0, "aceptado")
    log1.append_event("cred-002", "verifier-A", 1001.0, "rechazado")
    log1.close()

    # "Segunda ejecucion": el programa se cerro y se volvio a abrir,
    # apuntando al mismo archivo en disco
    log2 = EvidenceLog(db_path=str(db_path))

    assert len(log2.events) == 2
    assert log2.events[0].credential_id == "cred-001"
    assert log2.events[1].credential_id == "cred-002"
    assert log2.verify_chain() is True