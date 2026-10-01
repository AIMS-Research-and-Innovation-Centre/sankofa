"""Feasibility = how much support exists for this direction."""
from __future__ import annotations
from ...graph.client import graph


def feasibility(c1: str, c2: str) -> float:
    rows = graph().run(
        """
        MATCH (c:Concept) WHERE c.id IN [$c1, $c2]
        OPTIONAL MATCH (c)<-[:ABOUT]-(t:Thesis)
        RETURN c.id AS cid, count(t) AS n
        """,
        c1=c1.lower(), c2=c2.lower(),
    )
    counts = {r["cid"]: r["n"] for r in rows}
    if len(counts) < 2:
        return 0.3
    avg = sum(counts.values()) / 2
    return round(min(1.0, avg / 10.0), 3)
