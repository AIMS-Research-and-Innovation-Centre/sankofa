"""End-to-end ingestion: PDF → events → graph → vectors."""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from ..agents.curator.agent import Curator
from ..graph.client import graph
from ..graph.embeddings.qdrant_client import vectors
from ..logging import log
from ..substrate.event_store import event_store
from ..substrate.event_types import ConceptLinked, ThesisSubmitted
from .extractors.abstract import extract_abstract
from .parsers.pdf import extract


def _thesis_id(path: Path, source_id: str | None = None) -> str:
    stable = source_id or str(path)
    return "aims-" + hashlib.sha1(stable.encode()).hexdigest()[:10]


def ingest(path: str | Path, author: str = "", campus: str = "", year: int = 0,
           source_id: str | None = None, source_url: str = "") -> str:
    # Keep the repository/auth API usable in lightweight deployments. The
    # sentence-transformers model is only needed when ingesting/searching.
    from ..graph.embeddings.encoder import encode_one

    path = Path(path)
    parsed = extract(path)
    abstract = extract_abstract(parsed["text"])
    tid = _thesis_id(path, source_id)

    event_store().append(ThesisSubmitted(
        actor=author or "system",
        payload={"thesis_id": tid, "title": parsed["title"], "author": author,
                 "campus": campus, "year": year, "abstract": abstract,
                 "source_id": source_id or "", "source_url": source_url},
    ))

    g = graph()
    g.upsert_thesis(id=tid, title=parsed["title"], abstract=abstract,
                    year=year, campus=campus, author=author or "unknown",
                    file_path=source_url or str(path), source_id=source_id or "")

    concepts = Curator().extract_concepts(abstract + "\n" + parsed["text"][:4000])
    g.clear_concepts(tid)
    for c in concepts:
        g.link_concept(tid, c)
        event_store().append(ConceptLinked(
            payload={"thesis_id": tid, "concept_id": c.lower()}))

    vectors().upsert(tid, encode_one(abstract or parsed["title"]),
                     payload={"title": parsed["title"], "year": year, "campus": campus})

    log.info("ingestion.complete", thesis_id=tid, concepts=len(concepts))
    return tid


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m sankofa.ingestion.pipeline <pdf>")
        sys.exit(1)
    print("Ingested:", ingest(sys.argv[1]))
