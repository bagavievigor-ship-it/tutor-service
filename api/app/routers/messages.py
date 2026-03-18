from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.message import Message
from app.models.notification import Notification
from app.models.request import Request
from app.models.thread import Thread
from app.models.user import User
from app.routers.deps import get_current_user, get_db
from app.services.notification_email import try_send_notification_email

router = APIRouter(prefix="/messages", tags=["messages"])


class MessageCreateIn(BaseModel):
    thread_id: int
    text: str


def _ensure_thread_access(user_id: int, t: Thread) -> None:
    if user_id not in (t.author_user_id, t.tutor_user_id):
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("", response_model=List[dict])
def list_messages(
    thread_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    GET /messages?thread_id=...
    Список сообщений треда (доступ только участникам).
    """
    t: Optional[Thread] = db.get(Thread, thread_id)
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")

    _ensure_thread_access(user.id, t)

    items = (
        db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.id.asc())
        .all()
    )

    return [
        {
            "id": m.id,
            "thread_id": m.thread_id,
            "sender_user_id": m.sender_user_id,
            "text": m.text,
            "created_at": m.created_at,
            "read_at": m.read_at,
        }
        for m in items
    ]


@router.post("", response_model=dict)
def create_message(
    payload: MessageCreateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    POST /messages
    Body: { "thread_id": 123, "text": "..." }
    sender_user_id всегда текущий пользователь.

    MVP-уведомления:
    - создаём Notification второй стороне
    - entity_id = request_id (чтобы фронт мог перейти в /requests/{request_id})
    """
    t: Optional[Thread] = db.get(Thread, payload.thread_id)
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")

    _ensure_thread_access(user.id, t)

    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty message")

    m = Message(
        thread_id=t.id,
        sender_user_id=user.id,
        text=text,
        created_at=datetime.utcnow(),
        read_at=None,
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    # --- уведомление второй стороне ---
    recipient_id = t.tutor_user_id if user.id == t.author_user_id else t.author_user_id

    sender: Optional[User] = db.get(User, user.id)
    if sender:
        if sender.username:
            sender_name = f"@{sender.username}"
        else:
            sender_name = (sender.first_name or "").strip() or f"user_id={sender.id}"
    else:
        sender_name = f"user_id={user.id}"

    req: Optional[Request] = db.get(Request, t.request_id)
    req_title = f"Заявка #{t.request_id}"
    if req:
        req_title = f"Заявка #{req.id}: {req.subject} — {req.level}"

    n = Notification(
        user_id=recipient_id,
        type="new_message",
        entity_id=t.request_id,
        title="Новое сообщение в чате",
        body=f"Сообщение от {sender_name}. {req_title}",
        is_read=0,
        created_at=datetime.utcnow(),
    )
    db.add(n)
    db.commit()

    return {
        "id": m.id,
        "thread_id": m.thread_id,
        "sender_user_id": m.sender_user_id,
        "text": m.text,
        "created_at": m.created_at,
        "read_at": m.read_at,
    }
