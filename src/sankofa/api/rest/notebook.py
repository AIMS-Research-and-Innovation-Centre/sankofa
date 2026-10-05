from fastapi import APIRouter
from pydantic import BaseModel, Field
from ...agents.notebook import Notebook

router = APIRouter()


class AskIn(BaseModel):
    thesis_ids: list[str] = Field(min_length=1, max_length=50)
    question: str = Field(min_length=1, max_length=2000)


@router.post("/ask")
def ask(body: AskIn) -> dict:
    return Notebook().ask(body.thesis_ids, body.question)
