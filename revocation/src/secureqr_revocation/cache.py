"""Lista de revocación en caché con recarga en caliente y antigüedad máxima (ADR-0015)."""

from __future__ import annotations

import logging
import math
import os
import threading
import time
from collections.abc import Callable
from pathlib import Path

from .revocation import RevocationError, RevocationList

MIN_MAX_AGE_SECONDS = 60
MAX_MAX_AGE_SECONDS = 30 * 24 * 3600
MAX_REFRESH_SECONDS = 3600
MAX_CLOCK_SKEW_SECONDS = 60

Loader = Callable[[bytes], RevocationList]


def _valid_int(value: object, minimum: int, maximum: int) -> bool:
    return (
        type(value) is int and minimum <= value <= maximum  # bool excluido a propósito
    )


def check_freshness(
    revocation_list: RevocationList, now: int, clock_skew_seconds: int
) -> None:
    """Rechaza listas sin `iat` o con `iat` en el futuro más allá de la tolerancia."""
    issued_at = revocation_list.issued_at
    if type(issued_at) is not int or issued_at > now + clock_skew_seconds:
        raise RevocationError("La lista de revocación tiene una fecha inválida.")


class RevocationListCache:
    """Cumple `RevocationChecker`: consulta la lista vigente y la mantiene al día.

    - Como máximo una vez cada `refresh_seconds`, revisa si el archivo cambió
      (tamaño y fecha de modificación) y, si cambió, lo carga con `loader`, que
      verifica la firma. Es una lectura de disco local: nunca toca la red.
    - Solo instala una lista con `iat` posterior a la vigente (antirretroceso).
    - Si la lista vigente supera `max_age_seconds`, `is_revoked` lanza
      `RevocationError` y el verificador rechaza (falla cerrado).
    """

    __slots__ = (
        "_clock",
        "_clock_skew_seconds",
        "_current",
        "_file_signature",
        "_last_check",
        "_loader",
        "_lock",
        "_logger",
        "_max_age_seconds",
        "_path",
        "_refresh_seconds",
    )

    def __init__(
        self,
        path: str | os.PathLike[str],
        loader: Loader,
        *,
        max_age_seconds: int,
        refresh_seconds: int,
        clock_skew_seconds: int,
        clock: Callable[[], float] | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        if loader is None or not callable(loader):
            raise RevocationError("Falta el cargador de la lista de revocación.")
        if not _valid_int(max_age_seconds, MIN_MAX_AGE_SECONDS, MAX_MAX_AGE_SECONDS):
            raise RevocationError("Antigüedad máxima de la lista fuera de límites.")
        if not _valid_int(refresh_seconds, 1, MAX_REFRESH_SECONDS) or (
            refresh_seconds >= max_age_seconds
        ):
            raise RevocationError("Intervalo de recarga de la lista fuera de límites.")
        if not _valid_int(clock_skew_seconds, 0, MAX_CLOCK_SKEW_SECONDS):
            raise RevocationError("Tolerancia de reloj fuera de límites.")

        self._path = Path(path)
        self._loader = loader
        self._max_age_seconds = max_age_seconds
        self._refresh_seconds = refresh_seconds
        self._clock_skew_seconds = clock_skew_seconds
        self._clock = clock if clock is not None else time.time
        self._logger = logger if logger is not None else logging.getLogger(__name__)
        self._lock = threading.Lock()

        # La carga inicial sí propaga el error: sin lista válida no hay servicio
        # (ADR-0014). Una lista válida pero vencida no impide arrancar (ADR-0015).
        now = self._now()
        signature = self._stat()
        revocation_list = self._load()
        check_freshness(revocation_list, now, self._clock_skew_seconds)
        self._current = revocation_list
        self._file_signature = signature
        self._last_check = now

    @property
    def current(self) -> RevocationList:
        return self._current

    def _now(self) -> int:
        value = self._clock()
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise RevocationError("Reloj no disponible.")
        if isinstance(value, float) and not math.isfinite(value):
            raise RevocationError("Reloj no disponible.")
        return int(value)

    def _stat(self) -> tuple[int, int, int]:
        try:
            stat = self._path.stat()
        except OSError as exc:
            raise RevocationError("No se pudo leer la lista de revocación.") from exc
        # El inodo cambia con os.replace aunque tamaño y fecha coincidan.
        return stat.st_ino, stat.st_size, stat.st_mtime_ns

    def _load(self) -> RevocationList:
        try:
            signed_bytes = self._path.read_bytes()
        except OSError as exc:
            raise RevocationError("No se pudo leer la lista de revocación.") from exc
        revocation_list = self._loader(signed_bytes)
        if not isinstance(revocation_list, RevocationList):
            raise RevocationError("El cargador no devolvió una lista verificada.")
        return revocation_list

    def _log(self, reason_code: str) -> None:
        try:
            self._logger.warning(
                "revocation_list_not_reloaded", extra={"reason_code": reason_code}
            )
        except Exception:
            pass

    def refresh(self, now: int | None = None) -> bool:
        """Intenta instalar una lista más reciente. Devuelve True si la cambió.

        Nunca lanza por una lista nueva defectuosa: conserva la vigente.
        """
        with self._lock:
            now = self._now() if now is None else now
            self._last_check = now
            try:
                signature = self._stat()
            except RevocationError:
                self._log("list_unreadable")
                return False
            if signature == self._file_signature:
                return False
            try:
                candidate = self._load()
                check_freshness(candidate, now, self._clock_skew_seconds)
            except Exception:
                self._log("list_invalid")
                return False
            # Se recuerda el archivo para no reintentar en cada consulta, aunque
            # se descarte: un archivo distinto volverá a cambiar su firma.
            self._file_signature = signature
            if candidate.issued_at <= self._current.issued_at:
                self._log("list_rollback")
                return False
            self._current = candidate
            return True

    def is_revoked(self, credential_id: str) -> bool:
        now = self._now()
        if now - self._last_check >= self._refresh_seconds or now < self._last_check:
            self.refresh(now)
        current = self._current
        if now - current.issued_at > self._max_age_seconds:
            raise RevocationError("La lista de revocación está vencida.")
        return current.is_revoked(credential_id)
