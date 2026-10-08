"""Curated metadata and DOIs. Writes need the curator token (LA_CURATOR_TOKEN)."""
from __future__ import annotations
import secrets
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ValidationError
from ...config import settings
from ...doi import DataCite, DataCiteError, to_datacite
from ...graph.client import graph
from ...logging import log
from ...substrate.event_store import event_store
from ...substrate.event_types import DoiChanged, MetadataCurated
from ...metadata import ThesisMetadata, completeness, from_node, node_fields

router = APIRouter()


def curator(authorization: str = Header(default="")) -> None:
    token = settings().curator_token
    if not token:
        raise HTTPException(503, "Curator actions are disabled: set LA_CURATOR_TOKEN on the server.")
    if not secrets.compare_digest(authorization.removeprefix("Bearer ").strip(), token):
        raise HTTPException(401, "A valid curator token is required.")


def load(thesis_id: str) -> ThesisMetadata:
    rows = graph().run(
        """MATCH (t:Thesis {id: $id})
        OPTIONAL MATCH (t)-[:ABOUT]->(c:Concept)
        OPTIONAL MATCH (s:Student)-[:AUTHORED]->(t)
        RETURN t, collect(DISTINCT c.name) AS concepts, head(collect(s.id)) AS student""",
        id=thesis_id,
    )
    if not rows:
        raise HTTPException(404, "Thesis not found")
    node = dict(rows[0]["t"])
    node.setdefault("author", None)
    node["author"] = node["author"] or rows[0]["student"]
    try:
        return from_node({**node, "concepts": rows[0]["concepts"]})
    except ValidationError as e:
        raise HTTPException(422, f"Stored metadata is invalid: {e.errors()[0]['msg']}") from e


def reindex(meta: ThesisMetadata) -> None:
    """Refresh the search vector; search degrades gracefully if the index is down."""
    try:
        from ...graph.embeddings.encoder import encode_one
        from ...graph.embeddings.qdrant_client import vectors
        vectors().upsert(meta.id, encode_one(meta.abstract or meta.title),
                         payload={"title": meta.title, "year": meta.publication_year, "campus": meta.centre})
    except Exception as e:  # noqa: BLE001
        log.warning("search.reindex_failed", thesis_id=meta.id, error=str(e))


def save(meta: ThesisMetadata, create: bool = False, actor: str = "curator") -> None:
    graph().run(
        ("MERGE" if create else "MATCH") + """ (t:Thesis {id: $id}) SET t += $fields
        WITH t OPTIONAL MATCH (t)-[r:ABOUT]->(c:Concept) WHERE NOT toLower(c.name) IN [k IN $keywords | toLower(k)]
        DELETE r""",
        id=meta.id, fields=node_fields(meta), keywords=meta.keywords,
    )
    for keyword in meta.keywords:
        graph().link_concept(meta.id, keyword)
    event_store().append(MetadataCurated(actor=actor, payload={"thesis_id": meta.id, "metadata": meta.model_dump()}))


def doi_status() -> dict:
    s = settings()
    configured = bool(s.datacite_repository_id and s.datacite_password and s.datacite_prefix)
    return {"configured": configured, "test": "api.test.datacite.org" in s.datacite_api_url,
            "prefix": s.datacite_prefix, "curation_enabled": bool(s.curator_token),
            "landing_pages": bool(s.public_url)}


@router.get("/{thesis_id}/metadata")
def get_metadata(thesis_id: str) -> dict:
    meta = load(thesis_id)
    return {"metadata": meta.model_dump(), "completeness": completeness(meta),
            "datacite": to_datacite(meta, meta.doi)["data"]["attributes"], "doi_service": doi_status()}


@router.put("/{thesis_id}/metadata", dependencies=[Depends(curator)])
def put_metadata(thesis_id: str, body: ThesisMetadata) -> dict:
    current = load(thesis_id)
    if body.id != thesis_id:
        raise HTTPException(400, "The record ID cannot change.")
    # The DOI and its state are set only by the DOI workflow.
    meta = body.model_copy(update={"doi": current.doi, "doi_state": current.doi_state})
    save(meta)
    if (meta.title, meta.abstract) != (current.title, current.abstract):
        reindex(meta)
    if meta.doi_state and meta.doi and meta.doi.startswith(f"{settings().datacite_prefix}/"):
        # Keep the DataCite record in step with the archive (only for DOIs AIMS minted).
        try:
            client = DataCite()
            client.register(meta) if meta.doi_state == "findable" else client.reserve(meta)
        except DataCiteError as e:
            return {"metadata": meta.model_dump(), "completeness": completeness(meta),
                    "warning": f"Saved, but DataCite was not updated: {e}"}
    return {"metadata": meta.model_dump(), "completeness": completeness(meta)}


class DoiAction(BaseModel):
    action: Literal["reserve", "register", "discard"]


@router.post("/{thesis_id}/doi", dependencies=[Depends(curator)])
def doi(thesis_id: str, body: DoiAction) -> dict:
    meta = load(thesis_id)
    check = completeness(meta)
    if body.action != "discard" and not check["doi_ready"]:
        raise HTTPException(409, "Complete the required metadata first: " + ", ".join(check["missing_required"]))
    if body.action == "register" and meta.doi_state != "draft":
        raise HTTPException(409, "Reserve a draft DOI and review it before registering."
                            if not meta.doi_state else "This DOI is already registered.")
    if body.action == "discard" and meta.doi_state != "draft":
        raise HTTPException(409, "Only a draft DOI can be discarded. Registered DOIs are permanent.")
    try:
        client = DataCite()
        if body.action == "reserve":
            meta = meta.model_copy(update={"doi": client.reserve(meta), "doi_state": "draft"})
        elif body.action == "register":
            client.register(meta)
            meta = meta.model_copy(update={"doi_state": "findable"})
        else:
            client.discard(meta.doi)  # type: ignore[arg-type]
            meta = meta.model_copy(update={"doi": None, "doi_state": None})
    except DataCiteError as e:
        raise HTTPException(502, str(e)) from e
    save(meta)
    event_store().append(DoiChanged(actor="curator", payload={"thesis_id": thesis_id, "action": body.action,
                                                              "doi": meta.doi or "", "state": meta.doi_state}))
    return {"doi": meta.doi, "doi_state": meta.doi_state, "url": f"https://doi.org/{meta.doi}" if meta.doi else None}


report_router = APIRouter()


@report_router.get("/report")
def report() -> dict:
    """Metadata completeness across the archive (roadmap KPI: 95% of required fields)."""
    ids = [r["id"] for r in graph().run("MATCH (t:Thesis) RETURN t.id AS id ORDER BY t.id")]
    rows, required_total = [], 0
    for thesis_id in ids:
        try:
            meta = load(thesis_id)
        except HTTPException as e:
            rows.append({"id": thesis_id, "error": e.detail})
            continue
        c = completeness(meta)
        required_total += c["required_score"]
        rows.append({"id": thesis_id, "title": meta.title, "doi": meta.doi, "doi_state": meta.doi_state, **c})
    return {"theses": len(ids), "required_completeness": round(required_total / len(ids)) if ids else None,
            "doi_ready": sum(1 for r in rows if r.get("doi_ready")),
            "registered": sum(1 for r in rows if r.get("doi_state") == "findable"),
            "doi_service": doi_status(), "rows": rows}
