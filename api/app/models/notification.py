from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, Text, DateTime, ForeignKey, event
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm import Session as OrmSession

from app.db.base_class import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    type: Mapped[str] = mapped_column(Text, nullable=False)

    entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # В SQLite у тебя INTEGER 0/1 — так и храним
    is_read: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)

    # When duplicated to Telegram (NULL if not sent)
    telegram_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


# ✅ Авто-дублирование уведомлений на email (best-effort)
# Срабатывает для любых уведомлений, где подключена email-авторизация у получателя.
@event.listens_for(Notification, "after_insert")
def _notification_after_insert(mapper, connection, target):  # noqa: ARG001
    try:
        # создаём короткую сессию на той же DB-connection (чтобы не лезть в SessionLocal и не ловить циклы импорта)
        db = OrmSession(bind=connection, future=True)
        try:
            from app.services.notification_email import try_send_notification_email

            try_send_notification_email(
                db,
                int(getattr(target, "user_id")),
                str(getattr(target, "title") or "Уведомление"),
                str(getattr(target, "body") or ""),
            )
        finally:
            db.close()
    except Exception:
        # Никогда не роняем API из-за email
        return
