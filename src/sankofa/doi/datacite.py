"""DataCite DOIs for theses: metadata mapping and the REST API client.

A DOI is reserved as a draft (editable, deletable, does not resolve) and
registered as findable only after review. Findable DOIs are permanent.
Defaults point at the DataCite test system; production needs AIMS's own
repository account and prefix.
"""
from __future__ import annotations
import re
from typing import Any
import httpx
from ..centres import resolve
from ..config import settings
from ..links import record_url
from ..metadata import LICENCES, Person, ThesisMetadata

PUBLISHER = "African Institute for Mathematical Sciences"
ACCESS = {"open": ("Open access", "openAccess"), "embargoed": ("Embargoed access", "embargoedAccess"),
          "restricted": ("Restricted access", "restrictedAccess"), "metadata-only": ("Metadata only", "closedAccess")}


class DataCiteError(RuntimeError):
    pass


def suffix_for(thesis_id: str) -> str:
    return "aims." + re.sub(r"[^a-z0-9._-]+", "-", thesis_id.lower()).strip("-")


def _person(p: Person, affiliation: dict[str, Any] | None) -> dict[str, Any]:
    out: dict[str, Any] = {"name": p.display, "nameType": "Personal", "familyName": p.family}
    if p.given:
        out["givenName"] = p.given
    if p.orcid:
        out["nameIdentifiers"] = [{"nameIdentifier": f"https://orcid.org/{p.orcid}",
                                   "nameIdentifierScheme": "ORCID", "schemeUri": "https://orcid.org"}]
    if affiliation:
        out["affiliation"] = [affiliation]
    return out


def to_datacite(meta: ThesisMetadata, doi: str | None = None, publish: bool = False) -> dict[str, Any]:
    """DataCite Metadata Schema 4 attributes for a thesis, as a JSON:API document."""
    s = settings()
    centre = resolve(meta.centre)
    affiliation = None
    if centre:
        affiliation = {"name": centre.name}
        ror = s.centre_ror.get(centre.slug)
        if ror:
            affiliation |= {"affiliationIdentifier": ror, "affiliationIdentifierScheme": "ROR",
                            "schemeUri": "https://ror.org"}
    a: dict[str, Any] = {
        "creators": [_person(p, affiliation) for p in meta.authors],
        "titles": [{"title": meta.title, **({"lang": meta.language} if meta.language else {})}],
        "publisher": PUBLISHER,
        "publicationYear": meta.publication_year,
        "types": {"resourceTypeGeneral": "Dissertation",
                  "resourceType": "Doctoral thesis" if meta.programme == "PhD" else "Master's thesis"},
        "url": record_url(meta.id),
        "schemaVersion": "http://datacite.org/schema/kernel-4",
    }
    if meta.title_fr:
        a["titles"].append({"title": meta.title_fr, "titleType": "TranslatedTitle", "lang": "fr"})
    if meta.supervisors:
        a["contributors"] = [{**_person(p, None), "contributorType": "Supervisor"} for p in meta.supervisors]
    subjects = [{"subject": k} for k in meta.keywords]
    subjects += [{"subject": code, "subjectScheme": "MSC2020",
                  "schemeUri": "https://zbmath.org/classification/", "classificationCode": code} for code in meta.msc]
    if subjects:
        a["subjects"] = subjects
    descriptions = []
    if meta.abstract:
        descriptions.append({"description": meta.abstract, "descriptionType": "Abstract", "lang": meta.language or "en"})
    if meta.abstract_fr:
        descriptions.append({"description": meta.abstract_fr, "descriptionType": "Abstract", "lang": "fr"})
    if meta.degree or meta.programme:
        descriptions.append({"description": ", ".join(filter(None, [meta.degree, meta.programme, centre.name if centre else None])),
                             "descriptionType": "SeriesInformation"})
    if descriptions:
        a["descriptions"] = descriptions
    dates = [{"date": meta.date_issued or str(meta.publication_year), "dateType": "Issued"}] if meta.publication_year else []
    if meta.access == "embargoed" and meta.embargo_end:
        dates.append({"date": meta.embargo_end, "dateType": "Available"})
    if dates:
        a["dates"] = dates
    if meta.language:
        a["language"] = meta.language
    if meta.licence:
        name, uri = LICENCES[meta.licence]
        a["rightsList"] = [{"rights": name, **({"rightsUri": uri, "rightsIdentifier": meta.licence,
                                               "rightsIdentifierScheme": "SPDX"} if uri else {})}]
    # COAR/OpenAIRE access-rights vocabulary, as the roadmap's access level field requires.
    access, term = ACCESS[meta.access]
    a.setdefault("rightsList", []).append({"rights": access, "rightsUri": f"info:eu-repo/semantics/{term}"})
    if meta.funders:
        a["fundingReferences"] = [{
            "funderName": f.name,
            **({"funderIdentifier": f.identifier,
                "funderIdentifierType": "ROR" if "ror.org" in f.identifier else "Crossref Funder ID"} if f.identifier else {}),
            **({"awardNumber": f.award} if f.award else {}),
        } for f in meta.funders]
    if meta.related:
        a["relatedIdentifiers"] = [{"relatedIdentifier": r.identifier, "relatedIdentifierType": r.kind,
                                    "relationType": r.relation} for r in meta.related]
    if doi:
        a["doi"] = doi
    if publish:
        a["event"] = "publish"
    return {"data": {"type": "dois", "attributes": a}}


class DataCite:
    """Minimal DataCite REST client (https://support.datacite.org/docs/api)."""

    def __init__(self, transport: httpx.BaseTransport | None = None) -> None:
        s = settings()
        if not (s.datacite_repository_id and s.datacite_password and s.datacite_prefix):
            raise DataCiteError("DataCite is not configured: set LA_DATACITE_REPOSITORY_ID, "
                                "LA_DATACITE_PASSWORD and LA_DATACITE_PREFIX.")
        self.prefix = s.datacite_prefix
        self.http = httpx.Client(base_url=s.datacite_api_url, transport=transport, timeout=30.0,
                                 auth=(s.datacite_repository_id, s.datacite_password),
                                 headers={"Content-Type": "application/vnd.api+json"})

    def _send(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        r = self.http.request(method, path, json=body)
        if r.status_code >= 400:
            try:
                detail = "; ".join(e.get("title", "") for e in r.json().get("errors", []))
            except ValueError:
                detail = r.text[:300]
            raise DataCiteError(f"DataCite returned {r.status_code}: {detail or r.reason_phrase}")
        return r.json() if r.content else {}

    def reserve(self, meta: ThesisMetadata) -> str:
        """Create or refresh the draft DOI for a thesis; returns the DOI."""
        if not record_url(meta.id):
            raise DataCiteError("Set LA_PUBLIC_URL first: every DOI must resolve to the thesis page.")
        doi = meta.doi or f"{self.prefix}/{suffix_for(meta.id)}"
        if meta.doi_state == "draft":
            self._send("PUT", f"/dois/{doi}", to_datacite(meta, doi))
        else:
            self._send("POST", "/dois", to_datacite(meta, doi))
        return doi

    def register(self, meta: ThesisMetadata) -> str:
        """Make the DOI findable (permanent). Updates metadata if already findable."""
        if not meta.doi:
            raise DataCiteError("Reserve a draft DOI first.")
        self._send("PUT", f"/dois/{meta.doi}", to_datacite(meta, meta.doi, publish=True))
        return meta.doi

    def discard(self, doi: str) -> None:
        """Delete a draft DOI. DataCite refuses this for findable DOIs."""
        self._send("DELETE", f"/dois/{doi}")
