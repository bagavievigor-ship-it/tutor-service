from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class OfferCreateIn(BaseModel):
    request_id: int = Field(ge=1)
    to_tutor_user_id: int = Field(ge=1)
    message: Optional[str] = Field(default=None, max_length=5000)


class OfferOut(BaseModel):
    id: int
    request_id: int
    to_tutor_user_id: int
    message: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
