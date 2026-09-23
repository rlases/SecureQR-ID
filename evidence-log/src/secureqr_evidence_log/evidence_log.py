"""Bitacora local de eventos, encadenada por hash (SQRID evidence-log)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

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


class EvidenceLog:
    """Bitacora append-only: los eventos solo se agregan, nunca se editan ni se borran."""

    def __init__(self) -> None:
        self._events: list[Event] = []

    @property
    def events(self) -> tuple[Event, ...]:
        """Vista de solo lectura. No tiene 'setter': no se puede hacer log.events = ..."""
        return tuple(self._events)

    def _last_hash(self) -> str:
        if not self._events:
            return GENESIS_HASH
        return self._events[-1].hash

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
        self._events.append(event)
        return event

    def verify_chain(self) -> bool:
        """Recalcula cada hash y comprueba que la cadena no fue alterada."""
        previous_hash = GENESIS_HASH
        for event in self._events:
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