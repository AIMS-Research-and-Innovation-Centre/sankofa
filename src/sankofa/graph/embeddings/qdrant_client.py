"""Qdrant — vector memory."""
from __future__ import annotations

import uuid

from qdrant_client import QdrantClient as _Q
from qdrant_client.models import Distance, PointIdsList, PointStruct, VectorParams

from ...config import settings

VECTOR_SIZE = 384


class VectorStore:
    def __init__(self) -> None:
        s = settings()
        self.client = _Q(url=s.qdrant_url)
        self.collection = s.qdrant_collection
        self._ensure()

    def _ensure(self) -> None:
        existing = {c.name for c in self.client.get_collections().collections}
        if self.collection not in existing:
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )

    def upsert(self, thesis_id: str, vector: list[float], payload: dict) -> None:
        self.client.upsert(
            collection_name=self.collection,
            points=[PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_URL, thesis_id)),
                vector=vector, payload={"thesis_id": thesis_id, **payload},
            )],
        )

    def search(self, vector: list[float], limit: int = 10) -> list[dict]:
        hits = self.client.search(self.collection, query_vector=vector, limit=limit)
        return [{"thesis_id": h.payload.get("thesis_id"), "score": h.score} for h in hits]

    def remove(self, thesis_id: str) -> None:
        self.client.delete(
            collection_name=self.collection,
            points_selector=PointIdsList(points=[str(uuid.uuid5(uuid.NAMESPACE_URL, thesis_id))]),
        )


_store: VectorStore | None = None


def vectors() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store
