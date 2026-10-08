"""Public links back to the web interface."""
from urllib.parse import quote
from .config import settings


def record_url(thesis_id: str) -> str | None:
    s = settings()
    if not s.public_url:
        return None
    return s.record_url_template.format(base=s.public_url.rstrip("/"), id=quote(thesis_id, safe=""))
