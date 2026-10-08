from __future__ import annotations
import json
import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, Cookie, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from ...graph.client import graph
from ...graph.embeddings.hybrid_search import hybrid_search
from ...ingestion.pipeline import ingest
from ...config import settings
from ...dspace import DSpaceClient, DSpaceError
from .auth import session_token

router = APIRouter()


class SearchQuery(BaseModel):
    query: str
    limit: int = 10


def _dspace_item(item: dict, streams: list[dict] | None = None) -> dict:
    metadata = item.get("metadata", {}) if isinstance(item.get("metadata"), dict) else {}
    def value(key: str, default: str = "") -> str:
        values = metadata.get(key, [])
        return str(values[0].get("value", default)) if values and isinstance(values[0], dict) else default
    pdf = next((stream for stream in streams or [] if str(stream.get("name", "")).lower().endswith(".pdf")), None)
    content_link = (pdf or {}).get("_links", {}).get("content", {}) if pdf else {}
    return {
        "id": item.get("uuid"), "title": value("dc.title", item.get("name", "")),
        "author": value("dc.contributor.author"), "abstract": value("dc.description.abstract"),
        "year": value("dc.date.issued")[:4] or None, "campus": value("aims.centre"),
        "concepts": [str(v.get("value")) for v in metadata.get("dc.subject", []) if isinstance(v, dict)],
        "access": value("dc.rights.accessRights", "open"), "withdrawn": item.get("withdrawn", False),
        "in_archive": item.get("inArchive", False), "bitstreams": streams or [],
        "pdf_url": content_link.get("href") if isinstance(content_link, dict) else None,
    }


def _dspace_search(body: dict) -> list[dict]:
    embedded = body.get("_embedded", {})
    results = embedded.get("searchResult", []) if isinstance(embedded, dict) else []
    objects: list[dict] = []
    for result in results if isinstance(results, list) else []:
        objects.extend(result.get("_embedded", {}).get("objects", []) if isinstance(result, dict) else [])
    return [{"thesis_id": obj.get("uuid") or obj.get("id"), "score": obj.get("score", 0)} for obj in objects]


@router.get("/")
def list_theses(limit: int = 200, sankofa_session: str | None = Cookie(default=None)) -> list[dict]:
    if settings().dspace_url:
        try:
            with DSpaceClient(session_token(sankofa_session)) as dspace:
                return _dspace_search(dspace.search("*", size=min(limit, 100), token=session_token(sankofa_session)))
        except DSpaceError as exc:
            raise HTTPException(exc.status_code or 502, str(exc)) from exc
    return graph().run(
        """MATCH (t:Thesis)
        OPTIONAL MATCH (s:Student)-[:AUTHORED]->(t)
        OPTIONAL MATCH (t)-[:ABOUT]->(c:Concept)
        WITH t, s, collect(DISTINCT c.name) AS concepts
        RETURN t.id AS id, t.title AS title, t.year AS year,
               t.campus AS campus, coalesce(t.author, s.id) AS author,
               t.abstract AS abstract, concepts
        ORDER BY t.year DESC LIMIT $limit""",
        limit=limit,
    )


@router.get("/{thesis_id}")
def get_thesis(thesis_id: str, sankofa_session: str | None = Cookie(default=None)) -> dict:
    if settings().dspace_url:
        try:
            token = session_token(sankofa_session)
            with DSpaceClient(token) as dspace:
                item = dspace.item(thesis_id, token=token)
                return {"thesis": _dspace_item(item, dspace.bitstreams(item, token=token)), "concepts": []}
        except DSpaceError as exc:
            raise HTTPException(exc.status_code or 502, str(exc)) from exc
    rows = graph().run(
        """MATCH (t:Thesis {id: $id})
        OPTIONAL MATCH (s:Student)-[:AUTHORED]->(t)
        RETURN t, s.id AS author""",
        id=thesis_id,
    )
    if not rows:
        raise HTTPException(404, "Thesis not found")
    thesis = dict(rows[0]["t"])
    if not thesis.get("author"):
        thesis["author"] = rows[0]["author"]
    # Curated metadata (authors, supervisors, licence, ...) is stored as JSON; expose its fields.
    for key, value in json.loads(thesis.pop("meta", None) or "{}").items():
        thesis.setdefault(key, value) if key in ("title", "abstract", "year") else thesis.__setitem__(key, value)
    concepts = graph().run(
        "MATCH (t:Thesis {id: $id})-[:ABOUT]->(c:Concept) RETURN c.name AS name",
        id=thesis_id,
    )
    return {"thesis": thesis, "concepts": [c["name"] for c in concepts]}


@router.get("/{thesis_id}/neighbors")
def neighbors(thesis_id: str, hops: int = 2) -> list[dict]:
    hops = max(1, min(hops, 4))
    return graph().run(
        f"""MATCH path = (t:Thesis {{id: $tid}})-[*1..{hops}]-(n)
        RETURN DISTINCT labels(n) AS labels, n.id AS id,
               coalesce(n.title, n.name, n.id) AS label LIMIT 100""",
        tid=thesis_id,
    )


@router.post("/search")
def search(q: SearchQuery, sankofa_session: str | None = Cookie(default=None)) -> list[dict]:
    if settings().dspace_url:
        try:
            token = session_token(sankofa_session)
            with DSpaceClient(token) as dspace:
                return _dspace_search(dspace.search(q.query, size=min(q.limit, 100), token=token))
        except DSpaceError as exc:
            raise HTTPException(exc.status_code or 502, str(exc)) from exc
    return hybrid_search(q.query, limit=q.limit)


@router.post("/upload")
async def upload(file: UploadFile = File(...), author: str = Form(""),
                 campus: str = Form(""), year: int = Form(0)) -> dict:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)
    try:
        tid = ingest(tmp_path, author=author, campus=campus, year=year)
        return {"thesis_id": tid, "status": "ingested"}
    finally:
        tmp_path.unlink(missing_ok=True)
