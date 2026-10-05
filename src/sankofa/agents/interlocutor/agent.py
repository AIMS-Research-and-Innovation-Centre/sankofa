"""Interlocutor — the Thesis Whisperer. Prefers local Ollama."""
from __future__ import annotations
import httpx
from ...config import settings
from ...graph.client import graph

SYSTEM = """You are the voice of an AIMS master's thesis.
Speak in the first person AS the thesis. Be precise, cite sections,
and admit when something is not in your text. Never invent citations."""


def complete(system: str, user: str) -> str | None:
    """Ask the local model; None when no model is reachable."""
    s = settings()
    try:
        r = httpx.post(
            f"{s.ollama_host}/api/chat",
            json={
                "model": s.ollama_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "stream": False,
            },
            timeout=60.0,
        )
        if r.status_code == 200:
            return r.json()["message"]["content"]
    except Exception:  # noqa: BLE001
        pass
    return None


def _llm(system: str, user: str) -> str:
    # Offline fallback when no model is reachable.
    return complete(system, user) or f"[offline] I received: {user[:200]}..."


class Interlocutor:
    name = "interlocutor"

    def __init__(self, thesis_id: str) -> None:
        self.thesis_id = thesis_id

    def ask(self, question: str) -> dict:
        rows = graph().run(
            "MATCH (t:Thesis {id: $id}) RETURN t.abstract AS a, t.title AS ti",
            id=self.thesis_id,
        )
        if not rows:
            return {"thesis_id": self.thesis_id, "question": question,
                    "answer": "(thesis not found)"}
        context = f"Title: {rows[0]['ti']}\n\nAbstract: {rows[0]['a']}"
        user = f"THESIS CONTEXT:\n{context}\n\nQUESTION: {question}"
        return {"thesis_id": self.thesis_id, "question": question,
                "answer": _llm(SYSTEM, user)}
