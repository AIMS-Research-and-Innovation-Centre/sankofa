"""End-to-end ingestion: PDF → events → graph → vectors."""
from __future__ import annotations
import hashlib
import sys
from pathlib import Path
from ..substrate.event_store import event_store
from ..substrate.event_types import ThesisSubmitted, ConceptLinked
from ..graph.client import graph
from ..graph.embeddings.encoder import encode_one
from ..graph.embeddings.qdrant_client import vectors
from .parsers.pdf import extract
from .extractors.abstract import extract_abstract
from ..agents.curator.agent import Curator
from ..logging import log


def _thesis_id(path: Path) -> str:
    return "aims-" + hashlib.sha1(str(path).encode()).hexdigest()[:10]


def ingest(path: str | Path, author: str = "", campus: str = "", year: int = 0) -> str:
    path = Path(path)
    parsed = extract(path)
    abstract = extract_abstract(parsed["text"])
    tid = _thesis_id(path)

    event_store().append(ThesisSubmitted(
        actor=author or "system",
        payload=dict(thesis_id=tid, title=parsed["title"], author=author,
                     campus=campus, year=year, abstract=abstract),
    ))

    g = graph()
    g.upsert_thesis(id=tid, title=parsed["title"], abstract=abstract,
                    year=year, campus=campus, author=author or "unknown",
                    file_path=str(path))

    concepts = Curator().extract_concepts(abstract + "\n" + parsed["text"][:4000])
    for c in concepts:
        g.link_concept(tid, c)
        event_store().append(ConceptLinked(
            payload=dict(thesis_id=tid, concept_id=c.lower())))

    vectors().upsert(tid, encode_one(abstract or parsed["title"]),
                     payload={"title": parsed["title"], "year": year, "campus": campus})

    log.info("ingestion.complete", thesis_id=tid, concepts=len(concepts))
    return tid


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m sankofa.ingestion.pipeline <pdf>")
        sys.exit(1)
    print("Ingested:", ingest(sys.argv[1]))
