"""Oracle — reads the graph's shape and proposes theses that should exist."""
from __future__ import annotations
from ...graph.client import graph
from ...graph.embeddings.qdrant_client import vectors
from .novelty_scorer import novelty
from .feasibility_scorer import feasibility


class Oracle:
    name = "oracle"

    def propose(self, topic: str, top_k: int = 5) -> list[dict]:
        from ...graph.embeddings.encoder import encode_one

        existing = vectors().search(encode_one(topic), limit=20)
        existing_ids = {e["thesis_id"] for e in existing}

        # 1) Try the graph-gap approach
        gaps = graph().run(
            """
            MATCH (a:Concept)<-[:ABOUT]-(t1:Thesis)-[:ABOUT]->(b:Concept)<-[:ABOUT]-(t2:Thesis)
            WHERE a.name CONTAINS toLower($topic) OR b.name CONTAINS toLower($topic)
            WITH a, b, count(DISTINCT t1) + count(DISTINCT t2) AS freq
            WHERE freq >= 2 AND freq <= 10
            OPTIONAL MATCH (x:Thesis)-[:ABOUT]->(a), (x)-[:ABOUT]->(b)
            WITH a, b, freq, count(x) AS together
            WHERE together = 0
            RETURN a.name AS c1, b.name AS c2, freq
            ORDER BY freq DESC LIMIT $k
            """,
            topic=topic.lower(), k=top_k,
        )

        ideas = []
        for g in gaps:
            title = f"On the intersection of {g['c1']} and {g['c2']}"
            ideas.append({
                "title": title,
                "concepts": [g["c1"], g["c2"]],
                "novelty": novelty(g["c1"], g["c2"], existing_ids),
                "feasible": feasibility(g["c1"], g["c2"]),
                "rationale": f"{g['freq']} theses touch these concepts, none together.",
            })

        # 2) Fallback: propose concept pairs from graph neighbours
        if not ideas:
            rows = graph().run(
                """
                MATCH (c:Concept)<-[:ABOUT]-(t:Thesis)
                WHERE toLower(c.name) CONTAINS toLower($topic)
                MATCH (c2:Concept)<-[:ABOUT]-(t2:Thesis)
                WHERE c2 <> c AND NOT toLower(c2.name) CONTAINS toLower($topic)
                WITH c, c2, count(DISTINCT t) AS n1, count(DISTINCT t2) AS n2
                RETURN c.name AS c1, c2.name AS c2, n1 + n2 AS freq
                ORDER BY freq DESC LIMIT $k
                """,
                topic=topic.lower(), k=top_k,
            )
            for g in rows:
                title = f"On the intersection of {g['c1']} and {g['c2']}"
                ideas.append({
                    "title": title,
                    "concepts": [g["c1"], g["c2"]],
                    "novelty": novelty(g["c1"], g["c2"], existing_ids),
                    "feasible": feasibility(g["c1"], g["c2"]),
                    "rationale": "Untested pairing suggested by graph neighbours.",
                })

        ideas.sort(key=lambda i: -(i["novelty"] * i["feasible"]))
        return ideas
