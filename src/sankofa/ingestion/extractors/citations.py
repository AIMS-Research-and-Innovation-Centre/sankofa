"""Naive citation extraction — DOIs + 'Author, YYYY' patterns."""
import re

DOI = re.compile(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", re.IGNORECASE)
YEAR_AUTHOR = re.compile(r"\(([A-Z][a-zA-Z]+(?:\s+et\s+al\.?)?,\s*(19|20)\d{2})\)")


def extract_citations(text: str) -> list[str]:
    dois = list(DOI.findall(text))
    authors = [m[0] for m in YEAR_AUTHOR.findall(text)]
    return list({*dois, *authors})
