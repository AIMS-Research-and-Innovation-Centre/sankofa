"""Optional semantic-search integrations.

The repository and authentication API can run without the local embedding
model installed.  Keep the heavyweight sentence-transformers import lazy so
lightweight deployments (including the Cloudflare API container) can start
and serve repository requests.
"""


def encode(texts: list[str]) -> list[list[float]]:
    from .encoder import encode as _encode

    return _encode(texts)


def encode_one(text: str) -> list[float]:
    from .encoder import encode_one as _encode_one

    return _encode_one(text)


def vectors():
    from .qdrant_client import vectors as _vectors

    return _vectors()


__all__ = ["encode", "encode_one", "vectors"]
