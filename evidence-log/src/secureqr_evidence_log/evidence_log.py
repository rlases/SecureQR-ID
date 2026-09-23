"""Bitacora local de eventos, encadenada por hash (SQRID evidence-log)."""

from __future__ import annotations

import hashlib
import sqlite3
import struct
from dataclasses import dataclass

GENESIS_HASH = "0" * 64


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
    """

    def __init__(self, db_path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(db_path)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                credential_id TEXT NOT NULL,
                verifier_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                decision TEXT NOT NULL,
                previous_hash TEXT NOT NULL,
                hash TEXT NOT NULL
            )
            """
        )
        self._conn.commit()

    @property
    def events(self) -> tuple[Event, ...]:
        """Vista de solo lectura, leida directamente desde SQLite."""
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
        previous_hash = self._last_hash()
        event_hash = _compute_hash(
            credential_id, verifier_id, timestamp, decision, previous_hash
        )
        self._conn.execute(
            "INSERT INTO events "
            "(credential_id, verifier_id, timestamp, decision, previous_hash, hash) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (credential_id, verifier_id, timestamp, decision, previous_hash, event_hash),
        )
        self._conn.commit()
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

    def close(self) -> None:
        self._conn.close()