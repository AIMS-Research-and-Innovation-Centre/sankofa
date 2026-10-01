"""Append-only event store. NDJSON. Replayable forever."""
from __future__ import annotations
import json
from pathlib import Path
from threading import Lock
from typing import Iterable, Iterator
import orjson
from .event_types import Event
from ..config import settings
from ..logging import log


class EventStore:
    def __init__(self, path: str | None = None) -> None:
        self.path = Path(path or settings().event_store_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()

    def append(self, event: Event) -> Event:
        line = orjson.dumps(event.model_dump()).decode()
        with self._lock, self.path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
        log.info("event.appended", type=event.type, id=event.id)
        return event

    def stream(self) -> Iterator[Event]:
        if not self.path.exists():
            return
        with self.path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield Event(**json.loads(line))
                except Exception as exc:  # noqa: BLE001
                    log.warning("event.corrupt", error=str(exc))

    def count(self) -> int:
        return sum(1 for _ in self.stream())


_store: EventStore | None = None


def event_store() -> EventStore:
    global _store
    if _store is None:
        _store = EventStore()
    return _store
