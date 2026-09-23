from secureqr_evidence_log.evidence_log import EvidenceLog, GENESIS_HASH


def test_cadena_hashes_integra():
    log = EvidenceLog()

    e1 = log.append_event("cred-001", "verifier-A", 1000.0, "aceptado")
    e2 = log.append_event("cred-002", "verifier-A", 1001.0, "rechazado")
    e3 = log.append_event("cred-003", "verifier-B", 1002.0, "aceptado")

    assert e1.previous_hash == GENESIS_HASH
    assert e2.previous_hash == e1.hash
    assert e3.previous_hash == e2.hash