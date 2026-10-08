import json
import httpx
import pytest
from sankofa.config import settings
from sankofa.doi import DataCite, DataCiteError, to_datacite
from sankofa.doi.datacite import suffix_for
from test_metadata import full


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    s = settings()
    for key, value in dict(public_url="https://repo.aims.example", datacite_repository_id="AIMS.REPO",
                           datacite_password="pw", datacite_prefix="10.80000",
                           centre_ror={"ghana": "https://ror.org/0example"}).items():
        monkeypatch.setattr(s, key, value)


def test_mapping_covers_the_roadmap_schema():
    a = to_datacite(full(funders=[{"name": "Mastercard Foundation", "award": "MCF-1"}],
                         related=[{"identifier": "10.5555/article", "relation": "IsSourceOf"}]), "10.80000/aims.t1")["data"]["attributes"]
    creator = a["creators"][0]
    assert creator["name"] == "Owusu, Ama" and creator["nameIdentifiers"][0]["nameIdentifier"] == "https://orcid.org/0000-0002-1825-0097"
    assert creator["affiliation"] == [{"name": "AIMS Ghana", "affiliationIdentifier": "https://ror.org/0example",
                                       "affiliationIdentifierScheme": "ROR", "schemeUri": "https://ror.org"}]
    assert a["contributors"][0]["contributorType"] == "Supervisor"
    assert a["types"] == {"resourceTypeGeneral": "Dissertation", "resourceType": "Master's thesis"}
    assert a["publisher"] == "African Institute for Mathematical Sciences" and a["publicationYear"] == 2019
    assert {"title": "SIR stochastique", "titleType": "TranslatedTitle", "lang": "fr"} in a["titles"]
    assert {"subject": "92D30", "subjectScheme": "MSC2020", "schemeUri": "https://zbmath.org/classification/", "classificationCode": "92D30"} in a["subjects"]
    assert [d["lang"] for d in a["descriptions"] if d["descriptionType"] == "Abstract"] == ["en", "fr"]
    assert a["rightsList"][0]["rightsUri"] == "https://creativecommons.org/licenses/by/4.0/"
    assert a["rightsList"][1]["rightsUri"] == "info:eu-repo/semantics/openAccess"
    assert a["dates"] == [{"date": "2019-06-30", "dateType": "Issued"}]
    assert a["fundingReferences"] == [{"funderName": "Mastercard Foundation", "awardNumber": "MCF-1"}]
    assert a["relatedIdentifiers"][0]["relationType"] == "IsSourceOf"
    assert a["url"] == "https://repo.aims.example/#/thesis/t1" and "event" not in a


def test_embargo_and_phd():
    a = to_datacite(full(access="embargoed", embargo_end="2026-01-01", programme="PhD"))["data"]["attributes"]
    assert {"date": "2026-01-01", "dateType": "Available"} in a["dates"]
    assert a["types"]["resourceType"] == "Doctoral thesis" and "embargoedAccess" in a["rightsList"][1]["rightsUri"]


def client(calls):
    def handle(request: httpx.Request):
        body = json.loads(request.content) if request.content else None
        calls.append((request.method, request.url.path, body, request.headers["authorization"]))
        return httpx.Response(201 if request.method == "POST" else 200, json={"data": {}})
    return DataCite(transport=httpx.MockTransport(handle))


def test_reserve_then_register_then_refresh():
    calls = []
    dc = client(calls)
    doi = dc.reserve(full())
    assert doi == "10.80000/" + suffix_for("t1") == "10.80000/aims.t1"
    method, path, body, auth = calls[-1]
    assert (method, path) == ("POST", "/dois") and "event" not in body["data"]["attributes"] and auth.startswith("Basic ")
    dc.reserve(full(doi=doi, doi_state="draft"))
    assert calls[-1][:2] == ("PUT", "/dois/10.80000/aims.t1")
    dc.register(full(doi=doi, doi_state="draft"))
    assert calls[-1][2]["data"]["attributes"]["event"] == "publish"


def test_guards_and_errors(monkeypatch):
    with pytest.raises(DataCiteError, match="Reserve a draft"):
        client([]).register(full())
    monkeypatch.setattr(settings(), "public_url", "")
    with pytest.raises(DataCiteError, match="LA_PUBLIC_URL"):
        client([]).reserve(full())
    monkeypatch.setattr(settings(), "datacite_password", None)
    with pytest.raises(DataCiteError, match="not configured"):
        DataCite()


def test_datacite_errors_are_reported():
    dc = DataCite(transport=httpx.MockTransport(lambda r: httpx.Response(422, json={"errors": [{"title": "Creators can't be blank"}]})))
    with pytest.raises(DataCiteError, match="422: Creators can't be blank"):
        dc.reserve(full())
