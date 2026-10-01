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
