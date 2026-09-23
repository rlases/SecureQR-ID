from secureqr_evidence_log.evidence_log import EvidenceLog, GENESIS_HASH


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

    # Alteramos un evento "a mano", como si alguien hubiera editado el registro
    eventos_alterados = list(log.events)
    original = eventos_alterados[0]
    eventos_alterados[0] = original.__class__(
        credential_id="cred-999",  # <-- dato cambiado
        verifier_id=original.verifier_id,
        timestamp=original.timestamp,
        decision=original.decision,
        previous_hash=original.previous_hash,
        hash=original.hash,  # el hash guardado sigue siendo el viejo
    )
    log.events = eventos_alterados

    assert log.verify_chain() is False