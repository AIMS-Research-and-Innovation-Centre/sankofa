"""Hybrid search — vector similarity + graph reachability."""
from __future__ import annotations
from .encoder import encode_one
from .qdrant_client import vectors
from ..client import graph


def hybrid_search(query: str, limit: int = 10) -> list[dict]:
    q_vec = encode_one(query)
    semantic = {h["thesis_id"]: h["score"]
                for h in vectors().search(q_vec, limit=limit * 2)}

    top_ids = list(semantic)[:5]
    conceptual: dict[str, float] = {}
    if top_ids:
        rows = graph().run(
            """
            MATCH (t:Thesis)-[:ABOUT]->(c:Concept)<-[:ABOUT]-(other:Thesis)
            WHERE t.id IN $ids AND NOT other.id IN $ids
            WITH other, count(DISTINCT c) AS shared
            RETURN other.id AS id, shared
            ORDER BY shared DESC LIMIT $limit
            """,
            ids=top_ids, limit=limit,
        )
        for r in rows:
            conceptual[r["id"]] = r["shared"] / 10.0

    fused: dict[str, float] = {}
    for tid in set(semantic) | set(conceptual):
        fused[tid] = 0.7 * semantic.get(tid, 0.0) + 0.3 * conceptual.get(tid, 0.0)

    return [{"thesis_id": tid, "score": round(s, 4)}
            for tid, s in sorted(fused.items(), key=lambda kv: -kv[1])[:limit]]
