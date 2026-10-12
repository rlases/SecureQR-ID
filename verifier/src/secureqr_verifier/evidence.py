"""Composicion de la decision aceptada con la bitacora encadenada (ADR-0013).

Este modulo no importa `evidence-log/`: define el contrato minimo que la
aplicacion debe inyectar (`AcceptedEventRecorder`, que `EvidenceLog` cumple
estructuralmente) y un envoltorio que registra cada validacion aceptada despues
de que `Verifier` ya decidio. `Verifier` no cambia ni conoce la bitacora.
"""

from __future__ import annotations

import logging
import math
import time
from collections.abc import Callable
from typing import Protocol

from .verifier import REJECTED_RESULT, ConfigurationError, VerificationResult

ACCEPTED_DECISION = "aceptado"
MAX_VERIFIER_ID_SIZE = 128
MAX_CREDENTIAL_ID_SIZE = 256


class TokenVerifier(Protocol):
    def verify(self, token: str) -> VerificationResult:
        """Decide si el token puede aceptarse."""


class AcceptedEventRecorder(Protocol):
    def append_event(
        self,
        credential_id: str,
        verifier_id: str,
        timestamp: float,
        decision: str,
    ) -> object:
        """Encadena el evento aceptado; debe lanzar si no pudo persistirlo."""


def _valid_identifier(value: object, max_size: int) -> bool:
    return (
        isinstance(value, str)
        and 0 < len(value) <= max_size
        and value.isprintable()
        and value == value.strip()
    )


class RecordingVerifier:
    """Registra en la bitacora cada validacion aceptada; falla cerrado si no puede.

    Solo los eventos aceptados se registran (Algoritmo 1, pasos 8-9): un rechazo
    no lleva `credential_id` por diseno (ADR-0011). Si el registro falla, la
    validacion se rechaza: una aceptacion sin evidencia rompe la capa de
    consolidacion local. El nonce ya quedo consumido por `Verifier`, asi que el
    titular necesita un token nuevo; es el costo deliberado de fallar cerrado.
    """

    __slots__ = ("_clock", "_logger", "_recorder", "_verifier", "_verifier_id")

    def __init__(
        self,
        verifier: TokenVerifier,
        recorder: AcceptedEventRecorder,
        verifier_id: str,
        *,
        clock: Callable[[], float] | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        if verifier is None or recorder is None:
            raise ConfigurationError
        if not _valid_identifier(verifier_id, MAX_VERIFIER_ID_SIZE):
            raise ConfigurationError

        self._verifier = verifier
        self._recorder = recorder
        self._verifier_id = verifier_id
        self._clock = clock if clock is not None else time.time
        self._logger = logger if logger is not None else logging.getLogger(__name__)

    def _reject(self, reason_code: str) -> VerificationResult:
        try:
            self._logger.warning(
                "verification_rejected",
                extra={"reason_code": reason_code},
            )
        except Exception:
            pass
        return REJECTED_RESULT

    def _timestamp(self) -> float:
        value = self._clock()
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError
        timestamp = float(value)
        if not math.isfinite(timestamp) or timestamp < 0:
            raise ValueError
        return timestamp

    def verify(self, token: str) -> VerificationResult:
        try:
            result = self._verifier.verify(token)
        except Exception:
            return self._reject("verifier_failure")

        if not isinstance(result, VerificationResult) or result.accepted is not True:
            # El motivo concreto ya lo registro Verifier con su propio codigo.
            return REJECTED_RESULT

        if not _valid_identifier(result.credential_id, MAX_CREDENTIAL_ID_SIZE):
            return self._reject("credential_id_invalid")

        try:
            self._recorder.append_event(
                result.credential_id,
                self._verifier_id,
                self._timestamp(),
                ACCEPTED_DECISION,
            )
        except Exception:
            return self._reject("evidence_log_unavailable")

        return result
