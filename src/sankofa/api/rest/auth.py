"""Sankofa-owned authentication; no external repository account is required."""
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
from ...repository import RepositoryStore

router = APIRouter()
COOKIE = "sankofa_session"


class AccountRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=300)
    name: str = Field(min_length=2, max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=300)


class ResetRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


def _encode(user_id: str) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"uid": user_id, "exp": int(time.time()) + 8 * 3600}).encode()).decode().rstrip("=")
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
        body = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return str(body["uid"]) if int(body["exp"]) >= int(time.time()) else None
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def user_from_cookie(cookie: str | None) -> dict[str, Any] | None:
    uid = _decode(cookie)
    if not uid:
        return None
    try:
        return RepositoryStore().user(uid)
    except KeyError:
        return None


def require_user(cookie: str | None, roles: set[str] | None = None) -> dict[str, Any]:
    user = user_from_cookie(cookie)
    if not user:
        raise HTTPException(401, "Sign in with your Sankofa account.")
    if not user["approved"]:
        raise HTTPException(403, "Your Sankofa account is awaiting AIMS approval.")
    if roles and user["role"] not in roles:
        raise HTTPException(403, "This Sankofa action requires an approved staff account.")
    return user


@router.post("/signup", status_code=201)
def signup(body: AccountRequest) -> dict[str, Any]:
    try:
        user = RepositoryStore().create_user(body.email, body.password, body.name)
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(409, "An account with this email already exists.") from exc
        raise
    return {"user": user, "status": "awaiting_approval"}


@router.post("/login")
def login(body: LoginRequest, response: Response) -> dict[str, Any]:
    user = RepositoryStore().authenticate(body.email, body.password)
    if not user:
        raise HTTPException(401, "Email, password or approval status is incorrect.")
    response.set_cookie(COOKIE, _encode(user["id"]), httponly=True, secure=settings().session_cookie_secure, samesite="lax", max_age=8 * 3600)
    return {"user": user, "role": user["role"]}


@router.get("/me")
def me(sankofa_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    user = require_user(sankofa_session)
    return {"user": user, "role": user["role"]}


@router.post("/logout", status_code=204)
def logout(response: Response) -> None:
    response.delete_cookie(COOKIE)


@router.post("/password-reset")
def password_reset(body: ResetRequest) -> dict[str, str]:
    token = RepositoryStore().reset_token(body.email)
    result = {"status": "If the account exists, a reset link will be sent."}
    if not settings().session_cookie_secure and token:
        result["development_token"] = token
    return result


@router.post("/users/{user_id}/approve")
def approve(user_id: str, role: str = "researcher", sankofa_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    require_user(sankofa_session, {"admin"})
    if role not in {"researcher", "librarian", "editor", "admin"}:
        raise HTTPException(400, "Unsupported Sankofa role.")
    try:
        return RepositoryStore().approve(user_id, role)
    except KeyError as exc:
        raise HTTPException(404, "User not found.") from exc
