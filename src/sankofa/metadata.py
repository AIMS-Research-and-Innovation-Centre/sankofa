"""Structured thesis metadata — the roadmap schema (Section 5), ready for DataCite.

Graph nodes keep their flat summary fields (title, abstract, year, campus,
author) for search and the graph; the full record is stored alongside as
JSON in `t.meta` and merged back when a thesis is read.
"""
from __future__ import annotations
import json
import re
from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator
from .centres import resolve

ORCID = re.compile(r"^(?:https?://orcid\.org/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$")
DOI = re.compile(r"^(?:https?://(?:dx\.)?doi\.org/|doi:)?(10\.\d{4,9}/\S+)$", re.I)

LICENCES = {
    "CC-BY-4.0": ("Creative Commons Attribution 4.0 International", "https://creativecommons.org/licenses/by/4.0/"),
    "CC-BY-SA-4.0": ("Creative Commons Attribution-ShareAlike 4.0 International", "https://creativecommons.org/licenses/by-sa/4.0/"),
    "CC-BY-NC-4.0": ("Creative Commons Attribution-NonCommercial 4.0 International", "https://creativecommons.org/licenses/by-nc/4.0/"),
    "CC-BY-NC-ND-4.0": ("Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International", "https://creativecommons.org/licenses/by-nc-nd/4.0/"),
    "CC0-1.0": ("Creative Commons Zero 1.0 Universal", "https://creativecommons.org/publicdomain/zero/1.0/"),
    "all-rights-reserved": ("All rights reserved", None),
}
PROGRAMMES = ("MSc", "PhD", "Research Chair", "Co-op/Internship", "Scholars Program", "AHC")


class Person(BaseModel):
    family: str = Field(min_length=1)
    given: str = ""
    orcid: str | None = None

    @field_validator("orcid")
    @classmethod
    def _orcid(cls, value: str | None) -> str | None:
        if not value:
            return None
        match = ORCID.match(value.strip())
        if not match:
            raise ValueError("ORCID must look like 0000-0002-1825-0097")
        return match.group(1)

    @property
    def display(self) -> str:
        return f"{self.family}, {self.given}" if self.given else self.family

    @classmethod
    def parse(cls, text: str) -> "Person":
        """'Owusu, Ama' or 'Ama Owusu' (surname last) to a Person."""
        text = " ".join(text.split())
        if "," in text:
            family, given = (p.strip() for p in text.split(",", 1))
        else:
            *given_parts, family = text.split(" ")
            given = " ".join(given_parts)
        return cls(family=family, given=given)


class Funder(BaseModel):
    name: str = Field(min_length=1)
    identifier: str | None = None  # ROR or Crossref Funder ID URL
    award: str | None = None


class Related(BaseModel):
    identifier: str = Field(min_length=1)
    kind: Literal["DOI", "URL", "Handle", "arXiv"] = "DOI"
    relation: Literal["IsSupplementedBy", "IsSourceOf", "IsReferencedBy", "References",
                      "IsPreviousVersionOf", "IsNewVersionOf", "HasVersion", "IsVersionOf",
                      "IsPartOf", "HasPart", "Cites", "IsCitedBy", "IsDescribedBy"] = "IsSupplementedBy"


