from __future__ import annotations

from pathlib import Path

import pytest
from secureqr_verifier import ReplayStoreError, SqliteReplayStore


def test_memory_database_is_not_allowed() -> None:
    with pytest.raises(ReplayStoreError):
        SqliteReplayStore(":memory:")


def test_missing_database_path_is_not_allowed() -> None:
    with pytest.raises(ReplayStoreError):
        SqliteReplayStore(None)  # type: ignore[arg-type]


def test_nonce_is_persistent_and_purged_only_after_validity(tmp_path: Path) -> None:
    database_path = tmp_path / "replay.sqlite3"
    store = SqliteReplayStore(database_path)

    assert store.consume("kid", b"n" * 16, valid_until=20, now=10) is True
    assert SqliteReplayStore(database_path).has_seen("kid", b"n" * 16, 19) is True
    assert SqliteReplayStore(database_path).has_seen("kid", b"n" * 16, 20) is False


def test_clock_high_water_is_persistent(tmp_path: Path) -> None:
    database_path = tmp_path / "replay.sqlite3"
    store = SqliteReplayStore(database_path)

    assert store.observe_time(100, 5) is True
    assert SqliteReplayStore(database_path).observe_time(94, 5) is False
    assert SqliteReplayStore(database_path).observe_time(95, 5) is True
