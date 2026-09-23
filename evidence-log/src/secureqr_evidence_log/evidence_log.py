"""Bitacora local de eventos, encadenada por hash (SQRID evidence-log)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

GENESIS_HASH = "0" * 64


def _compute_hash(
    credential_id: str,
    verifier_id: str,
    timestamp: float,
    decision: str,
    previous_hash: str,
) -> str:
    """Calcula el hash de un evento a partir de sus campos y el hash anterior."""
    payload = f"{credential_id}|{verifier_id}|{timestamp}|{decision}|{previous_hash}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Event:
    credential_id: str
    verifier_id: str
    timestamp: float
    decision: str
    previous_hash: str
    hash: str


@dataclass
class EvidenceLog:
    """Bitacora en memoria. La persistencia en disco se agrega despues."""

    events: list[Event] = field(default_factory=list)

    def _last_hash(self) -> str:
        if not self.events:
            return GENESIS_HASH
        return self.events[-1].hash

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
        event = Event(
            credential_id=credential_id,
            verifier_id=verifier_id,
            timestamp=timestamp,
            decision=decision,
            previous_hash=previous_hash,
            hash=event_hash,
        )
        self.events.append(event)
        return event