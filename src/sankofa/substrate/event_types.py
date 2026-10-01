"""Event types — the atoms of the archive's memory."""
from datetime import datetime, timezone
from typing import Literal, Any
from pydantic import BaseModel, Field
import uuid


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
