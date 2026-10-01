#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "🚀  Building Sankofa API..."

mkdir -p src/sankofa/api/rest

cat > src/sankofa/api/__init__.py << 'EOF'
from .app import app, create_app
__all__ = ["app", "create_app"]
EOF

cat > src/sankofa/api/rest/__init__.py << 'EOF'
from . import health, theses, chat, oracle, dreams, agents, constellation
__all__ = ["health", "theses", "chat", "oracle", "dreams", "agents", "constellation"]
EOF

cat > src/sankofa/api/app.py << 'EOF'
"""FastAPI app — the archive's public face."""
from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from ..logging import configure_logging, log
from .rest import health, theses, chat, oracle, dreams, agents, constellation


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log.info("api.startup")
    yield
    log.info("api.shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Sankofa",
        description="An agential thesis archive for AIMS.",
        version="0.1.0-alpha",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
        allow_credentials=False,
    )
    app.include_router(health.router, tags=["health"])
    app.include_router(theses.router, prefix="/theses", tags=["theses"])
    app.include_router(chat.router, prefix="/chat", tags=["chat"])
    app.include_router(oracle.router, prefix="/oracle", tags=["oracle"])
    app.include_router(dreams.router, prefix="/dreams", tags=["dreams"])
    app.include_router(agents.router, prefix="/agents", tags=["agents"])
    app.include_router(constellation.router, tags=["constellation"])

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    def root() -> str:
        return """<html><head><title>Sankofa</title>
        <style>body{background:#050514;color:#cdd6f4;font-family:system-ui;
        display:flex;align-items:center;justify-content:center;height:100vh;
        margin:0;text-align:center}h1{font-size:3rem;margin:0}
        p{opacity:.7;margin-top:1rem}a{color:#89b4fa;text-decoration:none}
        a:hover{text-decoration:underline}</style></head>
        <body><div><h1>🌌 Sankofa</h1>
        <p>The thesis that remembers you back.</p>
        <p><a href="/docs">API docs</a> · <a href="/health">Health</a> ·
        <a href="/theses/">Theses</a></p></div></body></html>"""

    return app


app = create_app()
EOF

cat > src/sankofa/api/rest/health.py << 'EOF'
from fastapi import APIRouter
from ...substrate.event_store import event_store
from ...graph.client import graph
from ...graph.embeddings.qdrant_client import vectors

router = APIRouter()


@router.get("/health")
def health() -> dict:
    status: dict = {"api": "ok"}
    try:
        status["events"] = event_store().count()
    except Exception as e:
        status["events"] = f"error: {e}"
    try:
        status["graph_nodes"] = graph().run("MATCH (n) RETURN count(n) AS n")[0]["n"]
    except Exception as e:
        status["graph_nodes"] = f"error: {e}"
    try:
        status["vectors"] = vectors().client.count(vectors().collection).count
    except Exception as e:
        status["vectors"] = f"error: {e}"
    return status
EOF

cat > src/sankofa/api/rest/theses.py << 'EOF'
from __future__ import annotations
import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from ...graph.client import graph
from ...graph.embeddings.hybrid_search import hybrid_search
from ...ingestion.pipeline import ingest

router = APIRouter()


class SearchQuery(BaseModel):
    query: str
    limit: int = 10


@router.get("/")
def list_theses(limit: int = 50) -> list[dict]:
    return graph().run(
        """MATCH (t:Thesis)
        RETURN t.id AS id, t.title AS title, t.year AS year,
               t.campus AS campus, t.author AS author
        ORDER BY t.year DESC LIMIT $limit""",
        limit=limit,
    )


@router.get("/{thesis_id}")
def get_thesis(thesis_id: str) -> dict:
    rows = graph().run("MATCH (t:Thesis {id: $id}) RETURN t", id=thesis_id)
    if not rows:
        raise HTTPException(404, "Thesis not found")
    concepts = graph().run(
        "MATCH (t:Thesis {id: $id})-[:ABOUT]->(c:Concept) RETURN c.name AS name",
        id=thesis_id,
    )
    return {"thesis": rows[0]["t"], "concepts": [c["name"] for c in concepts]}


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
def search(q: SearchQuery) -> list[dict]:
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
EOF

