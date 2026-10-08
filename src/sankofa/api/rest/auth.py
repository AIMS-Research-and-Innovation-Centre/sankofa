"""Sankofa's single sign-in, delegated to DSpace authentication."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel, Field

from ...config import settings
from ...dspace import DSpaceClient, DSpaceError

router = APIRouter()
COOKIE = "sankofa_session"


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=300)


def _encode(token: str) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"token": token, "exp": int(time.time()) + 8 * 3600}).encode()).decode().rstrip("=")
    signature = hmac.new(settings().session_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def _decode(value: str | None) -> str | None:
    if not value or "." not in value:
        return None
    payload, signature = value.rsplit(".", 1)
    expected = hmac.new(settings().session_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        padded = payload + "=" * (-len(payload) % 4)
        body = json.loads(base64.urlsafe_b64decode(padded))
        if int(body.get("exp", 0)) < int(time.time()):
            return None
        return str(body["token"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def session_token(cookie: str | None) -> str | None:
    return _decode(cookie)


def require_token(cookie: str | None) -> str:
    token = _decode(cookie)
    if not token:
        raise HTTPException(401, "Sign in with your AIMS repository account.")
    return token


def _groups(user: dict[str, Any]) -> set[str]:
    values = user.get("groups") or user.get("groupNames") or user.get("eperson", {}).get("groups", [])
    names: set[str] = set()
    for value in values if isinstance(values, list) else []:
        names.add(value if isinstance(value, str) else str(value.get("name", "")))
    return {name for name in names if name}


def role(user: dict[str, Any]) -> str:
    groups = _groups(user)
    if settings().dspace_editor_group in groups:
        return "editor"
    if settings().dspace_librarian_group in groups:
        return "librarian"
    return "researcher"


@router.post("/login")
def login(body: LoginRequest, response: Response) -> dict[str, Any]:
    try:
        with DSpaceClient() as dspace:
            session = dspace.login(body.email, body.password)
    except DSpaceError as exc:
        raise HTTPException(exc.status_code or 502, str(exc)) from exc
    response.set_cookie(COOKIE, _encode(session.token), httponly=True,
                        secure=settings().session_cookie_secure, samesite="lax", max_age=8 * 3600)
    return {"user": session.user, "role": role(session.user)}


@router.get("/me")
def me(sankofa_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    token = require_token(sankofa_session)
    try:
        with DSpaceClient(token) as dspace:
            user = dspace.status()
    except DSpaceError as exc:
        raise HTTPException(exc.status_code or 502, str(exc)) from exc
    return {"user": user, "role": role(user)}


@router.post("/logout", status_code=204)
def logout(response: Response, sankofa_session: str | None = Cookie(default=None)) -> None:
    token = session_token(sankofa_session)
    if token:
        try:
            with DSpaceClient(token) as dspace:
                dspace.logout()
        except DSpaceError:
            pass
    response.delete_cookie(COOKIE)
