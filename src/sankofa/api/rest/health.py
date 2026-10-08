from fastapi import APIRouter
from ...substrate.event_store import event_store
from ...graph.client import graph
from ...graph.embeddings.qdrant_client import vectors

router = APIRouter()


@router.get("/ping")
def ping() -> dict[str, str]:
    """Lightweight readiness probe used by Cloudflare Containers."""
    return {"status": "ok"}


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
