"""Authorised DSpace-to-Sankofa derivative synchronisation."""
from __future__ import annotations

import hashlib
import tempfile
from typing import Any

from ..dspace import DSpaceClient, DSpaceError
from ..graph.client import graph
from ..graph.embeddings.qdrant_client import vectors
from ..substrate.event_store import event_store
from ..substrate.event_types import RepositoryAccessChanged
from .pipeline import ingest


def _values(item: dict[str, Any], key: str) -> list[str]:
    values: list[str] = []
    for entry in item.get("metadata", {}).get(key, []) if isinstance(item.get("metadata"), dict) else []:
        if isinstance(entry, dict) and entry.get("value"):
            values.append(str(entry["value"]))
    return values


def _is_authorised(item: dict[str, Any]) -> tuple[bool, str]:
    if item.get("withdrawn") is True or item.get("inArchive") is not True:
        return False, "item is not archived or has been withdrawn"
    access = (_values(item, "dc.rights.accessRights") or ["open"])[0].lower()
    if access not in {"open", "open access", "public"}:
        return False, "only open-access items may be indexed by Sankofa"
    index_flag = (_values(item, "aims.ai.index") or [""])[0].lower()
    if index_flag not in {"true", "yes", "1", "authorised"}:
        return False, "librarian must set aims.ai.index=true before AI indexing"
    return True, "authorised"


def sync_item(dspace: DSpaceClient, uuid: str, *, token: str) -> dict[str, Any]:
    item = dspace.item(uuid, token=token)
    allowed, reason = _is_authorised(item)
    if not allowed:
        thesis_id = "aims-" + hashlib.sha1(uuid.encode()).hexdigest()[:10]
        graph().remove_thesis(thesis_id)
        vectors().remove(thesis_id)
        event_store().append(RepositoryAccessChanged(payload={"dspace_uuid": uuid, "thesis_id": thesis_id, "reason": reason}))
        return {"dspace_uuid": uuid, "thesis_id": thesis_id, "status": "removed", "authorised": False, "reason": reason}
    streams = dspace.bitstreams(item, token=token)
    pdf = next((s for s in streams if str(s.get("name", "")).lower().endswith(".pdf")), None)
    if not pdf:
        raise DSpaceError(f"DSpace item {uuid} has no PDF bitstream.", 422)
    response = dspace.download(pdf, token=token)
    authors = _values(item, "dc.contributor.author")
    centre = (_values(item, "aims.centre") or [""])[0]
    year_text = (_values(item, "dc.date.issued") or [""])[0]
    year = int(year_text[:4]) if year_text[:4].isdigit() else 0
    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(response.content)
        tmp.flush()
        thesis_id = ingest(tmp.name, author="; ".join(authors), campus=centre,
                           year=year, source_id=uuid, source_url=dspace.download_url(pdf) or "")
    return {"dspace_uuid": uuid, "thesis_id": thesis_id, "status": "indexed", "authorised": True}
