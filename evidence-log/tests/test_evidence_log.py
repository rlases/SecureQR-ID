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

    # Simulamos que alguien edito el almacenamiento por fuera de la API publica
    # (por ejemplo, editando el archivo en disco a mano mas adelante).
    original = log._events[0]
    log._events[0] = original.__class__(
        credential_id="cred-999",  # dato cambiado
        verifier_id=original.verifier_id,
        timestamp=original.timestamp,
        decision=original.decision,
        previous_hash=original.previous_hash,
        hash=original.hash,  # el hash guardado sigue siendo el viejo
    )

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