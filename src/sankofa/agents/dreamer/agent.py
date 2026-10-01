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
