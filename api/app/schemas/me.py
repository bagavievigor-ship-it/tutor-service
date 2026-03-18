# /opt/repetitor_app_api/app/schemas/me.py

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel

from app.schemas.request import AssignedUserOut


class MyRequestOut(BaseModel):
    id: int
    author_user_id: int

    request_kind: str
    subject: str
    level: str
    format: str

    city: Optional[str] = None
    budget_text: Optional[str] = None
    schedule_text: Optional[str] = None
    description: str

    # комиссия (для заявок посредника)
    commission_type: Optional[str] = None  # fixed/lessons
    commission_value: Optional[int] = None
    currency: Optional[str] = None  # RUB/KZT

    status: str
    slug: str

    # ✅ количество откликов (для карточек в /me/requests)
    responses_count: int = 0

    # ✅ ВАЖНО: иначе фронт не видит назначение исполнителя и пишет "Чат ещё не создан..."
    assigned_user_id: Optional[int] = None
    assigned_at: Optional[datetime] = None

    # (опционально) если где-то на фронте нужно показывать карточку исполнителя
    # Внимание: это поле заполнится только если в ORM-модели Request есть relationship assigned_user.
    # Иначе будет None — это нормально.
    assigned_user: Optional[AssignedUserOut] = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MyResponseOut(BaseModel):
    id: int
    request_id: int
    from_user_id: int
    message: str
    status: str
    created_at: datetime

    request_subject: str
    request_level: str
    request_format: str
    request_city: Optional[str]
    request_status: str
    request_slug: str
    request_kind: str

    class Config:
        from_attributes = True


class MyThreadOut(BaseModel):
    # thread
    id: int
    request_id: int
    author_user_id: int
    tutor_user_id: int
    created_at: datetime

    # request summary (для списка чатов)
    request_subject: str
    request_level: str
    request_format: str
    request_city: Optional[str]
    request_status: str
    request_slug: str
    request_kind: str

    class Config:
        from_attributes = True
