import json
import pytest
from fastapi.testclient import TestClient

pytest.importorskip("mcp")


class FakeGraph:
    def run(self, cypher, **params):
        if "count(*)" in cypher:
            return [{"campus": "ghana", "n": 2}, {"campus": "AIMS Rwanda", "n": 1}, {"campus": "mars", "n": 1}]
        if "RETURN t, s.id" in cypher:
            return [{"t": {"id": params["id"], "title": "Stochastic SIR", "campus": "ghana", "author": None}, "author": "ada"}]
        if "ABOUT" in cypher:
            return [{"name": "malaria"}]
        return []


@pytest.fixture(scope="module")
def client():
    from sankofa.api import rest
    from sankofa.api.app import app
    for module in (rest.centres, rest.theses):
        module.graph = lambda: FakeGraph()
    with TestClient(app, base_url="http://localhost") as c:
        yield c


def test_centres_counts_resolve_free_text(client):
    body = client.get("/centres/").json()
    counts = {c["slug"]: c["theses"] for c in body["centres"]}
    assert counts["ghana"] == 2 and counts["rwanda"] == 1 and body["unassigned"] == 1
    assert [c["id"] for c in body["communities"]] == ["C2", "C3", "C4", "C5"]


def rpc(client, method, params, id=1):
    r = client.post("/mcp/", json={"jsonrpc": "2.0", "id": id, "method": method, "params": params},
                    headers={"Accept": "application/json, text/event-stream",
                             "MCP-Protocol-Version": "2025-06-18"})
    assert r.status_code == 200, r.text
    text = r.text
    if text.startswith("event:") or "data:" in text:
        text = next(l[5:] for l in text.splitlines() if l.startswith("data:"))
    return json.loads(text)


def test_mcp_lists_read_only_tools(client):
    init = rpc(client, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                      "clientInfo": {"name": "test", "version": "0"}})
    assert init["result"]["serverInfo"]["name"] == "sankofa"
    tools = rpc(client, "tools/list", {}, 2)["result"]["tools"]
    names = {t["name"] for t in tools}
    assert {"search_theses", "get_thesis", "related_records", "list_centres", "ask_theses"} <= names
    assert all(t["annotations"]["readOnlyHint"] for t in tools)


def test_mcp_get_thesis_resolves_centre(client):
    result = rpc(client, "tools/call", {"name": "get_thesis", "arguments": {"thesis_id": "t1"}}, 3)["result"]
    data = result.get("structuredContent") or json.loads(result["content"][0]["text"])
    data = data.get("result", data)
    assert data["centre"] == "AIMS Ghana" and data["author"] == "ada" and data["concepts"] == ["malaria"]