cat > src/sankofa/api/rest/chat.py << 'EOF'
from fastapi import APIRouter
from pydantic import BaseModel
from ...agents.interlocutor.agent import Interlocutor

router = APIRouter()


class ChatIn(BaseModel):
    thesis_id: str
    question: str


@router.post("/")
def chat(body: ChatIn) -> dict:
    return Interlocutor(body.thesis_id).ask(body.question)
EOF

cat > src/sankofa/api/rest/oracle.py << 'EOF'
from fastapi import APIRouter
from pydantic import BaseModel
from ...agents.oracle.agent import Oracle

router = APIRouter()


class OracleIn(BaseModel):
    topic: str
    top_k: int = 5


@router.post("/propose")
def propose(body: OracleIn) -> list[dict]:
    return Oracle().propose(body.topic, top_k=body.top_k)
EOF

cat > src/sankofa/api/rest/dreams.py << 'EOF'
from fastapi import APIRouter
from ...agents.dreamer.agent import Dreamer
from ...agents.dreamer.dream_archive import recent

router = APIRouter()


@router.get("/recent")
def recent_dreams(limit: int = 10) -> list[dict]:
    return recent(limit=limit)


@router.post("/dream-now")
def dream_now() -> dict:
    return Dreamer().dream(steps=6)
EOF

cat > src/sankofa/api/rest/agents.py << 'EOF'
from fastapi import APIRouter

router = APIRouter()

_REGISTRY = [
    {"name": "curator", "description": "Extracts concepts.", "status": "live"},
    {"name": "interlocutor", "description": "Thesis Whisperer.", "status": "live"},
    {"name": "oracle", "description": "Proposes unwritten theses.", "status": "live"},
    {"name": "dreamer", "description": "Dreams nightly.", "status": "live"},
]


@router.get("/")
def list_agents() -> list[dict]:
    return _REGISTRY
EOF

cat > src/sankofa/api/rest/constellation.py << 'EOF'
"""Live constellation — WebSocket endpoint."""
from __future__ import annotations
import asyncio
import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ...graph.client import graph
from ...logging import log

router = APIRouter()


def _snapshot() -> dict:
    nodes = graph().run(
        """MATCH (t:Thesis)
        OPTIONAL MATCH (t)-[:ABOUT]->(c:Concept)
        RETURN t.id AS id, t.title AS title, t.year AS year,
               t.campus AS campus, collect(DISTINCT c.name) AS concepts
        LIMIT 500"""
    )
    edges = graph().run(
        """MATCH (a:Thesis)-[:ABOUT]->(c:Concept)<-[:ABOUT]-(b:Thesis)
        WHERE a.id < b.id
        RETURN DISTINCT a.id AS source, b.id AS target, c.name AS via
        LIMIT 1000"""
    )
    return {"nodes": nodes, "edges": edges}


@router.websocket("/ws/constellation")
async def constellation(websocket: WebSocket) -> None:
    await websocket.accept()
    log.info("ws.constellation.connected")
    try:
        while True:
            try:
                snapshot = _snapshot()
                await websocket.send_text(orjson.dumps(snapshot).decode())
            except Exception as e:
                await websocket.send_text(orjson.dumps({"error": str(e)}).decode())
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        log.info("ws.constellation.disconnected")
EOF

if ! grep -q "^dev:" Makefile; then
  cat >> Makefile << 'EOF'

dev:
	uvicorn sankofa.api.app:app --reload --host 0.0.0.0 --port 8000
EOF
fi

echo ""
echo "🧪  Verifying the app loads..."
python -c "from sankofa.api.app import app; print('  ✅ FastAPI app loads:', app.title, app.version)"
echo ""
echo "✅  Full API built."
