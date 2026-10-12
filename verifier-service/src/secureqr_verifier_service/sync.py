"""Descarga e instala la lista de revocación publicada (ADR-0015).

Se ejecuta aparte del servidor, programado por el sistema (cron o un temporizador
de systemd):

    python -m secureqr_verifier_service.sync

Verifica la lista antes de tocar el disco y la instala con reemplazo atómico. Si
la red o la lista fallan, el archivo vigente queda intacto y el servidor sigue
validando con él hasta que venza su antigüedad máxima.
"""

from __future__ import annotations

import logging
import os
import sys
import tempfile
import time
import urllib.request
from collections.abc import Callable, Mapping
from pathlib import Path
from urllib.parse import urlsplit

from secureqr_revocation.cache import check_freshness
from secureqr_revocation.revocation import RevocationError, RevocationList

from .service import (
    ENV_CLOCK_SKEW_SECONDS,
    ENV_REVOCATION_KEYS_DIR,
    ENV_REVOCATION_LIST_PATH,
    ENV_TRUSTED_KEYS_DIR,
    MAX_CLOCK_SKEW_SECONDS,
    RevocationLoader,
    StartupError,
    _bounded_int,
)

ENV_REVOCATION_URL = "SQRID_REVOCATION_URL"
SYNC_VARIABLES = (
    ENV_REVOCATION_URL,
    ENV_REVOCATION_LIST_PATH,
    ENV_REVOCATION_KEYS_DIR,
    ENV_TRUSTED_KEYS_DIR,
    ENV_CLOCK_SKEW_SECONDS,
)
MAX_LIST_SIZE = 4 * 1024 * 1024
FETCH_TIMEOUT_SECONDS = 15

Fetcher = Callable[[str], bytes]
Loader = Callable[[bytes], RevocationList]

UPDATED = "updated"
UNCHANGED = "unchanged"

logger = logging.getLogger(__name__)


class SyncError(Exception):
    """No se instaló una lista nueva; el archivo vigente queda intacto."""


def validate_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise SyncError(f"{ENV_REVOCATION_URL} debe ser una URL https://.")
    return url


class _HttpsOnlyRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        if urlsplit(newurl).scheme != "https":
            raise SyncError("Redirección a un esquema distinto de https.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def https_fetch(url: str) -> bytes:
    """Descarga como máximo `MAX_LIST_SIZE` bytes por HTTPS (TLS verificado)."""
    opener = urllib.request.build_opener(_HttpsOnlyRedirects)
    try:
        with opener.open(validate_url(url), timeout=FETCH_TIMEOUT_SECONDS) as response:
            data = response.read(MAX_LIST_SIZE + 1)
    except SyncError:
        raise
    except Exception as exc:
        raise SyncError("No se pudo descargar la lista de revocación.") from exc
    if len(data) > MAX_LIST_SIZE:
        raise SyncError("La lista descargada supera el tamaño máximo.")
    return data


def _write_atomically(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(descriptor, "wb") as file:
            file.write(data)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def sync_revocation_list(
    url: str,
    list_path: Path,
    loader: Loader,
    clock_skew_seconds: int,
    *,
    fetch: Fetcher = https_fetch,
    clock: Callable[[], float] = time.time,
) -> str:
    """Instala la lista publicada si es válida y más nueva que la que hay en disco."""
    validate_url(url)
    data = fetch(url)
    try:
        candidate = loader(data)
        check_freshness(candidate, int(clock()), clock_skew_seconds)
    except RevocationError as exc:
        raise SyncError(
            "La lista descargada no verifica o tiene una fecha inválida."
        ) from exc

    try:
        current = loader(list_path.read_bytes())
    except (OSError, RevocationError):
        current = None  # sin lista válida en disco, cualquier lista válida mejora
    if current is not None and candidate.issued_at <= current.issued_at:
        return UNCHANGED

    try:
        _write_atomically(list_path, data)
    except OSError as exc:
        raise SyncError("No se pudo escribir la lista de revocación.") from exc
    return UPDATED


def main(environ: Mapping[str, str] | None = None, *, fetch: Fetcher = https_fetch) -> int:
    env = os.environ if environ is None else environ
    try:
        missing = [name for name in SYNC_VARIABLES if not env.get(name, "").strip()]
        if missing:
            raise StartupError(f"Faltan variables de entorno: {', '.join(missing)}.")
        skew = _bounded_int(env, ENV_CLOCK_SKEW_SECONDS, 0, MAX_CLOCK_SKEW_SECONDS)
        loader = RevocationLoader(
            Path(env[ENV_REVOCATION_KEYS_DIR]), Path(env[ENV_TRUSTED_KEYS_DIR])
        )
        result = sync_revocation_list(
            env[ENV_REVOCATION_URL],
            Path(env[ENV_REVOCATION_LIST_PATH]),
            loader,
            skew,
            fetch=fetch,
        )
    except (StartupError, SyncError) as exc:
        print(f"secureqr-revocation-sync: {exc}", file=sys.stderr)
        return 1
    print(f"secureqr-revocation-sync: {result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
