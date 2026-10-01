from fastapi import APIRouter

router = APIRouter()

_REGISTRY = [
    {"name": "curator", "description": "Extracts concepts.", "status": "live"},
    {"name": "interlocutor", "description": "Thesis Whisperer.", "status": "live"},
    {"name": "oracle", "description": "Proposes unwritten theses.", "status": "live"},
    {"name": "dreamer", "description": "Dreams nightly.", "status": "live"},
]


@router.get("/")
def list_agents() -> list[dict]:
    return _REGISTRY
