"""Sankofa repository routes backed by DSpace REST resources."""
from __future__ import annotations

import tempfile
from typing import Any

from fastapi import APIRouter, Cookie, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from ...api.rest.auth import require_token, role
from ...dspace import DSpaceClient, DSpaceError

router = APIRouter()


def dspace_error(exc: DSpaceError) -> HTTPException:
    return HTTPException(exc.status_code or 502, str(exc))


def _token(cookie: str | None) -> str | None:
    # Public DSpace resources can be read without a Sankofa session.
    from .auth import session_token
    return session_token(cookie)


def _guard_staff(cookie: str | None) -> str:
    token = require_token(cookie)
    try:
        with DSpaceClient(token) as dspace:
            user = dspace.status()
        if role(user) not in {"librarian", "editor"}:
            raise HTTPException(403, "This repository action requires a librarian or editor account.")
    except DSpaceError as exc:
        raise dspace_error(exc) from exc
    return token


@router.get("/communities")
def communities(sankofa_session: str | None = Cookie(default=None)) -> list[dict[str, Any]]:
    try:
        with DSpaceClient(_token(sankofa_session)) as dspace:
            return dspace.communities()
    except DSpaceError as exc:
        raise dspace_error(exc) from exc


@router.get("/collections")
def collections(community_uuid: str | None = None,
                sankofa_session: str | None = Cookie(default=None)) -> list[dict[str, Any]]:
    try:
        with DSpaceClient(_token(sankofa_session)) as dspace:
            community = dspace._request("GET", f"/api/core/communities/{community_uuid}",
                                        token=_token(sankofa_session)).json() if community_uuid else None
            return dspace.collections(community=community, token=_token(sankofa_session))
    except DSpaceError as exc:
        raise dspace_error(exc) from exc


@router.get("/search")
def search(query: str = "", page: int = 0, size: int = 20,
           sankofa_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    try:
        with DSpaceClient(_token(sankofa_session)) as dspace:
            return dspace.search(query, page=page, size=size, token=_token(sankofa_session))
    except DSpaceError as exc:
        raise dspace_error(exc) from exc


@router.get("/items/{uuid}")
def item(uuid: str, sankofa_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    token = _token(sankofa_session)
    try:
        with DSpaceClient(token) as dspace:
            item_data = dspace.item(uuid, token=token)
            item_data["bitstreams"] = dspace.bitstreams(item_data, token=token)
            return item_data
    except DSpaceError as exc:
        raise dspace_error(exc) from exc


@router.post("/items/{uuid}/index")
def index_item(uuid: str, sankofa_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    """Index an explicitly authorised, open DSpace item into Sankofa derivatives."""
    token = _guard_staff(sankofa_session)
    try:
        from ...ingestion.dspace_sync import sync_item
        with DSpaceClient(token) as dspace:
            return sync_item(dspace, uuid, token=token)
    except DSpaceError as exc:
        raise dspace_error(exc) from exc


@router.get("/workflow")
def workflow(sankofa_session: str | None = Cookie(default=None)) -> list[dict[str, Any]]:
    token = _guard_staff(sankofa_session)
    try:
        with DSpaceClient(token) as dspace:
            return dspace.workflow_items(token=token)
    except DSpaceError as exc:
        raise dspace_error(exc) from exc


@router.post("/workflow/{workflow_id}/{action}")
def workflow_action(workflow_id: str, action: str, reason: str = "",
                    sankofa_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    if action not in {"accept", "reject", "edit", "commit"}:
        raise HTTPException(400, "Unsupported DSpace workflow action.")
    token = _guard_staff(sankofa_session)
    try:
        with DSpaceClient(token) as dspace:
            items = dspace.workflow_items(token=token)
            candidate = next((item for item in items if item.get("id") == workflow_id or item.get("uuid") == workflow_id), None)
            if not candidate:
                raise HTTPException(404, "Workflow item not found.")
            return dspace.workflow_action(candidate, action, token=token, reason=reason)
    except DSpaceError as exc:
        raise dspace_error(exc) from exc


class DepositRequest(BaseModel):
    collection_uuid: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=1000)
    abstract: str = Field(default="", max_length=100_000)
    authors: list[str] = Field(default_factory=list)
    licence: str = "all-rights-reserved"
    access: str = "open"
    embargo_end: str | None = None


@router.post("/deposits", status_code=201)
async def deposit(body: DepositRequest, file: UploadFile = File(...),
                  sankofa_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    token = require_token(sankofa_session)
    try:
        with DSpaceClient(token) as dspace:
            collection = dspace.collection(body.collection_uuid, token=token)
            workspace = dspace.create_workspace_item(collection, token=token)
            # DSpace requires metadata in its schema; keep the mapping explicit
            # and never put private AIMS fields into public metadata.
            metadata: dict[str, list[dict[str, Any]]] = {
                "dc.title": [{"value": body.title, "language": "en"}],
                "dc.contributor.author": [{"value": author, "language": "en"} for author in body.authors],
            }
            if body.abstract:
                metadata["dc.description.abstract"] = [{"value": body.abstract, "language": "en"}]
            if body.licence.startswith("http"):
                metadata["dc.rights.uri"] = [{"value": body.licence}]
            metadata["dc.rights.accessRights"] = [{"value": body.access}]
            if body.embargo_end:
                metadata["dc.date.available"] = [{"value": body.embargo_end}]
            dspace.patch_workspace_metadata(workspace, metadata, token=token)
            with tempfile.NamedTemporaryFile() as tmp:
                tmp.write(await file.read())
                tmp.seek(0)
                uploaded = dspace.upload_workspace_file(workspace, file.filename or "deposit.bin", tmp, token=token,
                                                        content_type=file.content_type or "application/octet-stream")
            submitted = dspace.submit_workspace_item(uploaded, token=token)
            return {"workspace_item": uploaded, "workflow": submitted, "status": "submitted_for_review"}
    except DSpaceError as exc:
        raise dspace_error(exc) from exc
