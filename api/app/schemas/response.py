from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ResponseCreateIn(BaseModel):
    message: str = Field(min_length=3, max_length=4000)


class ResponseUserOut(BaseModel):
    id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    photo_url: Optional[str] = None

    class Config:
        from_attributes = True


class ResponseTutorOut(BaseModel):
    tutor_id: int
    user_id: int
    display_name: str
    slug: str

    telegram_contact: Optional[str] = None

    class Config:
        from_attributes = True


class ResponseOut(BaseModel):
    id: int
    request_id: int
    from_user_id: int
    message: str
    status: str
    created_at: datetime

    # новое: минимум профиля автора отклика
    user: Optional[ResponseUserOut] = None

    # новое: минимум анкеты репетитора (если есть)
    tutor: Optional[ResponseTutorOut] = None

    class Config:
        from_attributes = True
