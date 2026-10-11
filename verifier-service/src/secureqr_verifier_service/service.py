"""Punto de arranque de producción del verificador (issue #46, ADR-0014).

Es la capa de aplicación: compone `verifier/`, `revocation/` y `evidence-log/`
sin añadir reglas de validación propias. Todo sale de configuración explícita y,
si cualquier dependencia no es confiable, el servicio no arranca.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI
from secureqr_evidence_log.evidence_log import EvidenceLog
from secureqr_revocation.revocation import (
    RevocationError,
    RevocationList,
    read_key_id,
)
from secureqr_verifier import (
    DirectoryKeyResolver,
    KeyResolutionError,
    RecordingVerifier,
    ReplayStoreError,
    SqliteReplayStore,
    Verifier,
)
from secureqr_verifier.verifier import MAX_CLOCK_SKEW_SECONDS, ConfigurationError
from secureqr_verifier.web import create_app

ENV_VERIFIER_ID = "SQRID_VERIFIER_ID"
ENV_TRUSTED_KEYS_DIR = "SQRID_TRUSTED_KEYS_DIR"
ENV_REVOCATION_KEYS_DIR = "SQRID_REVOCATION_KEYS_DIR"
ENV_REVOCATION_LIST_PATH = "SQRID_REVOCATION_LIST_PATH"
ENV_REPLAY_DB_PATH = "SQRID_REPLAY_DB_PATH"
ENV_EVIDENCE_DB_PATH = "SQRID_EVIDENCE_DB_PATH"
ENV_CLOCK_SKEW_SECONDS = "SQRID_CLOCK_SKEW_SECONDS"

REQUIRED_VARIABLES = (
    ENV_VERIFIER_ID,
    ENV_TRUSTED_KEYS_DIR,
    ENV_REVOCATION_KEYS_DIR,
    ENV_REVOCATION_LIST_PATH,
    ENV_REPLAY_DB_PATH,
    ENV_EVIDENCE_DB_PATH,
    ENV_CLOCK_SKEW_SECONDS,
)


class StartupError(ConfigurationError):
    """El servicio no puede arrancar de forma segura.

    El mensaje es para quien opera el servidor: nombra la variable o la etapa,
    nunca contenidos de claves, listas ni identificadores de credencial.
    """


@dataclass(frozen=True, slots=True)
class ServiceConfig:
    verifier_id: str
    trusted_keys_dir: Path
    revocation_keys_dir: Path
    revocation_list_path: Path
    replay_db_path: Path
    evidence_db_path: Path
    clock_skew_seconds: int

    @classmethod
    def from_environment(cls, environ: Mapping[str, str] | None = None) -> ServiceConfig:
        env = os.environ if environ is None else environ
        missing = [name for name in REQUIRED_VARIABLES if not env.get(name, "").strip()]
        if missing:
            raise StartupError(f"Faltan variables de entorno: {', '.join(missing)}.")

        raw_skew = env[ENV_CLOCK_SKEW_SECONDS].strip()
        if not raw_skew.isdigit() or not 0 <= int(raw_skew) <= MAX_CLOCK_SKEW_SECONDS:
            raise StartupError(
                f"{ENV_CLOCK_SKEW_SECONDS} debe ser un entero entre 0 y "
                f"{MAX_CLOCK_SKEW_SECONDS}."
            )

        return cls(
            verifier_id=env[ENV_VERIFIER_ID],
            trusted_keys_dir=Path(env[ENV_TRUSTED_KEYS_DIR]),
            revocation_keys_dir=Path(env[ENV_REVOCATION_KEYS_DIR]),
            revocation_list_path=Path(env[ENV_REVOCATION_LIST_PATH]),
            replay_db_path=Path(env[ENV_REPLAY_DB_PATH]),
            evidence_db_path=Path(env[ENV_EVIDENCE_DB_PATH]),
            clock_skew_seconds=int(raw_skew),
        )


def _same_path(first: Path, second: Path) -> bool:
    return first.resolve() == second.resolve()


def load_revocation_list(
    list_path: Path, revocation_keys_dir: Path, trusted_keys_dir: Path
) -> RevocationList:
    """Carga y verifica la lista firmada con una clave de revocación dedicada.

    La clave se elige por el `kid` de la lista desde un directorio propio, que no
    puede ser el de las claves de emisión: si lo fuera, una clave de emisión
    podría firmar listas y una de revocación podría firmar tokens.
    """
    try:
        token_keys = DirectoryKeyResolver(trusted_keys_dir)
        revocation_keys = DirectoryKeyResolver(revocation_keys_dir)
    except KeyResolutionError:
        raise StartupError(
            f"{ENV_TRUSTED_KEYS_DIR} y {ENV_REVOCATION_KEYS_DIR} deben ser directorios "
            "existentes."
        ) from None
    if _same_path(trusted_keys_dir, revocation_keys_dir):
        raise StartupError(
            f"{ENV_REVOCATION_KEYS_DIR} debe ser distinto de {ENV_TRUSTED_KEYS_DIR}."
        )

    try:
        signed_bytes = list_path.read_bytes()
        key_id = read_key_id(signed_bytes)
        public_key = revocation_keys.resolve(key_id)
        revocation_list = RevocationList.from_signed_bytes(
            signed_bytes, public_key, expected_key_id=key_id
        )
    except (OSError, RevocationError, KeyResolutionError):
        raise StartupError(
            "La lista de revocación no existe, no es válida o no está firmada por una "
            f"clave de {ENV_REVOCATION_KEYS_DIR}."
        ) from None

    try:
        token_keys.resolve(key_id)
    except KeyResolutionError:
        return revocation_list
    raise StartupError(
        "La clave que firma la lista de revocación también está en "
        f"{ENV_TRUSTED_KEYS_DIR}; las claves de emisión y de revocación deben ser "
        "distintas."
    )


def _open_evidence_log(path: Path, replay_db_path: Path) -> EvidenceLog:
    if str(path).strip() == ":memory:":
        raise StartupError(f"{ENV_EVIDENCE_DB_PATH} debe ser un archivo persistente.")
    if _same_path(path, replay_db_path):
        raise StartupError(
            f"{ENV_EVIDENCE_DB_PATH} debe ser distinto de {ENV_REPLAY_DB_PATH}."
        )
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        evidence_log = EvidenceLog(str(path))
        chain_ok = evidence_log.verify_chain()
    except Exception:
        raise StartupError(f"No se pudo abrir la bitácora en {ENV_EVIDENCE_DB_PATH}.") from None
    if not chain_ok:
        evidence_log.close()
        raise StartupError(
            "La bitácora existente no supera verify_chain(); se detectó una alteración "
            "y el servicio no arranca sobre una cadena rota."
        )
    return evidence_log


def build_verifier(
    config: ServiceConfig,
    *,
    clock: Callable[[], float] | None = None,
    logger: logging.Logger | None = None,
) -> RecordingVerifier:
    """Construye el verificador real: claves, replay, revocación y bitácora."""
    revocation_list = load_revocation_list(
        config.revocation_list_path,
        config.revocation_keys_dir,
        config.trusted_keys_dir,
    )
    try:
        replay_store = SqliteReplayStore(config.replay_db_path)
    except ReplayStoreError:
        raise StartupError(f"No se pudo abrir el almacén de nonces en {ENV_REPLAY_DB_PATH}.") from None
    evidence_log = _open_evidence_log(config.evidence_db_path, config.replay_db_path)

    try:
        verifier = Verifier(
            DirectoryKeyResolver(config.trusted_keys_dir),
            replay_store,
            revocation_list,
            config.clock_skew_seconds,
            clock=clock,
            logger=logger,
        )
        return RecordingVerifier(
            verifier,
            evidence_log,
            config.verifier_id,
            clock=clock,
            logger=logger,
        )
    except ConfigurationError:
        evidence_log.close()
        raise StartupError(
            f"{ENV_VERIFIER_ID} debe ser texto imprimible de hasta 128 caracteres, sin "
            "espacios en los extremos."
        ) from None


def create_service_app(
    config: ServiceConfig,
    *,
    clock: Callable[[], float] | None = None,
    logger: logging.Logger | None = None,
) -> FastAPI:
    return create_app(build_verifier(config, clock=clock, logger=logger), logger=logger)


def create_app_from_environment() -> FastAPI:
    """Fábrica para un servidor ASGI (`uvicorn --factory`)."""
    return create_service_app(ServiceConfig.from_environment())
