from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class UserOut(BaseModel):
    id: int
    telegram_id: Optional[int] = None
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    photo_url: Optional[str] = None

    # Might be NULL for legacy rows until migration runs; keep Optional to avoid response crashes.
    created_at: Optional[datetime] = None

    tg_chat_id: Optional[int] = None
    tg_notify_enabled: Optional[bool] = None

    class Config:
        from_attributes = True
