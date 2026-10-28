"""Casos P (repetición) y V (credencial revocada) de ADR-0019, punto 3 (#153).

P3 y P4 controlan el tiempo con la emisión (`iat`/`exp`), nunca con el reloj del
sistema. P2 solo comprueba que el mismo token no entre dos veces: una captura presentada
antes que el titular dentro de su vigencia se acepta por diseño y no entra en la tasa
(ADR-0019, consecuencias).
"""

from __future__ import annotations

import random
import threading
import time
from secureqr_issuer import create_credential_id

from .casos import Caso, registrar
from .entorno import (
    CLOCK_SKEW_SECONDS,
    REVOCATION_MAX_AGE_SECONDS,
    TOKEN_TTL_SECONDS,
    Entorno,
    Presentacion,
)


class CasoError(Exception):
    """El intento no pudo prepararse como el caso exige (error de la batería)."""


def _aceptado(entorno: Entorno) -> str:
    """Un token legítimo ya presentado y aceptado: lo que después se repite."""
    token = entorno.emisor().issue_token(create_credential_id())
    if not entorno.verificar(token).aceptado:
        raise CasoError("La presentación legítima previa a la repetición se rechazó.")
    return token


def _p1(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    return entorno.verificar(_aceptado(entorno))


def _p2(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    token = entorno.emisor().issue_token(create_credential_id())
    barrera = threading.Barrier(2)
    resultados: list[tuple[bool, float]] = []
    errores: list[BaseException] = []

    def presentar() -> None:
        try:
            barrera.wait(timeout=10)
            resultados.append(entorno.presentar(token))
        except BaseException as exc:  # noqa: BLE001 - se relanza en el hilo principal
            errores.append(exc)
        finally:
            entorno.cerrar_conexion()

    entorno.motivos_nuevos()
    hilos = [threading.Thread(target=presentar) for _ in range(2)]
    for hilo in hilos:
        hilo.start()
    for hilo in hilos:
        hilo.join()
    if errores:
        raise errores[0]
    aceptados = sum(aceptado for aceptado, _ in resultados)
    ms = max(m for _, m in resultados)
    motivos = entorno.motivos_nuevos()
    if aceptados >= 2:
        return Presentacion(True, None, ms)
    # Se espera exactamente una aceptación y un `replay`. Ninguna aceptación también es
    # un fallo (se pierde la entrada legítima) y se marca con un motivo propio.
    motivo = motivos[-1] if aceptados == 1 and len(motivos) == 1 else "ninguna_aceptada"
    return Presentacion(False, motivo, ms)


def _p3(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    atraso = TOKEN_TTL_SECONDS + CLOCK_SKEW_SECONDS + rng.randint(1, 3600)
    emitido = time.time() - atraso
    emisor = entorno.emisor(reloj=lambda: emitido)
    return entorno.verificar(emisor.issue_token(create_credential_id()))


def _p4(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    adelanto = CLOCK_SKEW_SECONDS + rng.randint(1, 3600)
    emitido = time.time() + adelanto
    emisor = entorno.emisor(reloj=lambda: emitido)
    return entorno.verificar(emisor.issue_token(create_credential_id()))


def _p5(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    token = _aceptado(entorno)
    entorno.reiniciar()
    return entorno.verificar(token)


# --- V: credencial revocada -----------------------------------------------------------


def _v1_preparar(entorno: Entorno, total: int) -> None:
    cids = [create_credential_id() for _ in range(total)]
    entorno.estado["V1"] = cids
    entorno.escribir_lista(cids)
    entorno.esperar_recarga()


def _v1(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    cids = entorno.estado["V1"]
    assert isinstance(cids, list)
    return entorno.verificar(entorno.emisor().issue_token(cids[i]))


def _restaurar_lista(entorno: Entorno) -> None:
    entorno.escribir_lista([])
    entorno.reiniciar()


def _v2_preparar(entorno: Entorno, total: int) -> None:
    # Una lista válida pero vencida: el servicio arranca igual y rechaza todo hasta que
    # llegue una fresca (ADR-0015). En caliente no se instalaría, por antirretroceso.
    vencida = int(time.time()) - REVOCATION_MAX_AGE_SECONDS - 3600
    entorno.escribir_lista([], emitida_en=vencida)
    entorno.reiniciar()


def _v2(entorno: Entorno, rng: random.Random, i: int) -> Presentacion:
    return entorno.verificar(entorno.emisor().issue_token(create_credential_id()))


def _v1_terminar(entorno: Entorno) -> None:
    entorno.estado.pop("V1", None)
    entorno.escribir_lista([])
    entorno.esperar_recarga()


REPLAY = frozenset({"replay"})

for caso in (
    Caso("P1", "P", "El mismo token aceptado, presentado otra vez", True, REPLAY, _p1),
    Caso("P2", "P", "Dos presentaciones simultáneas del mismo token: como mucho una se acepta",
         True, REPLAY, _p2),
    Caso("P3", "P", "Token presentado después de exp más la tolerancia de reloj", True,
         frozenset({"expired"}), _p3),
    Caso("P4", "P", "Token con iat en el futuro, más allá de la tolerancia", True,
         frozenset({"not_yet_valid"}), _p4),
    Caso("P5", "P", "Repetición después de reiniciar verifier-service", True, REPLAY, _p5),
    Caso("V1", "V", "Token válido de un cid incluido en la lista firmada", True,
         frozenset({"revoked"}), _v1, _v1_preparar, _v1_terminar),
    Caso("V2", "V", "Token válido mientras la lista vigente está vencida", True,
         frozenset({"revocation_unavailable"}), _v2, _v2_preparar, _restaurar_lista),
):
    registrar(caso)
