from typing import Optional
from pydantic import BaseModel


class TelegramAuthIn(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: Optional[int] = None
    hash: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class VkStartOut(BaseModel):
    authorize_url: str
    state: str


class VkFinishIn(BaseModel):
    code: str
    state: str
    device_id: Optional[str] = None
