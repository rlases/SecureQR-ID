from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Protocol


class ReplayStoreError(Exception):
    """El estado persistente de replay no esta disponible."""


class ReplayStore(Protocol):
    def observe_time(self, now: int, clock_skew_seconds: int) -> bool:
        """Registra el maximo temporal y rechaza retrocesos fuera de tolerancia."""

    def has_seen(self, key_id: str, nonce: bytes, now: int) -> bool:
        """Indica si el nonce ya fue aceptado."""

    def consume(
        self, key_id: str, nonce: bytes, valid_until: int, now: int
    ) -> bool:
        """Consume el nonce de forma atomica si todavia no existe."""


class SqliteReplayStore:
    """Estado de replay durable y seguro frente a verificaciones concurrentes."""

    __slots__ = ("_database_path",)

    def __init__(self, database_path: str | Path) -> None:
        try:
            path_text = str(database_path)
            path = Path(database_path)
        except (TypeError, ValueError):
            raise ReplayStoreError from None
        if not path_text.strip() or path_text == ":memory:":
            raise ReplayStoreError
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            self._database_path = path
            with self._connect() as connection:
                connection.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS seen_nonces (
                        kid TEXT NOT NULL,
                        nonce BLOB NOT NULL,
                        valid_until INTEGER NOT NULL,
                        PRIMARY KEY (kid, nonce)
                    ) WITHOUT ROWID;
                    CREATE INDEX IF NOT EXISTS seen_nonces_valid_until
                        ON seen_nonces (valid_until);
                    CREATE TABLE IF NOT EXISTS verifier_state (
                        key TEXT PRIMARY KEY,
                        value INTEGER NOT NULL
                    ) WITHOUT ROWID;
                    """
                )
        except (OSError, sqlite3.Error):
            raise ReplayStoreError from None

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._database_path, timeout=5.0)
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def observe_time(self, now: int, clock_skew_seconds: int) -> bool:
        try:
            with self._connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    "SELECT value FROM verifier_state WHERE key = 'clock_high_water'"
                ).fetchone()
                if row is not None and now + clock_skew_seconds < row[0]:
                    return False
                if row is None or now > row[0]:
                    connection.execute(
                        """
                        INSERT INTO verifier_state (key, value)
                        VALUES ('clock_high_water', ?)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value
                        """,
                        (now,),
                    )
                return True
        except (OSError, OverflowError, sqlite3.Error):
            raise ReplayStoreError from None

    @staticmethod
    def _purge(connection: sqlite3.Connection, now: int) -> None:
        connection.execute(
            "DELETE FROM seen_nonces WHERE valid_until <= ?",
            (now,),
        )

    def has_seen(self, key_id: str, nonce: bytes, now: int) -> bool:
        try:
            with self._connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                self._purge(connection, now)
                row = connection.execute(
                    "SELECT 1 FROM seen_nonces WHERE kid = ? AND nonce = ?",
                    (key_id, nonce),
                ).fetchone()
                return row is not None
        except (OSError, OverflowError, sqlite3.Error):
            raise ReplayStoreError from None

    def consume(
        self, key_id: str, nonce: bytes, valid_until: int, now: int
    ) -> bool:
        try:
            with self._connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                self._purge(connection, now)
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO seen_nonces (kid, nonce, valid_until)
                    VALUES (?, ?, ?)
                    """,
                    (key_id, nonce, valid_until),
                )
                return cursor.rowcount == 1
        except (OSError, OverflowError, sqlite3.Error):
            raise ReplayStoreError from None
