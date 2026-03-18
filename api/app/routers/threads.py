from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.thread import Thread
from app.models.request import Request
from app.models.message import Message
from app.models.notification import Notification
from app.models.user import User
from app.routers.deps import get_current_user, get_db

router = APIRouter(prefix="/threads", tags=["threads"])


def _ensure_thread_access(user_id: int, t: Thread) -> None:
    if user_id not in (t.author_user_id, t.tutor_user_id):
        raise HTTPException(status_code=403, detail="Forbidden")


class ThreadMessageCreateIn(BaseModel):
    text: str


# -------------------------
# Threads
# -------------------------
@router.get("", response_model=List[dict])
def list_threads(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    items = (
        db.query(Thread)
        .filter((Thread.author_user_id == user.id) | (Thread.tutor_user_id == user.id))
        .order_by(Thread.id.desc())
        .all()
    )

    return [
        {
            "id": t.id,
            "request_id": t.request_id,
            "author_user_id": t.author_user_id,
            "tutor_user_id": t.tutor_user_id,
            "created_at": t.created_at,
        }
        for t in items
    ]


@router.get("/{thread_id}", response_model=dict)
def get_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    t: Optional[Thread] = db.get(Thread, thread_id)
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")

    _ensure_thread_access(user.id, t)

    return {
        "id": t.id,
        "request_id": t.request_id,
        "author_user_id": t.author_user_id,
        "tutor_user_id": t.tutor_user_id,
        "created_at": t.created_at,
    }


@router.get("/by-request/{request_id}", response_model=Optional[dict])
def get_thread_by_request(
    request_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    req: Optional[Request] = db.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if user.id not in (req.author_user_id, req.assigned_user_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    t = db.query(Thread).filter(Thread.request_id == request_id).one_or_none()
    if not t:
        return None

    _ensure_thread_access(user.id, t)

    return {
        "id": t.id,
        "request_id": t.request_id,
        "author_user_id": t.author_user_id,
        "tutor_user_id": t.tutor_user_id,
        "created_at": t.created_at,
    }


# -------------------------
# Messages (compat for frontend: /threads/{id}/messages)
# -------------------------
@router.get("/{thread_id}/messages", response_model=List[dict])
def list_thread_messages(
    thread_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
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


@router.post("/{thread_id}/messages", response_model=dict)
def create_thread_message(
    thread_id: int,
    payload: ThreadMessageCreateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    POST /threads/{thread_id}/messages
    Body: { "text": "..." }

    MVP-уведомления:
    - создаём Notification второй стороне
    - entity_id = request_id (чтобы фронт мог перейти в /requests/{request_id})
    """
    t: Optional[Thread] = db.get(Thread, thread_id)
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

    # соберём короткое "кто написал"
    sender: Optional[User] = db.get(User, user.id)
    sender_name = None
    if sender:
        if sender.username:
            sender_name = f"@{sender.username}"
        else:
            sender_name = (sender.first_name or "").strip() or f"user_id={sender.id}"
    else:
        sender_name = f"user_id={user.id}"

    # подтянем заявку (для красивого текста)
    req: Optional[Request] = db.get(Request, t.request_id)
    req_title = f"Заявка #{t.request_id}"
    if req:
        req_title = f"Заявка #{req.id}: {req.subject} — {req.level}"

    n = Notification(
        user_id=recipient_id,
        type="new_message",
        entity_id=t.request_id,  # <-- это важно: по нему перейдём в нужную заявку
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
