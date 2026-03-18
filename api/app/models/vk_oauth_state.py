from datetime import datetime, timedelta

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class VkOAuthState(Base):
    __tablename__ = "vk_oauth_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    state: Mapped[str] = mapped_column(String(96), nullable=False, unique=True, index=True)
    code_verifier: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    @staticmethod
    def make_expiry(minutes: int = 10) -> datetime:
        return datetime.utcnow() + timedelta(minutes=minutes)
