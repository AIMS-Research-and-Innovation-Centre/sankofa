"""Local embeddings — no data leaves the campus."""
from functools import lru_cache
from sentence_transformers import SentenceTransformer
from ...config import settings


@lru_cache
def _model() -> SentenceTransformer:
    return SentenceTransformer(settings().embedding_model)


def encode(texts: list[str]) -> list[list[float]]:
    return _model().encode(texts, normalize_embeddings=True).tolist()


def encode_one(text: str) -> list[float]:
    return encode([text])[0]
