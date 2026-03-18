from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RequestCreateIn(BaseModel):
    request_kind: str = Field(pattern="^(student|broker)$")

    subject: str = Field(min_length=2, max_length=255)
    level: str = Field(min_length=1, max_length=255)
    format: str = Field(pattern="^(online|offline|mixed)$")

    city: Optional[str] = Field(default=None, max_length=128)
    budget_text: Optional[str] = Field(default=None, max_length=255)
    schedule_text: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=20000)

    turbo_enabled: bool = False

    commission_type: Optional[str] = Field(default=None)  # fixed/lessons
    commission_value: Optional[int] = Field(default=None)
    currency: Optional[str] = Field(default=None)  # RUB/KZT

    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = Field(default=None, max_length=255)


class AssignedUserOut(BaseModel):
    id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    photo_url: Optional[str] = None

    class Config:
        from_attributes = True


class RequestOut(BaseModel):
    id: int
    author_user_id: int

    request_kind: str
    subject: str
    level: str
    format: str

    city: Optional[str]
    budget_text: Optional[str]
    schedule_text: Optional[str]
    description: Optional[str]

    commission_type: Optional[str]
    commission_value: Optional[int]
    currency: Optional[str]

    turbo_enabled: bool
    turbo_status: Optional[str]
    turbo_sent_at: Optional[datetime]

    slug: str
    seo_title: Optional[str]
    seo_description: Optional[str]

    status: str

    # Admin (user_id=1) can hide requests from public / non-admin lists.
    admin_hidden: bool = False

    # ✅ новое: количество откликов
    responses_count: int = 0

    assigned_user_id: Optional[int]
    assigned_at: Optional[datetime]

    # ✅ новое: данные назначенного исполнителя (если назначен)
    assigned_user: Optional[AssignedUserOut] = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
