"""Compromisos externos en la bitácora anclada (enmienda de 2026-10-25 a ADR-0016, #119).

`mi-app-qr` autentica su historial `cid` → titular (`asignaciones_cid`) con HMAC y una
clave fuera de su base, pero quien controla el servidor completo (base y clave) todavía
podría reescribirlo. Para tener una garantía externa, `mi-app-qr` escribe en un archivo la
cabeza de esa cadena (número de secuencia y etiqueta HMAC) y esta bitácora la registra
como un evento más: entra al siguiente lote, su raíz de Merkle se ancla en Fabric y, desde
ese momento, una reescritura del historial anterior a ese punto contradice el ancla.

Límite de proceso por archivos (ADR-0005): ni Python importa Node ni al revés. Solo viajan
un número y un hash de 256 bits que no se puede invertir; nunca datos personales.

Formato del archivo que escribe `mi-app-qr` (`ASIGNACIONES_CABEZA_PATH`):

    {"version": 1, "fuente": "asignaciones_cid", "seq": 42, "hash": "<64 hex>"}

Formato del archivo que escribe `export-commitments` y lee `mi-app-qr`:

    {"version": 1, "cadena_valida": true, "compromisos": [
      {"fuente": "asignaciones_cid", "seq": 42, "hash": "<64 hex>", "evento": 1201,
       "anclado": true, "batch_id": "...", "transaction_id": "...", "block_number": 9}]}
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from .evidence_log import EvidenceLog, _write_json_atomically, merkle_root

FORMAT_VERSION = 1
# Marca de decisión de estos eventos: distinta de las decisiones del verificador, para
# que nadie los confunda con un paso por el punto de control.
DECISION = "compromiso_externo"
FUENTES = frozenset({"asignaciones_cid"})
_HEX64 = re.compile(r"^[0-9a-f]{64}$")


class CommitmentError(Exception):
    """El archivo de la cabeza no tiene el formato esperado; no se registra nada."""


@dataclass(frozen=True)
class Cabeza:
    fuente: str
    seq: int
    hash: str

    @property
    def credential_id(self) -> str:
        return f"{self.fuente}:{self.seq}:{self.hash}"


@dataclass(frozen=True)
class Compromiso:
    fuente: str
    seq: int
    hash: str
    evento: int
    anclado: bool
    batch_id: str | None
    transaction_id: str | None
    block_number: int | None


def parse_head(data: object) -> Cabeza:
    """Valida la cabeza que escribe `mi-app-qr`; rechaza cualquier campo de más."""
    if not isinstance(data, dict) or set(data) - {"version", "fuente", "seq", "hash", "generado_en"}:
        raise CommitmentError("La cabeza tiene campos desconocidos.")
    if data.get("version") != FORMAT_VERSION:
        raise CommitmentError("Versión de cabeza no soportada.")
    fuente, seq, head_hash = data.get("fuente"), data.get("seq"), data.get("hash")
    if fuente not in FUENTES:
        raise CommitmentError("Fuente de compromiso desconocida.")
    if isinstance(seq, bool) or not isinstance(seq, int) or seq < 0:
        raise CommitmentError("seq debe ser un entero no negativo.")
    if not isinstance(head_hash, str) or not _HEX64.match(head_hash):
        raise CommitmentError("hash debe tener 64 caracteres hexadecimales en minúscula.")
    return Cabeza(fuente, seq, head_hash)


def load_head(path: Path) -> Cabeza:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise CommitmentError("No existe el archivo de la cabeza.") from None
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        raise CommitmentError("La cabeza no es un JSON legible.") from None
    return parse_head(data)


def _ultimo(log: EvidenceLog, fuente: str) -> Cabeza | None:
    row = log._conn.execute(  # noqa: SLF001 - mismo paquete
        "SELECT credential_id FROM events WHERE decision = ? AND credential_id LIKE ? "
        "ORDER BY seq DESC LIMIT 1",
        (DECISION, f"{fuente}:%"),
    ).fetchone()
    if row is None:
        return None
    _, seq, head_hash = row[0].split(":")
    return Cabeza(fuente, int(seq), head_hash)


def commit_head(log: EvidenceLog, head: Cabeza, verifier_id: str, timestamp: float) -> bool:
    """Registra la cabeza como evento. False si ya era el último compromiso de esa fuente.

    Una cabeza que retrocede (seq menor que el último compromiso) es en sí misma una
    señal de reescritura o truncamiento: se rechaza para que alguien la investigue.
    """
    with log._lock:  # noqa: SLF001
        anterior = _ultimo(log, head.fuente)
    if anterior == head:
        return False
    if anterior is not None and head.seq < anterior.seq:
        raise CommitmentError(
            f"La cabeza retrocede (seq {head.seq} < {anterior.seq}): posible reescritura."
        )
    if anterior is not None and head.seq == anterior.seq:
        raise CommitmentError(
            f"La misma seq {head.seq} con otro hash: posible reescritura del historial."
        )
    log.append_event(head.credential_id, verifier_id, timestamp, DECISION)
    return True


def _batch_roots_ok(log: EvidenceLog) -> dict[str, bool]:
    """Recalcula la raíz de cada lote anclado desde los eventos locales."""
    resultado: dict[str, bool] = {}
    for anchor in log.anchors:
        rows = log._batch_events(anchor.first_event, anchor.last_event)  # noqa: SLF001
        hashes = tuple(h for _, h in rows)
        resultado[anchor.batch_id] = (
            len(rows) == anchor.event_count and merkle_root(hashes) == anchor.merkle_root
        )
    return resultado


def commitments(log: EvidenceLog) -> tuple[bool, list[Compromiso]]:
    """Compromisos registrados y si cada uno ya está cubierto por un anclaje íntegro.

    Un compromiso cuenta como anclado solo si la cadena local verifica y la raíz de su lote
    se recalcula igual a la anclada: si alguien tocó la bitácora, no se le cree.
    """
    cadena_valida = log.verify_chain()
    raices = _batch_roots_ok(log)
    with log._lock:  # noqa: SLF001
        rows = log._conn.execute(  # noqa: SLF001
            "SELECT seq, credential_id FROM events WHERE decision = ? ORDER BY seq",
            (DECISION,),
        ).fetchall()
    anchors = log.anchors
    salida: list[Compromiso] = []
    for evento, credential_id in rows:
        fuente, seq, head_hash = credential_id.split(":")
        anchor = next((a for a in anchors if a.first_event <= evento <= a.last_event), None)
        anclado = bool(cadena_valida and anchor is not None and raices.get(anchor.batch_id))
        salida.append(
            Compromiso(
                fuente=fuente,
                seq=int(seq),
                hash=head_hash,
                evento=evento,
                anclado=anclado,
                batch_id=anchor.batch_id if anchor else None,
                transaction_id=anchor.transaction_id if anchor else None,
                block_number=anchor.block_number if anchor else None,
            )
        )
    return cadena_valida, salida


def export_commitments(log: EvidenceLog, path: str) -> int:
    """Escribe los compromisos con reemplazo atómico, para que `mi-app-qr` los lea."""
    cadena_valida, lista = commitments(log)
    _write_json_atomically(
        path,
        {
            "version": FORMAT_VERSION,
            "cadena_valida": cadena_valida,
            "compromisos": [asdict(c) for c in lista],
        },
    )
    return len(lista)
