from fastapi import APIRouter
from ...agents.dreamer.agent import Dreamer
from ...agents.dreamer.dream_archive import recent

router = APIRouter()


@router.get("/recent")
def recent_dreams(limit: int = 10) -> list[dict]:
    return recent(limit=limit)


@router.post("/dream-now")
def dream_now() -> dict:
    return Dreamer().dream(steps=6)
