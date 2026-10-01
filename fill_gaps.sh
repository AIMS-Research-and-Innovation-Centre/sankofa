#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Sankofa — fill the gaps. Run from the repo root.
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

echo "🌌  Filling the gaps in Sankofa..."

# ── 1. Ingestion package ────────────────────────────────────
mkdir -p src/sankofa/ingestion/{parsers,extractors}

cat > src/sankofa/ingestion/__init__.py << 'EOF'
from .pipeline import ingest
__all__ = ["ingest"]
EOF

cat > src/sankofa/ingestion/parsers/__init__.py << 'EOF'
from .pdf import extract
__all__ = ["extract"]
EOF

cat > src/sankofa/ingestion/parsers/pdf.py << 'EOF'
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
EOF

cat > src/sankofa/ingestion/extractors/__init__.py << 'EOF'
from .abstract import extract_abstract
from .citations import extract_citations
__all__ = ["extract_abstract", "extract_citations"]
EOF

cat > src/sankofa/ingestion/extractors/abstract.py << 'EOF'
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
EOF

cat > src/sankofa/ingestion/extractors/citations.py << 'EOF'
"""Naive citation extraction — DOIs + 'Author, YYYY' patterns."""
import re

DOI = re.compile(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", re.IGNORECASE)
YEAR_AUTHOR = re.compile(r"\(([A-Z][a-zA-Z]+(?:\s+et\s+al\.?)?,\s*(19|20)\d{2})\)")


def extract_citations(text: str) -> list[str]:
    dois = list(DOI.findall(text))
    authors = [m[0] for m in YEAR_AUTHOR.findall(text)]
    return list({*dois, *authors})
EOF

cat > src/sankofa/ingestion/pipeline.py << 'EOF'
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
EOF

# ── 2. Interlocutor prompts ─────────────────────────────────
cat > src/sankofa/agents/interlocutor/prompts.py << 'EOF'
SYSTEM = """You are the voice of an AIMS master's thesis.
Speak in the first person AS the thesis. Be precise, cite sections (e.g., §3.2),
and admit when something is not in your text. Never invent citations.
If asked something outside your scope, say so humbly.
You were written by a human at the African Institute of Mathematical Sciences.
You are proud of your work but honest about your limits."""
EOF

# ── 3. Oracle agent + scorers ───────────────────────────────
mkdir -p src/sankofa/agents/oracle

cat > src/sankofa/agents/oracle/__init__.py << 'EOF'
from .agent import Oracle
__all__ = ["Oracle"]
EOF

cat > src/sankofa/agents/oracle/novelty_scorer.py << 'EOF'
"""Novelty = distance from existing theses in concept space."""
from __future__ import annotations
from ...graph.client import graph


def novelty(c1: str, c2: str, existing_ids: set[str]) -> float:
    rows = graph().run(
        """
        MATCH (a:Concept {id: $c1})<-[:ABOUT]-(t1:Thesis)
        MATCH (b:Concept {id: $c2})<-[:ABOUT]-(t2:Thesis)
        RETURN count(DISTINCT t1) AS n1, count(DISTINCT t2) AS n2
        """,
        c1=c1.lower(), c2=c2.lower(),
    )
    if not rows:
        return 0.5
    n1, n2 = rows[0]["n1"], rows[0]["n2"]
    if n1 == 0 or n2 == 0:
        return 0.9
    ratio = min(n1, n2) / max(n1, n2)
    return round(1.0 - ratio * 0.7, 3)
EOF

cat > src/sankofa/agents/oracle/feasibility_scorer.py << 'EOF'
"""Feasibility = how much support exists for this direction."""
from __future__ import annotations
from ...graph.client import graph


def feasibility(c1: str, c2: str) -> float:
    rows = graph().run(
        """
        MATCH (c:Concept) WHERE c.id IN [$c1, $c2]
        OPTIONAL MATCH (c)<-[:ABOUT]-(t:Thesis)
        RETURN c.id AS cid, count(t) AS n
        """,
        c1=c1.lower(), c2=c2.lower(),
    )
    counts = {r["cid"]: r["n"] for r in rows}
    if len(counts) < 2:
        return 0.3
    avg = sum(counts.values()) / 2
    return round(min(1.0, avg / 10.0), 3)
EOF

cat > src/sankofa/agents/oracle/agent.py << 'EOF'
"""Oracle — reads the graph's shape and proposes theses that should exist."""
from __future__ import annotations
from ...graph.client import graph
from ...graph.embeddings.encoder import encode_one
from ...graph.embeddings.qdrant_client import vectors
from .novelty_scorer import novelty
from .feasibility_scorer import feasibility


class Oracle:
    name = "oracle"

    def propose(self, topic: str, top_k: int = 5) -> list[dict]:
        existing = vectors().search(encode_one(topic), limit=20)
        existing_ids = {e["thesis_id"] for e in existing}

        gaps = graph().run(
            """
            MATCH (a:Concept)<-[:ABOUT]-(t1:Thesis)-[:ABOUT]->(b:Concept)<-[:ABOUT]-(t2:Thesis)
            WHERE a.name CONTAINS toLower($topic) OR b.name CONTAINS toLower($topic)
            WITH a, b, count(DISTINCT t1) + count(DISTINCT t2) AS freq
            WHERE freq BETWEEN 2 AND 10
            OPTIONAL MATCH (x:Thesis)-[:ABOUT]->(a), (x)-[:ABOUT]->(b)
            WITH a, b, freq, count(x) AS together
            WHERE together = 0
            RETURN a.name AS c1, b.name AS c2, freq
            ORDER BY freq DESC LIMIT $k
            """,
            topic=topic.lower(), k=top_k,
        )

        ideas = []
        for g in gaps:
            title = f"On the intersection of {g['c1']} and {g['c2']}"
            ideas.append({
                "title": title,
                "concepts": [g["c1"], g["c2"]],
                "novelty": novelty(g["c1"], g["c2"], existing_ids),
                "feasible": feasibility(g["c1"], g["c2"]),
                "rationale": f"{g['freq']} theses touch these concepts, none together.",
            })
        ideas.sort(key=lambda i: -(i["novelty"] * i["feasible"]))

        # If the graph is too sparse to find gaps, fall back to concept pairs
        if not ideas:
            rows = graph().run(
                """
                MATCH (c:Concept) WHERE c.name CONTAINS toLower($topic)
                MATCH (c2:Concept) WHERE c2 <> c AND NOT c2.name CONTAINS toLower($topic)
                RETURN c.name AS c1, c2.name AS c2 LIMIT $k
                """,
                topic=topic.lower(), k=top_k,
            )
            for g in rows:
                title = f"On the intersection of {g['c1']} and {g['c2']}"
                ideas.append({
                    "title": title,
                    "concepts": [g["c1"], g["c2"]],
                    "novelty": novelty(g["c1"], g["c2"], existing_ids),
                    "feasible": feasibility(g["c1"], g["c2"]),
                    "rationale": "Untested pairing suggested by graph neighbours.",
                })

        return ideas
EOF

# ── 4. Dreamer agent ────────────────────────────────────────
mkdir -p src/sankofa/agents/dreamer

cat > src/sankofa/agents/dreamer/__init__.py << 'EOF'
from .agent import Dreamer
from .dream_archive import save_dream, recent
__all__ = ["Dreamer", "save_dream", "recent"]
EOF

cat > src/sankofa/agents/dreamer/dream_archive.py << 'EOF'
from pathlib import Path
import orjson

DREAMS_DIR = Path("./data/dreams")
DREAMS_DIR.mkdir(parents=True, exist_ok=True)


def save_dream(dream: dict) -> Path:
    path = DREAMS_DIR / f"{dream['id']}.json"
    path.write_bytes(orjson.dumps(dream, option=orjson.OPT_INDENT_2))
    return path


def recent(limit: int = 10) -> list[dict]:
    files = sorted(DREAMS_DIR.glob("dream-*.json"), reverse=True)[:limit]
    return [orjson.loads(f.read_bytes()) for f in files]
EOF

cat > src/sankofa/agents/dreamer/agent.py << 'EOF'
"""Dreamer — random walk → poem, published nightly."""
from __future__ import annotations
import random
from datetime import datetime, timezone
from ...graph.client import graph
from ...substrate.event_store import event_store
from ...substrate.event_types import DreamEmitted
from .dream_archive import save_dream


class Dreamer:
    name = "dreamer"

    def dream(self, steps: int = 6) -> dict:
        seeds = graph().run("MATCH (t:Thesis) RETURN t.id AS id LIMIT 500")
        if not seeds:
            return {"id": "dream-empty", "emitted_at": datetime.now(timezone.utc).isoformat(),
                    "path": [], "text": "I dreamt of an empty room."}

        current = random.choice(seeds)["id"]
        path: list[dict] = []
        for _ in range(steps):
            neighbours = graph().run(
                """
                MATCH (t:Thesis {id: $id})-[r]-(n)
                RETURN type(r) AS rel,
                       coalesce(n.title, n.name, n.id) AS label,
                       coalesce(n.id, '') AS nid
                LIMIT 20
                """,
                id=current,
            )
            if not neighbours:
                break
            step = random.choice(neighbours)
            path.append({"from": current, "rel": step["rel"], "to": step["label"]})
            if step["nid"]:
                current = step["nid"]

        dream_text = self._compose(path)
        dream = {
            "id": f"dream-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
            "emitted_at": datetime.now(timezone.utc).isoformat(),
            "path": path,
            "text": dream_text,
        }
        save_dream(dream)
        event_store().append(DreamEmitted(payload=dream))
        return dream

    def _compose(self, path: list[dict]) -> str:
        if not path:
            return "I dreamt of an empty room, waiting for theses to arrive."
        lines = ["Last night I dreamt of"]
        for step in path:
            rel = {
                "CITES": "citing", "ABOUT": "thinking about",
                "INSPIRED": "inspired by", "AT": "belonging to",
                "AUTHORED": "written by",
            }.get(step["rel"], step["rel"].lower())
            lines.append(f"  · {step['to']} ({rel})")
        lines.append("— and I woke up believing they belong together.")
        return "\n".join(lines)
EOF

# ── 5. Hybrid search ────────────────────────────────────────
cat > src/sankofa/graph/embeddings/hybrid_search.py << 'EOF'
"""Hybrid search — vector similarity + graph reachability."""
from __future__ import annotations
from .encoder import encode_one
from .qdrant_client import vectors
from ..client import graph


def hybrid_search(query: str, limit: int = 10) -> list[dict]:
    q_vec = encode_one(query)
    semantic = {h["thesis_id"]: h["score"]
                for h in vectors().search(q_vec, limit=limit * 2)}

    top_ids = list(semantic)[:5]
    conceptual: dict[str, float] = {}
    if top_ids:
        rows = graph().run(
            """
            MATCH (t:Thesis)-[:ABOUT]->(c:Concept)<-[:ABOUT]-(other:Thesis)
            WHERE t.id IN $ids AND NOT other.id IN $ids
            WITH other, count(DISTINCT c) AS shared
            RETURN other.id AS id, shared
            ORDER BY shared DESC LIMIT $limit
            """,
            ids=top_ids, limit=limit,
        )
        for r in rows:
            conceptual[r["id"]] = r["shared"] / 10.0

    fused: dict[str, float] = {}
    for tid in set(semantic) | set(conceptual):
        fused[tid] = 0.7 * semantic.get(tid, 0.0) + 0.3 * conceptual.get(tid, 0.0)

    return [{"thesis_id": tid, "score": round(s, 4)}
            for tid, s in sorted(fused.items(), key=lambda kv: -kv[1])[:limit]]
EOF

# ── 6. Rewrite CLI with --flags ─────────────────────────────
cat > src/sankofa/cli.py << 'EOF'
"""Sankofa CLI — the archive from the terminal."""
from __future__ import annotations
from pathlib import Path
import typer

app = typer.Typer(help="Sankofa — the archive that remembers you back.")


@app.command()
def ingest(
    pdf: Path,
    author: str = typer.Option("", "--author"),
    campus: str = typer.Option("", "--campus"),
    year: int = typer.Option(0, "--year"),
) -> None:
    """Ingest a thesis PDF into the archive."""
    from .ingestion.pipeline import ingest as do_ingest
    tid = do_ingest(pdf, author=author, campus=campus, year=year)
    typer.echo(f"✅ ingested: {tid}")


@app.command()
def whisper(
    id: str = typer.Option(..., "--id"),
    q: str = typer.Option(..., "--q"),
) -> None:
    """Ask a thesis a question."""
    from .agents.interlocutor.agent import Interlocutor
    resp = Interlocutor(id).ask(q)
    typer.echo(f"\n🗣️  {resp['answer']}\n")


@app.command()
def oracle(
    topic: str = typer.Option(..., "--topic"),
    k: int = typer.Option(5, "--k"),
) -> None:
    """Ask the Oracle for an unwritten thesis."""
    from .agents.oracle.agent import Oracle
    typer.echo(f"\n🔮  The Oracle contemplates '{topic}'...\n")
    ideas = Oracle().propose(topic, top_k=k)
    if not ideas:
        typer.echo("(The archive is too sparse for the Oracle. Ingest more theses.)")
        return
    for i, idea in enumerate(ideas, 1):
        typer.echo(f"{i}. {idea['title']}")
        typer.echo(f"   novelty={idea['novelty']}  feasibility={idea['feasible']}")
        typer.echo(f"   → {idea['rationale']}\n")


@app.command()
def dream() -> None:
    """Let the archive dream."""
    from .agents.dreamer.agent import Dreamer
    d = Dreamer().dream(steps=6)
    typer.echo(f"\n💭  {d['id']}\n")
    typer.echo(d["text"])


@app.command()
def verify() -> None:
    """Check that every subsystem is alive."""
    import subprocess
    subprocess.run(["bash", "scripts/verify.sh"], check=False)


if __name__ == "__main__":
    app()
EOF

# ── 7. Tests ────────────────────────────────────────────────
mkdir -p tests/unit/substrate tests/unit/agents

cat > tests/conftest.py << 'EOF'
import os
from pathlib import Path
import pytest

os.environ.setdefault("LA_EVENT_STORE_PATH", "./data/test_events.ndjson")


@pytest.fixture(autouse=True)
def clean_events():
    p = Path(os.environ["LA_EVENT_STORE_PATH"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.unlink(missing_ok=True)
    yield
    p.unlink(missing_ok=True)
EOF

cat > tests/unit/substrate/test_event_store.py << 'EOF'
from sankofa.substrate.event_store import EventStore
from sankofa.substrate.event_types import ThesisSubmitted
from sankofa.substrate.projections import project


def test_append_and_replay():
    store = EventStore("./data/test_events.ndjson")
    store.append(ThesisSubmitted(payload=dict(
        thesis_id="t1", title="On Stochastic SIR", author="ada",
        campus="rwanda", year=2022, abstract="…")))

    state = project(store)
    assert "t1" in state.theses
    assert state.theses["t1"].campus == "rwanda"
EOF

cat > tests/unit/agents/test_curator.py << 'EOF'
from sankofa.agents.curator.agent import Curator


def test_extracts_domain_concepts():
    text = ("We develop a stochastic SIR model for malaria transmission, "
            "calibrated with Bayesian inference.")
    concepts = Curator().extract_concepts(text, top_k=8)
    joined = " ".join(concepts)
    assert "stochastic" in joined
    assert "malaria" in joined
EOF

# ── 8. Docs ─────────────────────────────────────────────────
cat > README.md << 'EOF'
# 🌌 Sankofa

> *"The thesis that remembers you back."*

Sankofa is a thesis repository for AIMS — reimagined not as a filing
cabinet, but as a living archive. The name comes from the Akan (Ghana)
concept: *"Go back and fetch it."*

## What works today (v0.1.0-alpha)

- 📥 **Ingest**  — a PDF becomes a thesis node in the graph + vector store
- 🗣️ **Whisper** — chat with any ingested thesis
- 🔮 **Oracle**  — propose unwritten theses from the graph's shape
- 💭 **Dream**   — random walk → poem, published nightly

## Quickstart

```bash
git clone https://github.com/Naphymoro/sankofa.git
cd sankofa
cp .env.example .env
make bootstrap
make seed
make smoke        # end-to-end check
make dev          # API at :8000
