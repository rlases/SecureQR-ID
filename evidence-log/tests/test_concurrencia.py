from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from secureqr_evidence_log.evidence_log import GENESIS_HASH, EvidenceLog

ESCRITORES = 8
EVENTOS_POR_ESCRITOR = 25


def _escribir(log, barrera, escritor):
    barrera.wait(timeout=5)
    for i in range(EVENTOS_POR_ESCRITOR):
        log.append_event(f"cred-{escritor}-{i}", "verifier-A", 1000.0 + i, "aceptado")


def _assert_cadena_lineal(log):
    eventos = log.events
    assert len(eventos) == ESCRITORES * EVENTOS_POR_ESCRITOR
    # Cada predecesor aparece exactamente una vez: si dos escrituras hubieran
    # leido el mismo ultimo hash, la cadena se bifurcaria y verify_chain fallaria.
    assert eventos[0].previous_hash == GENESIS_HASH
    assert len({e.previous_hash for e in eventos}) == len(eventos)
    assert log.verify_chain() is True


def test_una_instancia_compartida_entre_hilos_no_bifurca_la_cadena(tmp_path):
    log = EvidenceLog(db_path=str(tmp_path / "evidence.db"))
    barrera = Barrier(ESCRITORES)

    with ThreadPoolExecutor(max_workers=ESCRITORES) as pool:
        futuros = [
            pool.submit(_escribir, log, barrera, escritor)
            for escritor in range(ESCRITORES)
        ]
        for futuro in futuros:
            futuro.result()

    _assert_cadena_lineal(log)


def test_varias_instancias_sobre_el_mismo_archivo_no_bifurcan_la_cadena(tmp_path):
    # Simula varios procesos (p. ej. workers del servidor) apuntando al mismo
    # archivo: cada uno con su propia conexion, sin compartir el candado en memoria.
    db_path = str(tmp_path / "evidence.db")
    logs = [EvidenceLog(db_path=db_path) for _ in range(ESCRITORES)]
    barrera = Barrier(ESCRITORES)

    with ThreadPoolExecutor(max_workers=ESCRITORES) as pool:
        futuros = [
            pool.submit(_escribir, log, barrera, escritor)
            for escritor, log in enumerate(logs)
        ]
        for futuro in futuros:
            futuro.result()

    for log in logs:
        log.close()
    _assert_cadena_lineal(EvidenceLog(db_path=db_path))


def test_una_escritura_fallida_no_deja_transaccion_abierta():
    log = EvidenceLog()

    try:
        log.append_event(None, "verifier-A", 1000.0, "aceptado")  # type: ignore[arg-type]
    except Exception:
        pass

    log.append_event("cred-001", "verifier-A", 1001.0, "aceptado")
    assert len(log.events) == 1
    assert log.verify_chain() is True
