from pathlib import Path

from sankofa.config import settings
from sankofa.repository import RepositoryStore


def test_repository_store_account_deposit_and_workflow(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("LA_REPOSITORY_DB_PATH", str(tmp_path / "repository.sqlite3"))
    monkeypatch.setenv("LA_REPOSITORY_STORAGE_PATH", str(tmp_path / "files"))
    settings.cache_clear()
    repository = RepositoryStore()
    user = repository.create_user("parent@example.org", "a-long-test-password", "A Parent")
    assert repository.authenticate("parent@example.org", "a-long-test-password") is None
    repository.approve(user["id"])
    approved = repository.authenticate("parent@example.org", "a-long-test-password")
    assert approved and approved["id"] == user["id"]
    collection = repository.collections()[0]
    item = repository.create_item(collection["id"], {"title": "AIMS test record", "authors": ["A Parent"]}, user["id"], "CC0-1.0", "open", None)
    stream = repository.attach_file(item["id"], "test.txt", "text/plain", b"durable test record")
    assert Path(stream["path"]).read_bytes() == b"durable test record"
    repository.transition(item["id"], "accept", user["id"])
    published = repository.transition(item["id"], "commit", user["id"])
    assert published["status"] == "published"
    assert repository.list_published()[0]["id"] == item["id"]
    settings.cache_clear()
