from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    user_id: int
    type: str
    entity_id: Optional[int]
    title: str
    body: Optional[str]
    is_read: int
    telegram_sent_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
