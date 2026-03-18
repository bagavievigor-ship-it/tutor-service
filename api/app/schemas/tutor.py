from typing import List, Optional
from pydantic import BaseModel, Field


class TutorUpsertIn(BaseModel):
    display_name: str = Field(min_length=2, max_length=128)
    bio: str = Field(min_length=10, max_length=5000)

    subjects: List[str] = Field(default_factory=list)
    levels: List[str] = Field(default_factory=list)
    formats: List[str] = Field(default_factory=list)

    city: Optional[str] = Field(default=None, max_length=128)
    price_from: Optional[int] = None
    price_to: Optional[int] = None

    is_listed: bool = False

    seo_title: Optional[str] = Field(default=None, max_length=256)
    seo_description: Optional[str] = Field(default=None, max_length=512)

    telegram_contact: str = Field(min_length=2, max_length=128)
    vk_contact: Optional[str] = Field(default=None, max_length=255)


class TutorOut(BaseModel):
    id: int
    user_id: int
    display_name: str
    bio: str
    subjects: List[str]
    levels: List[str]
    formats: List[str]
    city: Optional[str]
    price_from: Optional[int]
    price_to: Optional[int]
    is_listed: bool
    slug: str
    seo_title: Optional[str]
    seo_description: Optional[str]

    telegram_contact: Optional[str] = None
    vk_contact: Optional[str] = None

    # Public user info (from Telegram)
    username: Optional[str] = None
    photo_url: Optional[str] = None

    class Config:
        from_attributes = True