class ThesisMetadata(BaseModel):
    id: str
    title: str = Field(min_length=1)
    title_fr: str | None = None
    authors: list[Person] = Field(default_factory=list)
    supervisors: list[Person] = Field(default_factory=list)
    abstract: str | None = None
    abstract_fr: str | None = None
    keywords: list[str] = Field(default_factory=list)
    msc: list[str] = Field(default_factory=list)  # MSC 2020 codes
    year: int | None = Field(default=None, ge=1900, le=2100)
    date_issued: str | None = None  # ISO 8601: YYYY, YYYY-MM or YYYY-MM-DD
    centre: str | None = None  # Centre slug from the controlled list
    programme: str | None = None
    degree: str | None = "Master of Science"
    language: str | None = "en"  # ISO 639-1
    licence: str | None = None  # key of LICENCES
    access: Literal["open", "embargoed", "restricted", "metadata-only"] = "open"
    embargo_end: str | None = None
    funders: list[Funder] = Field(default_factory=list)
    related: list[Related] = Field(default_factory=list)
    doi: str | None = None
    doi_state: Literal["draft", "findable"] | None = None

    @field_validator("date_issued", "embargo_end")
    @classmethod
    def _iso(cls, value: str | None) -> str | None:
        if value and not re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", value.strip()):
            raise ValueError("Use ISO 8601: YYYY, YYYY-MM or YYYY-MM-DD")
        return value.strip() if value else None

    @field_validator("centre")
    @classmethod
    def _centre(cls, value: str | None) -> str | None:
        if not value:
            return None
        centre = resolve(value)
        if not centre:
            raise ValueError(f"Unknown Centre {value!r}")
        return centre.slug

    @field_validator("licence")
    @classmethod
    def _licence(cls, value: str | None) -> str | None:
        if value and value not in LICENCES:
            raise ValueError(f"Licence must be one of {', '.join(LICENCES)}")
        return value or None

    @field_validator("language")
    @classmethod
    def _language(cls, value: str | None) -> str | None:
        if value and not re.fullmatch(r"[a-z]{2}", value):
            raise ValueError("Language must be an ISO 639-1 code such as en or fr")
        return value or None

    @field_validator("doi")
    @classmethod
    def _doi(cls, value: str | None) -> str | None:
        if not value:
            return None
        match = DOI.match(value.strip())
        if not match:
            raise ValueError("DOI must look like 10.1234/abc")
        return match.group(1).lower()

    @property
    def publication_year(self) -> int | None:
        return self.year or (int(self.date_issued[:4]) if self.date_issued else None)


# Required for a DOI (DataCite mandatory fields) and by the roadmap; recommended for good discovery.
REQUIRED = {
    "title": "Title", "authors": "Author(s)", "publication_year": "Year or date issued",
    "centre": "Centre", "abstract": "Abstract", "keywords": "Keywords", "licence": "Licence",
    "language": "Language",
}
RECOMMENDED = {
    "supervisors": "Supervisor(s)", "author_orcid": "Author ORCID", "programme": "Programme",
    "date_issued": "Full date issued", "msc": "MSC 2020 subject codes", "title_fr": "French title",
    "abstract_fr": "French abstract",
}


def completeness(meta: ThesisMetadata) -> dict[str, Any]:
    present = {
        **{k: bool(getattr(meta, k, None)) for k in REQUIRED if k != "publication_year"},
        "publication_year": bool(meta.publication_year),
        **{k: bool(getattr(meta, k, None)) for k in RECOMMENDED if k != "author_orcid"},
        "author_orcid": bool(meta.authors) and all(a.orcid for a in meta.authors),
    }
    missing_required = [label for k, label in REQUIRED.items() if not present[k]]
    missing_recommended = [label for k, label in RECOMMENDED.items() if not present[k]]
    total = len(REQUIRED) + len(RECOMMENDED)
    return {
        "score": round(100 * (total - len(missing_required) - len(missing_recommended)) / total),
        "required_score": round(100 * (len(REQUIRED) - len(missing_required)) / len(REQUIRED)),
        "missing_required": missing_required,
        "missing_recommended": missing_recommended,
        "doi_ready": not missing_required,
    }


def from_node(node: dict[str, Any]) -> ThesisMetadata:
    """The full record for a graph node: stored metadata over the node's summary fields."""
    stored = json.loads(node.get("meta") or "{}")
    base: dict[str, Any] = {
        "id": node["id"], "title": node.get("title") or node["id"], "abstract": node.get("abstract"),
        "year": node.get("year") or None, "keywords": node.get("concepts") or [],
        "doi": node.get("doi"), "doi_state": node.get("doi_state"),
    }
    centre = resolve(node.get("campus"))
    if centre:
        base["centre"] = centre.slug
    if node.get("author") and node["author"] != "unknown":
        base["authors"] = [Person.parse(node["author"]).model_dump()]
    return ThesisMetadata.model_validate({**base, **stored})


def node_fields(meta: ThesisMetadata) -> dict[str, Any]:
    """Graph properties to write back: flat summaries plus the full JSON."""
    return {
        "title": meta.title, "abstract": meta.abstract, "year": meta.publication_year,
        "campus": meta.centre, "author": "; ".join(f"{a.given} {a.family}".strip() for a in meta.authors) or None,
        "doi": meta.doi, "doi_state": meta.doi_state,
        "meta": meta.model_dump_json(exclude={"id", "doi", "doi_state"}),
    }
