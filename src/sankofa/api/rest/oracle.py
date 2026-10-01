from fastapi import APIRouter
from pydantic import BaseModel
from ...agents.oracle.agent import Oracle

router = APIRouter()


class OracleIn(BaseModel):
    topic: str
    top_k: int = 5


@router.post("/propose")
def propose(body: OracleIn) -> list[dict]:
    return Oracle().propose(body.topic, top_k=body.top_k)
