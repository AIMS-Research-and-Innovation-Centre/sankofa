"""Notebook — grounded answers across a chosen set of theses.

Every claim cites its source as [n], where n is the 1-based position of the
thesis in the request. With no model available the answer is extractive:
the abstract sentences that best match the question, each cited.
"""
from __future__ import annotations
import re
from ...graph.client import graph
from ..interlocutor.agent import complete

SYSTEM = """You answer questions about AIMS theses using ONLY the numbered sources.
Cite every claim with its source number in square brackets, e.g. [1] or [2][3].
If the sources do not answer the question, say so plainly. Never invent
findings, methods, numbers or citations. Use British English."""

_WORD = re.compile(r"[a-z0-9]+")
_STOP = frozenset("""a an and are as at be by do does for from has have how in is it its of on or
that the their this to was were what which who why with use uses used about any""".split())


def _terms(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 1}


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text or "") if s.strip()]


def extract(question: str, sources: list[dict], limit: int = 4) -> str:
    """Rank abstract sentences by overlap with the question and cite them."""
    wanted = _terms(question)
    scored = []
    for n, src in enumerate(sources, 1):
        for i, sentence in enumerate(_sentences(src.get("abstract") or "")):
            overlap = len(wanted & _terms(sentence))
            # Prefer matching sentences; break ties by position (opening sentences summarise).
            scored.append((overlap, -i, n, sentence))
    scored.sort(reverse=True)
    picked = [s for s in scored if s[0] > 0][:limit] or scored[:min(limit, len(sources))]
    if not picked:
        return "The selected sources have no recorded abstracts to answer from."
    return " ".join(f"{sentence} [{n}]" for _, _, n, sentence in picked)


class Notebook:
    name = "notebook"

    def sources(self, thesis_ids: list[str]) -> list[dict]:
        rows = graph().run(
            """UNWIND range(0, size($ids) - 1) AS i
            MATCH (t:Thesis {id: $ids[i]})
            OPTIONAL MATCH (s:Student)-[:AUTHORED]->(t)
            RETURN i, t.id AS id, t.title AS title, t.abstract AS abstract,
                   t.year AS year, t.campus AS campus, coalesce(t.author, s.id) AS author
            ORDER BY i""",
            ids=thesis_ids,
        )
        return [{k: v for k, v in r.items() if k != "i"} for r in rows]

    def ask(self, thesis_ids: list[str], question: str) -> dict:
        sources = self.sources(thesis_ids)
        if not sources:
            return {"question": question, "answer": "None of the selected theses were found.",
                    "sources": [], "mode": "none"}
        context = "\n\n".join(
            f"[{n}] {s['title']} ({s.get('author') or 'author not recorded'}, {s.get('year') or 'n.d.'})\n"
            f"{s.get('abstract') or 'No abstract recorded.'}"
            for n, s in enumerate(sources, 1)
        )
        answer = complete(SYSTEM, f"SOURCES:\n{context}\n\nQUESTION: {question}")
        mode = "model"
        if answer:
            answer = re.sub(r"<think>.*?</think>", "", answer, flags=re.S).strip()
        if not answer:
            answer, mode = extract(question, sources), "extractive"
        return {"question": question, "answer": answer, "mode": mode,
                "sources": [{"n": n, "id": s["id"], "title": s["title"]}
                            for n, s in enumerate(sources, 1)]}
