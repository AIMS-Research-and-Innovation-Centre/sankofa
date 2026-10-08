from __future__ import annotations

import httpx

from sankofa.config import settings
from sankofa.dspace.client import DSpaceClient


def test_dspace_client_uses_rest_auth_and_hal_links(monkeypatch):
    monkeypatch.setenv("LA_DSPACE_URL", "https://repo.example/server")
    settings.cache_clear()
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, str(request.url)))
        if request.url.path == "/server/api/security/csrf":
            return httpx.Response(204, headers={"DSPACE-XSRF-TOKEN": "csrf-token"})
        if request.url.path == "/server/api/authn/login":
            return httpx.Response(200, headers={"Authorization": "Bearer dspace-token"})
        if request.url.path == "/server/api/authn/status":
            return httpx.Response(200, json={"authenticated": True, "email": "librarian@aims.ac.za", "groups": ["AIMS Librarians"]})
        if request.url.path == "/server/api/core/communities":
            return httpx.Response(200, json={"_embedded": {"communities": [{"uuid": "c1", "name": "AIMS Rwanda"}]}})
        return httpx.Response(404, text="not found")

    with DSpaceClient(transport=httpx.MockTransport(handler)) as client:
        session = client.login("librarian@aims.ac.za", "secret")
        communities = client.communities(token=session.token)

    assert session.token == "dspace-token"
    assert communities[0]["name"] == "AIMS Rwanda"
    assert calls == [
        ("GET", "https://repo.example/server/api/security/csrf"),
        ("POST", "https://repo.example/server/api/authn/login"),
        ("GET", "https://repo.example/server/api/authn/status"),
        ("GET", "https://repo.example/server/api/core/communities?page=0&size=100"),
    ]
    settings.cache_clear()


def test_dspace_client_search_passes_page_and_query(monkeypatch):
    monkeypatch.setenv("LA_DSPACE_URL", "https://repo.example/server")
    settings.cache_clear()
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, json={"_embedded": {"searchResult": []}})

    with DSpaceClient(transport=httpx.MockTransport(handler)) as client:
        client.search("climate", page=2, size=10)
    assert "query=climate" in seen[0]
    assert "page=2" in seen[0]
    assert "size=10" in seen[0]
    settings.cache_clear()
