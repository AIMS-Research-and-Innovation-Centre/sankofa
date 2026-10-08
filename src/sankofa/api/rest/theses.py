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
from ...repository import RepositoryStore

router = APIRouter()


class SearchQuery(BaseModel):
    query: str
    limit: int = 10


@router.get("/")
def list_theses(limit: int = 200, sankofa_session: str | None = Cookie(default=None)) -> list[dict]:
    records = RepositoryStore().list_published(min(limit, 500))
    if records:
        return [{"id": r["id"], "title": r["metadata"].get("title", r["id"]), "abstract": r["metadata"].get("abstract", ""), "year": r["metadata"].get("year"), "author": "; ".join(r["metadata"].get("authors", [])), "concepts": r["metadata"].get("keywords", [])} for r in records]
    # The graph is an optional enrichment service.  A fresh self-contained
    # deployment has no graph records yet, so an unavailable graph must not
    # turn the public catalogue request into a 500/network error.
    try:
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
    except Exception:
        return []


@router.get("/{thesis_id}")
def get_thesis(thesis_id: str, sankofa_session: str | None = Cookie(default=None)) -> dict:
    try:
        record = RepositoryStore().item(thesis_id)
        if record["status"] == "published" and not record["withdrawn"]:
            metadata = record["metadata"]
            return {"thesis": {"id": thesis_id, "title": metadata.get("title", thesis_id), "abstract": metadata.get("abstract", ""), "author": "; ".join(metadata.get("authors", [])), "access": record["access"], "licence": record["licence"], "bitstreams": record["bitstreams"]}, "concepts": metadata.get("keywords", [])}
    except KeyError:
        pass
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
    needle = q.query.casefold().strip()
    repository_rows = RepositoryStore().list_published(min(q.limit, 500))
    if repository_rows:
        matches = []
        for record in repository_rows:
            text = json.dumps(record["metadata"], ensure_ascii=False).casefold()
            if not needle or needle in text:
                matches.append({"thesis_id": record["id"], "score": 1.0})
        return matches[:q.limit]
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
