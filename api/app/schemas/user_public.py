from typing import Optional

from pydantic import BaseModel


class UserPublicOut(BaseModel):
    id: int
    username: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    photo_url: Optional[str]

    class Config:
        from_attributes = True
