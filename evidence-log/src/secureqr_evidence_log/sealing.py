"""Sellado diario del hash del último bloque en OpenTimestamps (issue #94, ADR-0017 punto 7).

Se sella el hash del último bloque del canal de Fabric (consulta `GetChainInfo` de `qscc`),
no una raíz: cada bloque compromete a todos los anteriores, así un solo sello cubre los
lotes de todas las instalaciones. Se usa el cliente oficial en Python (`ots`) como proceso
aparte; este módulo no implementa ninguna primitiva criptográfica.

Por cada bloque sellado quedan juntos, en el directorio de sellos:

    bloque-<hash>.txt        el hash del bloque (lo que se sella)
    bloque-<hash>.txt.ots    el comprobante de OpenTimestamps

`ots stamp` y `ots upgrade` no necesitan un nodo de Bitcoin. Sin internet o con los
servidores de calendario caídos el sello queda pendiente y se reintenta en la siguiente
corrida; nunca bloquea la validación ni el anclaje. `ots verify` sí necesita un nodo de
Bitcoin y no se ejecuta aquí: se hace aparte, desde un equipo con Bitcoin Core podado.
"""

from __future__ import annotations

import re
import subprocess
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

_BLOCK_HASH = re.compile(r"^[0-9a-f]{64}$")
Runner = Callable[..., "subprocess.CompletedProcess[str]"]


class SealingError(Exception):
    """Entrada inválida para el sellado (no es un fallo de red)."""


@dataclass(frozen=True)
class SealResult:
    block_hash: str
    stamped: bool  # existe el comprobante .ots
    upgraded: bool  # el comprobante ya se completó (sin atestaciones pendientes)

    @property
    def pending(self) -> bool:
        return not (self.stamped and self.upgraded)


def normalize_block_hash(value: str) -> str:
    candidate = value.strip().lower()
    if not _BLOCK_HASH.fullmatch(candidate):
        raise SealingError("El hash del bloque debe tener 64 caracteres hexadecimales.")
    return candidate


def _run(runner: Runner, command: Sequence[str], timeout: int) -> bool:
    try:
        result = runner(list(command), capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def _is_complete(proof: Path) -> bool:
    # Un comprobante recién creado solo trae atestaciones de calendario pendientes; al
    # completarlo con `ots upgrade`, `ots` conserva una copia `.bak` del original.
    return proof.with_name(proof.name + ".bak").exists()


def seal_block_hash(
    block_hash: str,
    seals_dir: Path,
    *,
    ots_command: Sequence[str] = ("ots",),
    timeout_seconds: int = 120,
    runner: Runner = subprocess.run,
) -> SealResult:
    """Sella `block_hash` (si no estaba sellado) e intenta completar su comprobante.

    Es idempotente: repetirla con el mismo hash no vuelve a sellar y solo reintenta el
    paso que falte. Devuelve el estado; un fallo de red no lanza excepción.
    """
    block_hash = normalize_block_hash(block_hash)
    seals_dir.mkdir(parents=True, exist_ok=True)
    stamped_file = seals_dir / f"bloque-{block_hash}.txt"
    proof = stamped_file.with_name(stamped_file.name + ".ots")
    if not stamped_file.exists():
        stamped_file.write_text(block_hash + "\n", encoding="utf-8")
    if not proof.exists():
        _run(runner, [*ots_command, "stamp", str(stamped_file)], timeout_seconds)
    if proof.exists() and not _is_complete(proof):
        _run(runner, [*ots_command, "upgrade", str(proof)], timeout_seconds)
    return SealResult(block_hash, proof.exists(), proof.exists() and _is_complete(proof))


def upgrade_pending(
    seals_dir: Path,
    *,
    ots_command: Sequence[str] = ("ots",),
    timeout_seconds: int = 120,
    runner: Runner = subprocess.run,
) -> list[SealResult]:
    """Reintenta completar los sellos del directorio que aún están pendientes."""
    results = []
    for stamped_file in sorted(seals_dir.glob("bloque-*.txt")):
        block_hash = stamped_file.stem.removeprefix("bloque-")
        if _BLOCK_HASH.fullmatch(block_hash):
            results.append(
                seal_block_hash(
                    block_hash,
                    seals_dir,
                    ots_command=ots_command,
                    timeout_seconds=timeout_seconds,
                    runner=runner,
                )
            )
    return results
