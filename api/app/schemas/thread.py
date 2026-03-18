from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class AssignIn(BaseModel):
    tutor_user_id: int


class ThreadOut(BaseModel):
    id: int
    request_id: int
    author_user_id: int
    tutor_user_id: int

    class Config:
        from_attributes = True


class MessageCreateIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class MessageOut(BaseModel):
    id: int
    thread_id: int
    sender_user_id: int
    text: str
    created_at: datetime

    class Config:
        from_attributes = True
