from fastapi import APIRouter
from ...centres import CENTRES, COMMUNITIES, resolve
from ...graph.client import graph

router = APIRouter()


@router.get("/")
def list_centres() -> dict:
    """The controlled Centre list with thesis counts, plus programme communities."""
    counts = {c.slug: 0 for c in CENTRES}
    unassigned = 0
    for row in graph().run("MATCH (t:Thesis) RETURN t.campus AS campus, count(*) AS n"):
        centre = resolve(row["campus"])
        if centre:
            counts[centre.slug] += row["n"]
        else:
            unassigned += row["n"]
    return {
        "centres": [{**c.to_dict(), "theses": counts[c.slug]} for c in CENTRES],
        "communities": list(COMMUNITIES),
        "unassigned": unassigned,
    }
