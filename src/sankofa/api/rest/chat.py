from fastapi import APIRouter
from pydantic import BaseModel
from ...agents.interlocutor.agent import Interlocutor

router = APIRouter()


class ChatIn(BaseModel):
    thesis_id: str
    question: str


@router.post("/")
def chat(body: ChatIn) -> dict:
    return Interlocutor(body.thesis_id).ask(body.question)
