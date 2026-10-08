"""Bulk metadata import from the roadmap's CSV template (Section 11.2).

Columns: id (optional), title, title_fr, author, advisor, date_issued, abstract,
abstract_fr, subject, msc, type, language, doi, licence, centre, programme,
cohort. Multi-valued cells use the DSpace separator "||". Rows are validated
one by one; a bad row is reported and skipped, never half-imported.
"""
from __future__ import annotations
import csv
import re
from collections.abc import Iterable
from pathlib import Path
from typing import Any
from pydantic import ValidationError
from .centres import resolve
from .metadata import LICENCES, Person, ThesisMetadata

SEP = "||"


def _many(cell: str | None) -> list[str]:
    return [v.strip() for v in (cell or "").split(SEP) if v.strip()]


def _licence(cell: str) -> str | None:
    cell = cell.strip()
    if not cell:
        return None
    if cell in LICENCES:
        return cell
    for key, (name, uri) in LICENCES.items():
        if cell.lower() in {name.lower(), (uri or "").lower(), (uri or "").lower().rstrip("/")}:
            return key
    raise ValueError(f"unknown licence {cell!r}")


def derive_id(row: dict[str, str]) -> str:
    """Centre_year_surname_shorttitle, as the roadmap names files."""
    centre = resolve(row.get("centre"))
    year = (row.get("date_issued") or row.get("cohort") or "")[:4]
    surname = Person.parse(_many(row.get("author"))[0]).family if _many(row.get("author")) else "anon"
    short = "-".join(re.findall(r"[a-z0-9]+", (row.get("title") or "").lower())[:4])
    return re.sub(r"-+", "-", f"aims-{year}-{centre.slug if centre else 'x'}-{surname.lower()}-{short}").strip("-")


def parse_row(row: dict[str, str]) -> ThesisMetadata:
    row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
    date = row.get("date_issued") or None
    year = int(date[:4]) if date and date[:4].isdigit() else int(row["cohort"]) if row.get("cohort", "").isdigit() else None
    data: dict[str, Any] = {
        "id": row.get("id") or derive_id(row),
        "title": row.get("title", ""), "title_fr": row.get("title_fr") or None,
        "authors": [Person.parse(a) for a in _many(row.get("author"))],
        "supervisors": [Person.parse(a) for a in _many(row.get("advisor"))],
        "abstract": row.get("abstract") or None, "abstract_fr": row.get("abstract_fr") or None,
        "keywords": _many(row.get("subject")), "msc": _many(row.get("msc")),
        "year": year, "date_issued": date, "centre": row.get("centre") or None,
        "programme": row.get("programme") or None, "language": row.get("language") or "en",
        "licence": _licence(row.get("licence", "")),
    }
    if row.get("doi"):
        # A DOI already minted elsewhere is recorded as registered.
        data |= {"doi": row["doi"], "doi_state": "findable"}
    if row.get("type") and "phd" in row["type"].lower():
        data["degree"], data["programme"] = "Doctor of Philosophy", data["programme"] or "PhD"
    return ThesisMetadata.model_validate(data)


def read(path: Path | str) -> tuple[list[ThesisMetadata], list[str]]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        return parse_rows(csv.DictReader(f))


def parse_rows(rows: Iterable[dict[str, str]]) -> tuple[list[ThesisMetadata], list[str]]:
    records, errors = [], []
    for line, row in enumerate(rows, start=2):  # line 1 is the header
        try:
            records.append(parse_row(row))
        except (ValidationError, ValueError, IndexError) as e:
            detail = e.errors()[0] if isinstance(e, ValidationError) else None
            message = f"{'.'.join(map(str, detail['loc']))}: {detail['msg']}" if detail else str(e)
            errors.append(f"row {line}: {message}")
    return records, errors
