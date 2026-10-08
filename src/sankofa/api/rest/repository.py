"""Sankofa-owned repository API: catalogue, deposits, workflow and files."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Cookie, File, Form, HTTPException, UploadFile

from ...repository import RepositoryStore
from .auth import require_user

router = APIRouter()


def store() -> RepositoryStore:
    return RepositoryStore()


@router.get("/communities")
def communities() -> list[dict[str, Any]]:
    return store().communities()


@router.get("/collections")
def collections(community_uuid: str | None = None) -> list[dict[str, Any]]:
    return store().collections(community_uuid)


@router.get("/items/{uuid}")
def item(uuid: str) -> dict[str, Any]:
    try:
        result = store().item(uuid)
    except KeyError as exc:
        raise HTTPException(404, "Repository item not found.") from exc
    if result["status"] != "published" or result["withdrawn"]:
        raise HTTPException(404, "Repository item not found.")
    return result


@router.post("/deposits", status_code=201)
async def deposit(collection_uuid: str = Form(...), title: str = Form(...), abstract: str = Form(""),
                  authors: str = Form(""), licence: str = Form("all-rights-reserved"),
                  access: str = Form("open"), embargo_end: str | None = Form(None),
                  file: UploadFile = File(...), sankofa_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    user = require_user(sankofa_session)
    if access not in {"open", "embargoed", "restricted", "metadata-only"}:
        raise HTTPException(400, "Unsupported access level.")
    metadata = {"title": title, "abstract": abstract, "authors": [a.strip() for a in authors.split("||") if a.strip()]}
    repository = store()
    if not any(c["id"] == collection_uuid for c in repository.collections()):
        raise HTTPException(404, "Collection not found.")
    record = repository.create_item(collection_uuid, metadata, user["id"], licence, access, embargo_end)
    content = await file.read()
    stream = repository.attach_file(record["id"], file.filename or "deposit.bin", file.content_type or "application/octet-stream", content)
    return {"item": repository.item(record["id"]), "bitstream": stream, "status": "submitted_for_review"}


@router.get("/workflow")
def workflow(sankofa_session: str | None = Cookie(default=None)) -> list[dict[str, Any]]:
    user = require_user(sankofa_session, {"librarian", "editor", "admin"})
    return store().workflow(user["role"])


@router.post("/workflow/{workflow_id}/{action}")
def workflow_action(workflow_id: str, action: str, sankofa_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    user = require_user(sankofa_session, {"librarian", "editor", "admin"})
    if action == "commit" and user["role"] not in {"editor", "admin"}:
        raise HTTPException(403, "Only editors or administrators can publish records.")
    try:
        repository = store()
        result = repository.transition(workflow_id, action, user["id"])
        if action == "commit" and result["access"] == "open" and result["bitstreams"]:
            try:
                from ...ingestion.pipeline import ingest
                stream = result["bitstreams"][0]
                result["ai_index"] = ingest(stream["path"], author="; ".join(result["metadata"].get("authors", [])),
                                             source_id=workflow_id, source_url=f"/repository/bitstreams/{stream['id']}")
            except Exception as exc:  # noqa: BLE001
                result["ai_index"] = {"status": "pending", "reason": str(exc)}
        return result
    except KeyError as exc:
        raise HTTPException(404, "Workflow item not found.") from exc
    except ValueError as exc:
        raise HTTPException(400, "Unsupported workflow action.") from exc


@router.get("/bitstreams/{stream_id}")
def bitstream(stream_id: str):
    from fastapi.responses import FileResponse
    repository = store()
    with repository._db() as db:
        row = db.execute("SELECT * FROM bitstreams WHERE id=?", (stream_id,)).fetchone()
    if not row:
        raise HTTPException(404, "File not found.")
    return FileResponse(row["path"], media_type=row["media_type"], filename=row["filename"])
