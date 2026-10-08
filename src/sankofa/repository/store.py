"""Sankofa-owned repository catalogue, accounts, workflow and file storage."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from ..config import settings


class RepositoryStore:
    def __init__(self) -> None:
        self.db_path = Path(settings().repository_db_path)
        self.storage_path = Path(settings().repository_storage_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self._init()

    def _db(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.db_path)
        db.row_factory = sqlite3.Row
        return db

    def _init(self) -> None:
        with self._db() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
              name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'researcher', approved INTEGER NOT NULL DEFAULT 0,
              reset_token TEXT, reset_expires TEXT, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS communities (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '');
            CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, community_id TEXT NOT NULL, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS items (
              id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, metadata TEXT NOT NULL, status TEXT NOT NULL,
              owner_id TEXT NOT NULL, licence TEXT, access TEXT NOT NULL DEFAULT 'open', embargo_end TEXT,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL, withdrawn INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS bitstreams (
              id TEXT PRIMARY KEY, item_id TEXT NOT NULL, filename TEXT NOT NULL, media_type TEXT NOT NULL,
              path TEXT NOT NULL, size INTEGER NOT NULL, checksum TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, item_id TEXT, detail TEXT, created_at TEXT NOT NULL);
            """)
            if db.execute("SELECT COUNT(*) FROM communities").fetchone()[0] == 0:
                communities = [(f"c-{slug}", name) for slug, name in [
                    ("centres", "AIMS Centres"), ("math-epi", "Mathematical Epidemiology"),
                    ("climate", "Climate Science"), ("ai", "Artificial Intelligence"),
                    ("ammi", "AMMI"),
                ]]
                db.executemany("INSERT INTO communities(id,name) VALUES (?,?)", communities)
                for cid, _ in communities:
                    db.execute("INSERT INTO collections(id,community_id,name) VALUES (?,?,?)", (f"{cid}-theses", cid, "Theses and Dissertations"))
            bootstrap_email = settings().bootstrap_admin_email
            bootstrap_password = settings().bootstrap_admin_password
            if bootstrap_email and bootstrap_password and not db.execute("SELECT 1 FROM users WHERE email=?", (bootstrap_email.lower().strip(),)).fetchone():
                db.execute("INSERT INTO users(id,email,password,name,role,approved,created_at) VALUES (?,?,?,?,?,?,?)",
                           (str(uuid4()), bootstrap_email.lower().strip(), self._hash(bootstrap_password), settings().bootstrap_admin_name, "admin", 1, datetime.now(UTC).isoformat()))

    @staticmethod
    def _hash(password: str, salt: bytes | None = None) -> str:
        salt = salt or secrets.token_bytes(16)
        digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
        return f"scrypt${salt.hex()}${digest.hex()}"

    @classmethod
    def verify(cls, password: str, encoded: str) -> bool:
        try:
            _, salt, expected = encoded.split("$", 2)
            actual = cls._hash(password, bytes.fromhex(salt)).split("$", 2)[2]
            return hmac.compare_digest(actual, expected)
        except (ValueError, TypeError):
            return False

    def create_user(self, email: str, password: str, name: str) -> dict[str, Any]:
        uid = str(uuid4())
        with self._db() as db:
            db.execute("INSERT INTO users(id,email,password,name,created_at) VALUES (?,?,?,?,?)",
                       (uid, email.lower().strip(), self._hash(password), name.strip(), datetime.now(UTC).isoformat()))
        return self.user(uid)

    def user(self, uid: str) -> dict[str, Any]:
        with self._db() as db:
            row = db.execute("SELECT id,email,name,role,approved,created_at FROM users WHERE id=?", (uid,)).fetchone()
        if not row:
            raise KeyError(uid)
        return dict(row)

    def authenticate(self, email: str, password: str) -> dict[str, Any] | None:
        with self._db() as db:
            row = db.execute("SELECT * FROM users WHERE email=?", (email.lower().strip(),)).fetchone()
        if not row or not row["approved"] or not self.verify(password, row["password"]):
            return None
        return self.user(row["id"])

    def approve(self, uid: str, role: str = "researcher") -> dict[str, Any]:
        with self._db() as db:
            db.execute("UPDATE users SET approved=1, role=? WHERE id=?", (role, uid))
        return self.user(uid)

    def communities(self) -> list[dict[str, Any]]:
        with self._db() as db:
            return [dict(r) for r in db.execute("SELECT * FROM communities ORDER BY name")]

    def collections(self, community_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM collections" + (" WHERE community_id=?" if community_id else "") + " ORDER BY name"
        with self._db() as db:
            return [dict(r) for r in db.execute(query, (community_id,) if community_id else ())]

    def create_item(self, collection_id: str, metadata: dict[str, Any], owner_id: str,
                    licence: str, access: str, embargo_end: str | None) -> dict[str, Any]:
        item_id = str(uuid4())
        now = datetime.now(UTC).isoformat()
        with self._db() as db:
            db.execute("INSERT INTO items VALUES (?,?,?,?,?,?,?,?,?,?,?)", (item_id, collection_id, __import__('json').dumps(metadata), "submitted", owner_id, licence, access, embargo_end, now, now, 0))
        return self.item(item_id)

    def item(self, item_id: str) -> dict[str, Any]:
        with self._db() as db:
            row = db.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
            streams = [dict(r) for r in db.execute("SELECT * FROM bitstreams WHERE item_id=?", (item_id,))]
        if not row:
            raise KeyError(item_id)
        result = dict(row)
        result["metadata"] = __import__('json').loads(result.pop("metadata"))
        result["bitstreams"] = streams
        return result

    def attach_file(self, item_id: str, filename: str, media_type: str, content: bytes) -> dict[str, Any]:
        stream_id = str(uuid4())
        target_dir = self.storage_path / item_id
        target_dir.mkdir(parents=True, exist_ok=True)
        path = target_dir / stream_id
        path.write_bytes(content)
        checksum = hashlib.sha256(content).hexdigest()
        with self._db() as db:
            db.execute("INSERT INTO bitstreams VALUES (?,?,?,?,?,?,?)", (stream_id, item_id, filename, media_type, str(path), len(content), checksum))
            return dict(db.execute("SELECT * FROM bitstreams WHERE id=?", (stream_id,)).fetchone())

    def workflow(self, role: str) -> list[dict[str, Any]]:
        with self._db() as db:
            return [dict(r) for r in db.execute("SELECT id,collection_id,metadata,status,owner_id,licence,access,embargo_end,created_at FROM items WHERE status IN ('submitted','returned') ORDER BY created_at")]

    def transition(self, item_id: str, action: str, actor_id: str) -> dict[str, Any]:
        status = {"accept": "approved", "commit": "published", "reject": "returned", "withdraw": "withdrawn"}.get(action)
        if not status:
            raise ValueError(action)
        with self._db() as db:
            db.execute("UPDATE items SET status=?, withdrawn=?, updated_at=? WHERE id=?", (status, int(status == "withdrawn"), datetime.now(UTC).isoformat(), item_id))
            db.execute("INSERT INTO audit VALUES (?,?,?,?,?,?)", (str(uuid4()), actor_id, action, item_id, "", datetime.now(UTC).isoformat()))
        return self.item(item_id)

    def list_published(self, limit: int = 200) -> list[dict[str, Any]]:
        with self._db() as db:
            ids = [r["id"] for r in db.execute("SELECT id FROM items WHERE status='published' AND withdrawn=0 ORDER BY updated_at DESC LIMIT ?", (limit,))]
        return [self.item(i) for i in ids]

    def reset_token(self, email: str) -> str | None:
        token = secrets.token_urlsafe(32)
        with self._db() as db:
            row = db.execute("SELECT id FROM users WHERE email=?", (email.lower().strip(),)).fetchone()
            if not row:
                return None
            db.execute("UPDATE users SET reset_token=?, reset_expires=? WHERE id=?", (token, (datetime.now(UTC) + timedelta(hours=1)).isoformat(), row["id"]))
        return token
