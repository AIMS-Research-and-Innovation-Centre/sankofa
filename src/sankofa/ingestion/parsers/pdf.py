"""PDF → text + metadata via PyMuPDF."""
from pathlib import Path
import fitz  # PyMuPDF
from ...logging import log


def extract(path: str | Path) -> dict:
    doc = fitz.open(str(path))
    pages = [p.get_text() for p in doc]
    meta = doc.metadata or {}
    text = "\n".join(pages)
    log.info("pdf.parsed", path=str(path), pages=len(pages), chars=len(text))
    return {
        "title": meta.get("title") or Path(path).stem,
        "author": meta.get("author") or "",
        "text": text,
        "pages": len(pages),
    }
