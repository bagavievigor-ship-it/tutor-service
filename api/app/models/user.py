from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    # Telegram is now just one of auth providers.
    # For email/VK users this can be NULL.
    # NOTE: In SQLite UNIQUE allows multiple NULLs, so this won't conflict.
    telegram_id = Column(Integer, unique=True, index=True, nullable=True)

    username = Column(String(64), nullable=True)
    first_name = Column(String(64), nullable=True)
    last_name = Column(String(64), nullable=True)
    photo_url = Column(String(512), nullable=True)

    # created_at is required by some response schemas; we keep it non-null and backfill in migration.
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # For Telegram notifications (link with bot chat_id)
    tg_chat_id = Column(Integer, nullable=True)
    tg_notify_enabled = Column(Boolean, nullable=False, default=False)

    # One-to-one tutor profile
    tutor_profile = relationship(
        "TutorProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
