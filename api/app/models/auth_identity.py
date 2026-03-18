from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class AuthIdentity(Base):
    __tablename__ = "auth_identities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)  # telegram | email | vk
    provider_user_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)  # tg_id / vk_user_id / etc

    # For provider=email
    email_normalized: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)

    is_verified: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uq_auth_identity_provider_user"),
        UniqueConstraint("email_normalized", name="uq_auth_identity_email"),
        Index("ix_auth_identities_provider", "provider"),
    )
