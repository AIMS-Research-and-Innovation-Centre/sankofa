"""Novelty = distance from existing theses in concept space."""
from __future__ import annotations
from ...graph.client import graph


def novelty(c1: str, c2: str, existing_ids: set[str]) -> float:
    rows = graph().run(
        """
        MATCH (a:Concept {id: $c1})<-[:ABOUT]-(t1:Thesis)
        MATCH (b:Concept {id: $c2})<-[:ABOUT]-(t2:Thesis)
        RETURN count(DISTINCT t1) AS n1, count(DISTINCT t2) AS n2
        """,
        c1=c1.lower(), c2=c2.lower(),
    )
    if not rows:
        return 0.5
    n1, n2 = rows[0]["n1"], rows[0]["n2"]
    if n1 == 0 or n2 == 0:
        return 0.9
    ratio = min(n1, n2) / max(n1, n2)
    return round(1.0 - ratio * 0.7, 3)
