"""Sankofa as an MCP server, so agents such as Hermes Agent can use the archive.

Every tool is read-only. Run over stdio with `sankofa mcp`, or reach the
streamable HTTP endpoint the API mounts at /mcp.
"""
from __future__ import annotations
from typing import Any
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from .centres import CENTRES, resolve
from .config import settings
from .links import record_url as _link

READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=False)

server = MCPServer(
    name="sankofa",
    title="Sankofa: AIMS scholarly archive",
    instructions=(
        "Search and read theses from the African Institute for Mathematical Sciences "
        "(AIMS) network. Use search_theses to find work, get_thesis for full metadata, "
        "related_records to follow the knowledge graph, and ask_theses for answers "
        "grounded in selected theses with [n] citations. Cite theses by title and link."
    ),
)




def _summary(t: dict[str, Any]) -> dict[str, Any]:
    centre = resolve(t.get("campus"))
    return {
        "id": t.get("id"), "title": t.get("title"), "author": t.get("author"),
        "year": t.get("year"), "centre": centre.name if centre else t.get("campus"),
        "abstract": t.get("abstract"), "concepts": t.get("concepts", []), "url": _link(t["id"]),
        "doi": f"https://doi.org/{t['doi']}" if t.get("doi") and t.get("doi_state") == "findable" else None,
        "supervisors": [p.get("given", "") + " " + p["family"] for p in t.get("supervisors", [])] or None,
        "licence": t.get("licence"),
    }


@server.tool(annotations=READ_ONLY)
def search_theses(query: str, centre: str = "", limit: int = 10) -> list[dict[str, Any]]:
    """Search AIMS theses by topic, method, author or concept.

    centre optionally limits results to one AIMS Centre (e.g. "ghana", "AIMS Rwanda").
    """
    from .api.rest.theses import SearchQuery, get_thesis, search
    limit = max(1, min(limit, 50))
    wanted = resolve(centre) if centre else None
    results = []
    for hit in search(SearchQuery(query=query, limit=limit * 3 if wanted else limit)):
        record = get_thesis(hit["thesis_id"])
        t = {**record["thesis"], "id": hit["thesis_id"], "concepts": record["concepts"]}
        if wanted and resolve(t.get("campus")) != wanted:
            continue
        results.append({**_summary(t), "score": hit.get("score")})
        if len(results) == limit:
            break
    return results


@server.tool(annotations=READ_ONLY)
def get_thesis(thesis_id: str) -> dict[str, Any]:
    """Full metadata for one thesis: title, author, Centre, year, abstract, concepts, link."""
    from .api.rest.theses import get_thesis as fetch
    record = fetch(thesis_id)
    return _summary({**record["thesis"], "id": thesis_id, "concepts": record["concepts"]})


@server.tool(annotations=READ_ONLY)
def related_records(thesis_id: str, hops: int = 2) -> list[dict[str, Any]]:
    """Records linked to a thesis in the knowledge graph (authors, concepts, Centres, theses)."""
    from .api.rest.theses import neighbors
    return [{"type": (r["labels"] or ["Unknown"])[0], "id": r["id"], "label": r["label"]}
            for r in neighbors(thesis_id, hops)]


@server.tool(annotations=READ_ONLY)
def list_centres() -> list[dict[str, Any]]:
    """The AIMS Centres in the archive's controlled list."""
    return [c.to_dict() for c in CENTRES]


@server.tool(annotations=READ_ONLY)
def ask_theses(thesis_ids: list[str], question: str) -> dict[str, Any]:
    """Answer a question using only the given theses; claims are cited as [n]."""
    from .agents.notebook import Notebook
    return Notebook().ask(thesis_ids[:50], question)


@server.tool(annotations=READ_ONLY)
def propose_directions(topic: str, top_k: int = 5) -> list[dict[str, Any]]:
    """Research directions suggested by gaps in the archive's concept graph (exploratory)."""
    from .agents.oracle.agent import Oracle
    return Oracle().propose(topic, top_k=max(1, min(top_k, 20)))


def http_app():
    hosts = ["127.0.0.1", "localhost", "[::1]", *settings().mcp_allowed_hosts]
    security = TransportSecuritySettings(
        # Bare names cover requests arriving through a proxy on 80/443.
        allowed_hosts=[*hosts, *(f"{h}:*" for h in hosts)],
        allowed_origins=["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*",
                         *(f"https://{h}" for h in settings().mcp_allowed_hosts)],
    )
    return server.streamable_http_app(streamable_http_path="/", stateless_http=True,
                                      transport_security=security)
