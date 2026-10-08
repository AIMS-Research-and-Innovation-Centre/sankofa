"""Event types — the atoms of the archive's memory."""
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _id() -> str:
    return uuid.uuid4().hex


class Event(BaseModel):
    id: str = Field(default_factory=_id)
    type: str
    occurred_at: str = Field(default_factory=_now)
    actor: str = "system"
    payload: dict[str, Any] = Field(default_factory=dict)


class ThesisSubmitted(Event):
    type: Literal["thesis.submitted"] = "thesis.submitted"


class ThesisRead(Event):
    type: Literal["thesis.read"] = "thesis.read"


class ConceptLinked(Event):
    type: Literal["concept.linked"] = "concept.linked"


class DreamEmitted(Event):
    type: Literal["dream.emitted"] = "dream.emitted"


class MetadataCurated(Event):
    type: Literal["metadata.curated"] = "metadata.curated"


class DoiChanged(Event):
    type: Literal["doi.changed"] = "doi.changed"


class RepositoryAccessChanged(Event):
    type: Literal["repository.access_changed"] = "repository.access_changed"
