"""Cheap abstract extraction — first block after 'Abstract'."""
import re

_PATTERN = re.compile(
    r"abstract\b[:\-\s]*(.{100,2000}?)(?:\n\s*\n|keywords|introduction)",
    re.IGNORECASE | re.DOTALL,
)


def extract_abstract(text: str) -> str:
    m = _PATTERN.search(text)
    if m:
        return " ".join(m.group(1).split())
    return " ".join(text[:800].split())
