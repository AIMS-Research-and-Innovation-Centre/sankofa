"""Small, explicit client for the DSpace 10 REST API.

DSpace remains the repository of record. Sankofa never writes directly to its
database or assetstore: all repository changes go through documented REST
resources. HAL responses are unwrapped here so the application does not depend
on the Angular frontend's implementation details.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, BinaryIO, Self
from urllib.parse import urljoin

import httpx

from ..config import settings


class DSpaceError(RuntimeError):
    """A DSpace REST request failed."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class DSpaceNotConfigured(DSpaceError):
    pass


@dataclass(frozen=True)
class DSpaceSession:
    token: str
    user: dict[str, Any]


def _embedded(body: Any, key: str) -> list[dict[str, Any]]:
    if isinstance(body, list):
        return [x for x in body if isinstance(x, dict)]
    if not isinstance(body, dict):
        return []
    embedded = body.get("_embedded", {})
    values = embedded.get(key, []) if isinstance(embedded, dict) else []
    return [x for x in values if isinstance(x, dict)]


def _link(resource: dict[str, Any], rel: str) -> str | None:
    links = resource.get("_links", {})
    link = links.get(rel) if isinstance(links, dict) else None
    return link.get("href") if isinstance(link, dict) else None


class DSpaceClient:
    """HTTP client for DSpace 10.1 REST resources.

    The client accepts a token per operation so the API can keep one DSpace
    sign-in per browser without sharing credentials between requests.
    """

    def __init__(self, token: str | None = None, transport: httpx.BaseTransport | None = None) -> None:
        base = settings().dspace_url.rstrip("/")
        if not base:
            raise DSpaceNotConfigured("Set LA_DSPACE_URL to the DSpace REST server.")
        self.base = base + "/"
        self.token = token
        self.http = httpx.Client(timeout=settings().dspace_timeout, transport=transport)
        self.csrf_token: str | None = None

    def close(self) -> None:
        self.http.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _url(self, path: str) -> str:
        return urljoin(self.base, path.lstrip("/"))

    def _request(self, method: str, path: str, *, token: str | None = None,
                 **kwargs: Any) -> httpx.Response:
        headers = dict(kwargs.pop("headers", {}) or {})
        bearer = token or self.token
        if bearer:
            headers["Authorization"] = f"Bearer {bearer}"
        if method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            if not self.csrf_token:
                csrf = self.http.get(self._url("/api/security/csrf"))
                self.csrf_token = csrf.headers.get("DSPACE-XSRF-TOKEN")
            if self.csrf_token:
                headers["X-XSRF-TOKEN"] = self.csrf_token
        response = self.http.request(method, self._url(path), headers=headers, **kwargs)
        self.csrf_token = response.headers.get("DSPACE-XSRF-TOKEN", self.csrf_token)
        if response.status_code >= 400:
            detail = response.text[:500]
            raise DSpaceError(f"DSpace returned HTTP {response.status_code}: {detail}", response.status_code)
        return response

    def login(self, email: str, password: str) -> DSpaceSession:
        response = self._request(
            "POST", "/api/authn/login",
            data={"user": email, "password": password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token = response.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not token:
            raise DSpaceError("DSpace did not return an authentication token.", response.status_code)
        user = self.status(token)
        return DSpaceSession(token, user)

    def status(self, token: str | None = None) -> dict[str, Any]:
        return self._request("GET", "/api/authn/status", token=token).json()

    def logout(self, token: str | None = None) -> None:
        self._request("POST", "/api/authn/logout", token=token)

    def page(self, resource: str, *, page: int = 0, size: int = 20,
             token: str | None = None, **params: Any) -> dict[str, Any]:
        query = {"page": page, "size": min(max(size, 1), 100), **params}
        return self._request("GET", f"/api/{resource.lstrip('/')}", token=token, params=query).json()

    def communities(self, *, token: str | None = None) -> list[dict[str, Any]]:
        return _embedded(self.page("core/communities", token=token, size=100), "communities")

    def collections(self, *, community: str | None = None,
                    token: str | None = None) -> list[dict[str, Any]]:
        if community:
            href = _link(community, "collections")
            if href:
                return _embedded(self._request("GET", href, token=token).json(), "collections")
        return _embedded(self.page("core/collections", token=token, size=100), "collections")

    def collection(self, uuid: str, *, token: str | None = None) -> dict[str, Any]:
        return self._request("GET", f"/api/core/collections/{uuid}", token=token).json()

    def item(self, uuid: str, *, token: str | None = None) -> dict[str, Any]:
        return self._request("GET", f"/api/core/items/{uuid}", token=token).json()

    def bitstreams(self, item: dict[str, Any], *, token: str | None = None) -> list[dict[str, Any]]:
        href = _link(item, "bundles")
        if not href:
            return []
        bundles = _embedded(self._request("GET", href, token=token).json(), "bundles")
        streams: list[dict[str, Any]] = []
        for bundle in bundles:
            stream_href = _link(bundle, "bitstreams")
            if stream_href:
                streams.extend(_embedded(self._request("GET", stream_href, token=token).json(), "bitstreams"))
        return streams

    def search(self, query: str, *, page: int = 0, size: int = 20,
               token: str | None = None, **filters: Any) -> dict[str, Any]:
        return self.page("discover/search/objects", page=page, size=size, token=token,
                         query=query, **filters)

    def workflow_items(self, *, token: str) -> list[dict[str, Any]]:
        return _embedded(self.page("workflow/workflowitems", token=token, size=100), "workflowitems")

    def workflow_action(self, workflow_item: dict[str, Any], action: str, *, token: str,
                       reason: str = "") -> dict[str, Any]:
        links = workflow_item.get("_links", {})
        actions = links.get("workflowactions", {}) if isinstance(links, dict) else {}
        href = actions.get(action, {}).get("href") if isinstance(actions, dict) else None
        href = href or f"/api/workflow/workflowitems/{workflow_item.get('id')}/{action}"
        body = {"reason": reason} if reason else None
        return self._request("POST", href, token=token, json=body).json()

    def create_workspace_item(self, collection: dict[str, Any], *, token: str) -> dict[str, Any]:
        """Start a DSpace submission in a collection."""
        collection_uuid = collection.get("uuid")
        if not collection_uuid:
            raise DSpaceError("Collection response did not include a UUID.", 502)
        return self._request("POST", "/api/submission/workspaceitems", token=token,
                             params={"owningCollection": collection_uuid}).json()

    def upload_workspace_file(self, workspace_item: dict[str, Any], filename: str, file: BinaryIO,
                              *, token: str, content_type: str = "application/pdf") -> dict[str, Any]:
        workspace_id = workspace_item.get("id") or workspace_item.get("uuid")
        if not workspace_id:
            raise DSpaceError("Workspace item response did not include an id.", 502)
        return self._request(
            "POST", f"/api/submission/workspaceitems/{workspace_id}", token=token,
            files={"file": (filename, file, content_type)},
        ).json()

    def upload_bitstream(self, bundle: dict[str, Any], filename: str, file: BinaryIO,
                         *, token: str, content_type: str = "application/pdf") -> dict[str, Any]:
        href = _link(bundle, "bitstreams") or "/api/core/bitstreams"
        response = self._request(
            "POST", href, token=token,
            files={"file": (filename, file, content_type)},
        )
        return response.json()

    def patch_metadata(self, item: dict[str, Any], metadata: list[dict[str, Any]], *, token: str) -> dict[str, Any]:
        href = _link(item, "self") or f"/api/core/items/{item.get('uuid')}"
        return self._request("PUT", href, token=token, json={"metadata": metadata}).json()

    def patch_workspace_metadata(self, workspace_item: dict[str, Any],
                                 metadata: dict[str, list[dict[str, Any]]], *, token: str) -> dict[str, Any]:
        workspace_id = workspace_item.get("id") or workspace_item.get("uuid")
        if not workspace_id:
            raise DSpaceError("Workspace item response did not include an id.", 502)
        operations = [{"op": "add", "path": f"/sections/traditionalpageone/{key}", "value": values}
                      for key, values in metadata.items()]
        return self._request("PATCH", f"/api/submission/workspaceitems/{workspace_id}", token=token,
                             json=operations).json()

    def submit_workspace_item(self, workspace_item: dict[str, Any], *, token: str) -> dict[str, Any]:
        workspace_id = workspace_item.get("id") or workspace_item.get("uuid")
        if not workspace_id:
            raise DSpaceError("Workspace item response did not include an id.", 502)
        href = _link(workspace_item, "self") or self._url(f"/api/submission/workspaceitems/{workspace_id}")
        response = self._request("POST", "/api/workflow/workflowitems", token=token,
                                 headers={"Content-Type": "text/uri-list"}, content=href)
        return response.json() if response.content else {"status": "submitted"}

    def download_url(self, bitstream: dict[str, Any]) -> str | None:
        return _link(bitstream, "content") or _link(bitstream, "self")

    def download(self, bitstream: dict[str, Any], *, token: str | None = None) -> httpx.Response:
        href = self.download_url(bitstream)
        if not href:
            raise DSpaceError("Bitstream has no content link.")
        return self._request("GET", href, token=token)

    def withdraw(self, item: dict[str, Any], *, token: str) -> dict[str, Any]:
        href = _link(item, "self") or f"/api/core/items/{item.get('uuid')}"
        response = self._request("DELETE", href, token=token)
        return response.json() if response.content else {}


def unwrap_resources(body: dict[str, Any], key: str) -> Iterable[dict[str, Any]]:
    return _embedded(body, key)
