from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Offer(Base):
    __tablename__ = "offers"
    __table_args__ = (
        UniqueConstraint("request_id", "to_tutor_user_id", name="uq_offer_request_tutor"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"), index=True)
    to_tutor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="sent", index=True)  # sent/viewed/declined/accepted
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    request = relationship("Request")
    to_tutor = relationship("User")
