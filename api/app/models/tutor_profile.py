from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class TutorProfile(Base):
    __tablename__ = "tutor_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
    )

    # связь с User (User должен иметь: tutor_profile = relationship(..., back_populates="user"))
    user = relationship("User", back_populates="tutor_profile")

    # ✅ поле для "поднятия" анкеты
    bumped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    bio: Mapped[str] = mapped_column(Text, nullable=False)

    subjects_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    levels_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    formats_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    city: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    price_from: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    price_to: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    is_listed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    slug: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    seo_title: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    seo_description: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    # Контакты репетитора (например @username или ссылка t.me/username)
    telegram_contact: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    # Контакты ВК (например username или ссылка https://vk.com/username)
    vk_contact: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Загруженное фото (если задано — используем вместо photo_url из Telegram)
    uploaded_photo_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
