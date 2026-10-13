"""Bitacora local de eventos, encadenada por hash (SQRID evidence-log)."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
import struct
import tempfile
import threading
from dataclasses import asdict, dataclass

GENESIS_HASH = "0" * 64
BATCH_FORMAT_VERSION = 1
DEFAULT_MAX_BATCH_EVENTS = 500  # ADR-0017; configurable desde la línea de comandos
DEFAULT_STALE_AFTER_SECONDS = 2 * 3600  # ADR-0017; alerta tras 2 horas sin anclar
_HEX64 = re.compile(r"^[0-9a-f]{64}$")


class AnchoringError(Exception):
    """Un recibo de anclaje no corresponde a la bitácora; no se registra nada."""


class AnchorMismatchError(AnchoringError):
    """El lote ya tiene un anclaje registrado con datos distintos: hay que investigar."""


def batch_id_for(first_event: int, last_event: int) -> str:
    """`loteId` determinista (ADR-0017): el mismo rango siempre da el mismo id."""
    return f"seq-{first_event:06d}-{last_event:06d}"


@dataclass(frozen=True)
class Batch:
    """Lote contiguo de eventos aún no anclados, en orden de secuencia."""

    batch_id: str
    first_event: int
    last_event: int
    hashes: tuple[str, ...]

    def to_json(self) -> dict[str, object]:
        return {
            "version": BATCH_FORMAT_VERSION,
            "batch_id": self.batch_id,
            "first_event": self.first_event,
            "last_event": self.last_event,
            "hashes": list(self.hashes),
        }


@dataclass(frozen=True)
class AnchorReceipt:
    """Recibo que escribe `anchor/` tras publicar la raíz en Fabric (ADR-0017)."""

    batch_id: str
    merkle_root: str
    first_event: int
    last_event: int
    event_count: int
    transaction_id: str
    block_number: int
    anchored_at: float

    @classmethod
    def from_json(cls, data: object) -> AnchorReceipt:
        fields = {
            "batch_id": str,
            "merkle_root": str,
            "first_event": int,
            "last_event": int,
            "event_count": int,
            "transaction_id": str,
            "block_number": int,
            "anchored_at": (int, float),
        }
        if not isinstance(data, dict) or data.get("version") != BATCH_FORMAT_VERSION:
            raise AnchoringError("El recibo no tiene el formato esperado.")
        values = {}
        for name, kind in fields.items():
            value = data.get(name)
            if isinstance(value, bool) or not isinstance(value, kind):
                raise AnchoringError(f"El recibo no tiene un campo {name} válido.")
            values[name] = value
        receipt = cls(**values)
        receipt.validate()
        return receipt

    def validate(self) -> None:
        if self.first_event < 1 or self.last_event < self.first_event:
            raise AnchoringError("El rango de eventos del recibo no es válido.")
        if self.batch_id != batch_id_for(self.first_event, self.last_event):
            raise AnchoringError("El loteId no corresponde al rango de eventos.")
        if not _HEX64.match(self.merkle_root):
            raise AnchoringError("La raíz de Merkle del recibo no es un hash válido.")
        if not self.transaction_id.strip() or self.block_number < 0:
            raise AnchoringError("El recibo no identifica la transacción en Fabric.")
        if not math.isfinite(float(self.anchored_at)) or self.anchored_at < 0:
            raise AnchoringError("La fecha del recibo no es válida.")


@dataclass(frozen=True)
class AnchoringStatus:
    """Lo que el panel de `mi-app-qr` necesita para alertar (ADR-0017)."""

    pending_events: int
    oldest_pending_timestamp: float | None
    last_batch_id: str | None
    last_anchored_at: float | None
    stale: bool

    def to_json(self) -> dict[str, object]:
        return asdict(self)


def _encode_field(value: str) -> bytes:
    """Codifica un campo de texto con su longitud como prefijo (4 bytes, big-endian).

    Concatenar campos con un separador de texto es ambiguo: si un campo pudiera
    contener el separador, dos eventos con contenido distinto producirian el
    mismo payload y por lo tanto el mismo hash (p. ej. credential_id="X|Y",
    verifier_id="Z" frente a credential_id="X", verifier_id="Y|Z"). El prefijo
    de longitud elimina esa ambiguedad sin depender de que ningun campo evite
    un caracter en particular.
    """
    data = value.encode("utf-8")
    return len(data).to_bytes(4, "big") + data


def _compute_hash(
    credential_id: str,
    verifier_id: str,
    timestamp: float,
    decision: str,
    previous_hash: str,
) -> str:
    """Calcula el hash de un evento a partir de sus campos y el hash anterior."""
    payload = (
        _encode_field(credential_id)
        + _encode_field(verifier_id)
        + struct.pack(">d", timestamp)
        + _encode_field(decision)
        + _encode_field(previous_hash)
    )
    return hashlib.sha256(payload).hexdigest()


@dataclass(frozen=True)
class Event:
    credential_id: str
    verifier_id: str
    timestamp: float
    decision: str
    previous_hash: str
    hash: str


class EvidenceLog:
    """Bitacora append-only respaldada en SQLite.

    db_path=":memory:" (por defecto) mantiene todo en memoria, util para pruebas
    rapidas. Pasando una ruta de archivo, los eventos sobreviven a reiniciar
    el programa.

    Una misma instancia puede usarse desde varios hilos (p. ej. el pool de un
    servidor ASGI), y varias instancias o procesos pueden apuntar al mismo
    archivo: cada escritura lee el ultimo hash e inserta el evento dentro de una
    transaccion `BEGIN IMMEDIATE`, de modo que dos escrituras concurrentes nunca
    encadenan sobre el mismo predecesor (eso bifurcaria la cadena).
    """

    def __init__(self, db_path: str = ":memory:") -> None:
        # isolation_level=None: las transacciones se abren y cierran de forma
        # explicita, para poder pedir el bloqueo de escritura (IMMEDIATE) antes
        # de leer el ultimo hash, y no despues como haria el modo implicito.
        self._conn = sqlite3.connect(
            db_path, check_same_thread=False, isolation_level=None
        )
        self._lock = threading.Lock()
        # anchored_at y merkle_root quedan en `events` solo por compatibilidad con
        # bitácoras creadas antes de ADR-0017: ya no se escriben ni se leen. El estado
        # de anclaje vive en la tabla `anclajes`, de solo agregar.
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                credential_id TEXT NOT NULL,
                verifier_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                decision TEXT NOT NULL,
                previous_hash TEXT NOT NULL,
                hash TEXT NOT NULL,
                anchored_at REAL,
                merkle_root TEXT
            );
            CREATE TABLE IF NOT EXISTS anclajes (
                batch_id TEXT PRIMARY KEY,
                first_event INTEGER NOT NULL,
                last_event INTEGER NOT NULL,
                event_count INTEGER NOT NULL,
                merkle_root TEXT NOT NULL,
                transaction_id TEXT NOT NULL,
                block_number INTEGER NOT NULL,
                anchored_at REAL NOT NULL,
                recorded_at REAL NOT NULL
            );
            CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
            BEGIN SELECT RAISE(ABORT, 'La bitácora es de solo agregar'); END;
            CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
            BEGIN SELECT RAISE(ABORT, 'La bitácora es de solo agregar'); END;
            CREATE TRIGGER IF NOT EXISTS anclajes_no_update BEFORE UPDATE ON anclajes
            BEGIN SELECT RAISE(ABORT, 'Los anclajes son de solo agregar'); END;
            CREATE TRIGGER IF NOT EXISTS anclajes_no_delete BEFORE DELETE ON anclajes
            BEGIN SELECT RAISE(ABORT, 'Los anclajes son de solo agregar'); END;
            """
        )

    @property
    def events(self) -> tuple[Event, ...]:
        """Vista de solo lectura, leida directamente desde SQLite."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT credential_id, verifier_id, timestamp, decision, "
                "previous_hash, hash FROM events ORDER BY seq"
            ).fetchall()
        return tuple(Event(*row) for row in rows)

    def _last_hash(self) -> str:
        row = self._conn.execute(
            "SELECT hash FROM events ORDER BY seq DESC LIMIT 1"
        ).fetchone()
        return row[0] if row else GENESIS_HASH

    def append_event(
        self,
        credential_id: str,
        verifier_id: str,
        timestamp: float,
        decision: str,
    ) -> Event:
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                previous_hash = self._last_hash()
                event_hash = _compute_hash(
                    credential_id, verifier_id, timestamp, decision, previous_hash
                )
                self._conn.execute(
                    "INSERT INTO events "
                    "(credential_id, verifier_id, timestamp, decision, "
                    "previous_hash, hash) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        credential_id,
                        verifier_id,
                        timestamp,
                        decision,
                        previous_hash,
                        event_hash,
                    ),
                )
                self._conn.execute("COMMIT")
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
        return Event(
            credential_id=credential_id,
            verifier_id=verifier_id,
            timestamp=timestamp,
            decision=decision,
            previous_hash=previous_hash,
            hash=event_hash,
        )

    def verify_chain(self) -> bool:
        """Recalcula cada hash y comprueba que la cadena no fue alterada."""
        previous_hash = GENESIS_HASH
        for event in self.events:
            if event.previous_hash != previous_hash:
                return False
            expected_hash = _compute_hash(
                event.credential_id,
                event.verifier_id,
                event.timestamp,
                event.decision,
                event.previous_hash,
            )
            if event.hash != expected_hash:
                return False
            previous_hash = event.hash
        return True

    # --- Anclaje (ADR-0017) ------------------------------------------------------

    def _anchored_until(self) -> int:
        row = self._conn.execute("SELECT MAX(last_event) FROM anclajes").fetchone()
        return row[0] or 0

    def pending_batch(self, max_events: int = DEFAULT_MAX_BATCH_EVENTS) -> Batch | None:
        """Siguiente lote contiguo sin anclar, de hasta `max_events` eventos.

        Los lotes nunca se solapan ni dejan huecos: empiezan justo después del último
        evento anclado. Mientras su recibo no se registre, el mismo rango vuelve a salir
        con el mismo `batch_id`, así un reintento nunca crea un lote distinto.
        """
        if isinstance(max_events, bool) or not isinstance(max_events, int) or max_events < 1:
            raise ValueError("max_events debe ser un entero positivo.")
        with self._lock:
            rows = self._conn.execute(
                "SELECT seq, hash FROM events WHERE seq > ? ORDER BY seq LIMIT ?",
                (self._anchored_until(), max_events),
            ).fetchall()
        if not rows:
            return None
        first, last = rows[0][0], rows[-1][0]
        return Batch(batch_id_for(first, last), first, last, tuple(h for _, h in rows))

    def export_pending_batch(
        self, path: str, max_events: int = DEFAULT_MAX_BATCH_EVENTS
    ) -> Batch | None:
        """Escribe en `path` el siguiente lote (solo hashes y números de evento, nunca
        datos personales). Si no hay eventos pendientes, no escribe nada."""
        batch = self.pending_batch(max_events)
        if batch is None:
            return None
        _write_json_atomically(path, batch.to_json())
        return batch

    def record_anchor(self, receipt: AnchorReceipt, recorded_at: float) -> bool:
        """Registra el recibo de un lote anclado. Devuelve False si ya estaba.

        Es idempotente: registrar dos veces el mismo recibo no cambia nada. Un recibo
        distinto para un lote ya registrado lanza `AnchorMismatchError`.
        """
        receipt.validate()
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                existing = self._conn.execute(
                    "SELECT batch_id, merkle_root, first_event, last_event, event_count, "
                    "transaction_id, block_number, anchored_at FROM anclajes "
                    "WHERE batch_id = ?",
                    (receipt.batch_id,),
                ).fetchone()
                if existing is not None:
                    self._conn.execute("ROLLBACK")
                    if AnchorReceipt(*existing) != receipt:
                        raise AnchorMismatchError(
                            f"El lote {receipt.batch_id} ya tiene un anclaje distinto."
                        )
                    return False

                expected_first = self._conn.execute(
                    "SELECT MIN(seq) FROM events WHERE seq > ?", (self._anchored_until(),)
                ).fetchone()[0]
                if receipt.first_event != expected_first:
                    raise AnchoringError(
                        "El recibo no empieza en el primer evento sin anclar."
                    )
                count = self._conn.execute(
                    "SELECT COUNT(*) FROM events WHERE seq BETWEEN ? AND ?",
                    (receipt.first_event, receipt.last_event),
                ).fetchone()[0]
                span = receipt.last_event - receipt.first_event + 1
                if count != receipt.event_count or count != span:
                    raise AnchoringError(
                        "La cantidad de eventos del recibo no coincide con la bitácora."
                    )
                self._conn.execute(
                    "INSERT INTO anclajes (batch_id, first_event, last_event, event_count, "
                    "merkle_root, transaction_id, block_number, anchored_at, recorded_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        receipt.batch_id,
                        receipt.first_event,
                        receipt.last_event,
                        receipt.event_count,
                        receipt.merkle_root,
                        receipt.transaction_id,
                        receipt.block_number,
                        float(receipt.anchored_at),
                        float(recorded_at),
                    ),
                )
                self._conn.execute("COMMIT")
            except AnchorMismatchError:
                raise
            except BaseException:
                if self._conn.in_transaction:
                    self._conn.execute("ROLLBACK")
                raise
        return True

    @property
    def anchors(self) -> tuple[AnchorReceipt, ...]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT batch_id, merkle_root, first_event, last_event, event_count, "
                "transaction_id, block_number, anchored_at FROM anclajes "
                "ORDER BY first_event"
            ).fetchall()
        return tuple(AnchorReceipt(*row) for row in rows)

    def is_anchored(self, seq: int) -> bool:
        """Un evento está anclado si cae dentro del rango de algún anclaje."""
        with self._lock:
            row = self._conn.execute(
                "SELECT 1 FROM anclajes WHERE ? BETWEEN first_event AND last_event",
                (seq,),
            ).fetchone()
        return row is not None

    def anchoring_status(
        self, now: float, stale_after_seconds: float = DEFAULT_STALE_AFTER_SECONDS
    ) -> AnchoringStatus:
        """Estado del anclaje; `stale` indica que el panel debe alertar."""
        with self._lock:
            until = self._anchored_until()
            pending, oldest = self._conn.execute(
                "SELECT COUNT(*), MIN(timestamp) FROM events WHERE seq > ?", (until,)
            ).fetchone()
            last = self._conn.execute(
                "SELECT batch_id, recorded_at FROM anclajes "
                "ORDER BY last_event DESC LIMIT 1"
            ).fetchone()
        stale = bool(pending) and oldest is not None and now - oldest > stale_after_seconds
        return AnchoringStatus(
            pending_events=pending,
            oldest_pending_timestamp=oldest,
            last_batch_id=last[0] if last else None,
            last_anchored_at=last[1] if last else None,
            stale=stale,
        )

    def close(self) -> None:
        with self._lock:
            self._conn.close()


def _write_json_atomically(path: str, data: dict[str, object]) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=directory, prefix=".lote.")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            json.dump(data, file)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise
