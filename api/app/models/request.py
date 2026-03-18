from datetime import datetime
from typing import Optional, List

from sqlalchemy import Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Request(Base):
    __tablename__ = "requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    author_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    request_kind: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(Text, nullable=False)
    format: Mapped[str] = mapped_column(Text, nullable=False)

    city: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    budget_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    schedule_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    description: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(Text, nullable=False, default="open")
    slug: Mapped[str] = mapped_column(Text, nullable=False, default="")

    seo_title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    seo_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    commission_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    commission_value: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    currency: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    turbo_enabled: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    turbo_status: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    turbo_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    assigned_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    # Admin (user_id=1) can hide requests from the public / non-admin lists.
    # Stored as INTEGER(0/1) in SQLite.
    admin_hidden: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ✅ ВОТ ЭТО ДОБАВЬ
    responses: Mapped[List["Response"]] = relationship(
        "Response",
        back_populates="request",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
