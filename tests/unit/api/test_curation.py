import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sankofa.api.rest import curation
from sankofa.config import settings
from sankofa.metadata import ThesisMetadata

pytest.importorskip("mcp")
AUTH = {"Authorization": "Bearer secret"}


class FakeDataCite:
    calls: list = []

    def __init__(self):
        self.prefix = "10.80000"

    def reserve(self, meta):
        self.calls.append(("reserve", meta.id)); return f"10.80000/aims.{meta.id}"

    def register(self, meta):
        self.calls.append(("register", meta.doi)); return meta.doi

    def discard(self, doi):
        self.calls.append(("discard", doi))


@pytest.fixture
def client(monkeypatch):
    store = {"t1": ThesisMetadata(id="t1", title="Stochastic SIR", year=2019, centre="ghana", language="en")}
    def load(thesis_id):
        if thesis_id not in store:
            raise HTTPException(404, "Thesis not found")
        return store[thesis_id]
    monkeypatch.setattr(curation, "load", load)
    monkeypatch.setattr(curation, "save", lambda meta, **kw: store.__setitem__(meta.id, meta))
    monkeypatch.setattr(curation, "reindex", lambda meta: None)
    monkeypatch.setattr(curation, "event_store", lambda: type("E", (), {"append": lambda self, e: None})())
    monkeypatch.setattr(curation, "DataCite", FakeDataCite)
    FakeDataCite.calls = []
    for key, value in dict(curator_token="secret", datacite_prefix="10.80000", public_url="https://repo.example").items():
        monkeypatch.setattr(settings(), key, value)
    from sankofa.api.app import app
    with TestClient(app, base_url="http://localhost") as c:
        c.store = store
        yield c


COMPLETE = {"id": "t1", "title": "Stochastic SIR", "authors": [{"family": "Owusu", "given": "Ama"}], "year": 2019,
            "centre": "ghana", "abstract": "We model malaria.", "keywords": ["malaria"], "licence": "CC-BY-4.0", "language": "en"}


def test_reading_is_public_and_shows_what_is_missing(client):
    body = client.get("/theses/t1/metadata").json()
    assert body["completeness"]["doi_ready"] is False and "Licence" in body["completeness"]["missing_required"]
    assert body["datacite"]["types"]["resourceTypeGeneral"] == "Dissertation"
    assert body["doi_service"]["curation_enabled"] is True


def test_writes_need_the_curator_token(client, monkeypatch):
    assert client.put("/theses/t1/metadata", json=COMPLETE).status_code == 401
    assert client.put("/theses/t1/metadata", json=COMPLETE, headers={"Authorization": "Bearer nope"}).status_code == 401
    monkeypatch.setattr(settings(), "curator_token", None)
    assert client.post("/theses/t1/doi", json={"action": "reserve"}, headers=AUTH).status_code == 503


def test_edit_validates_and_cannot_set_the_doi(client):
    assert client.put("/theses/t1/metadata", json={**COMPLETE, "centre": "mars"}, headers=AUTH).status_code == 422
    assert client.put("/theses/t1/metadata", json={**COMPLETE, "id": "t2"}, headers=AUTH).status_code == 400
    r = client.put("/theses/t1/metadata", json={**COMPLETE, "doi": "10.1234/forged", "doi_state": "findable"}, headers=AUTH)
    assert r.status_code == 200 and r.json()["completeness"]["doi_ready"] is True
    assert client.store["t1"].doi is None


def test_doi_lifecycle_and_safety_rules(client):
    assert client.post("/theses/t1/doi", json={"action": "reserve"}, headers=AUTH).status_code == 409  # incomplete
    client.put("/theses/t1/metadata", json=COMPLETE, headers=AUTH)
    assert client.post("/theses/t1/doi", json={"action": "register"}, headers=AUTH).status_code == 409  # no draft yet
    r = client.post("/theses/t1/doi", json={"action": "reserve"}, headers=AUTH).json()
    assert r == {"doi": "10.80000/aims.t1", "doi_state": "draft", "url": "https://doi.org/10.80000/aims.t1"}
    client.put("/theses/t1/metadata", json={**COMPLETE, "title": "Stochastic SIR models"}, headers=AUTH)
    assert FakeDataCite.calls[-1] == ("reserve", "t1")  # the draft follows the edit
    assert client.post("/theses/t1/doi", json={"action": "register"}, headers=AUTH).json()["doi_state"] == "findable"
    assert client.post("/theses/t1/doi", json={"action": "register"}, headers=AUTH).status_code == 409
    assert client.post("/theses/t1/doi", json={"action": "discard"}, headers=AUTH).status_code == 409  # permanent


def test_discarding_a_draft(client):
    client.put("/theses/t1/metadata", json=COMPLETE, headers=AUTH)
    client.post("/theses/t1/doi", json={"action": "reserve"}, headers=AUTH)
    assert client.post("/theses/t1/doi", json={"action": "discard"}, headers=AUTH).json()["doi"] is None
    assert FakeDataCite.calls[-1] == ("discard", "10.80000/aims.t1")
