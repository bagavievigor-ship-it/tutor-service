import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.notification import Notification
from app.models.tg_link_token import TgLinkToken
from app.models.user import User
from app.routers.deps import get_current_user, get_db

router = APIRouter(prefix="/telegram", tags=["telegram"])


def _internal_token() -> str:
    return (settings.TELEGRAM_INTERNAL_TOKEN or settings.TURBO_SHARED_SECRET or "").strip()


def _require_internal_token(x_internal_token: Optional[str]) -> None:
    expected = _internal_token()
    if not expected:
        # If token is not configured, we refuse by default to avoid open internal endpoints.
        raise HTTPException(status_code=500, detail="Internal token not configured")
    if (x_internal_token or "").strip() != expected:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/link-token")
def create_link_token(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a one-time token and return a deep-link URL for the bot."""
    # invalidate previous unused tokens
    db.query(TgLinkToken).filter(
        TgLinkToken.user_id == user.id,
        TgLinkToken.used_at.is_(None),
        TgLinkToken.expires_at > datetime.utcnow(),
    ).update({"expires_at": datetime.utcnow()})

    token = secrets.token_urlsafe(24)
    now = datetime.utcnow()
    item = TgLinkToken(
        token=token,
        user_id=user.id,
        created_at=now,
        expires_at=now + timedelta(minutes=15),
        used_at=None,
    )
    db.add(item)
    db.commit()

    # Frontend already knows the username via NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
    # and can build the final URL: https://t.me/<bot>?start=<token>
    return {
        "token": token,
        "expires_in": 15 * 60,
        "start_param": token,
        "start_url": None,
    }


@router.post("/link")
def link_chat_id(
    payload: dict,
    db: Session = Depends(get_db),
    x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
):
    """Internal: called by bot when user runs /start <token>."""
    _require_internal_token(x_internal_token)

    token = (payload.get("token") or "").strip()
    chat_id = payload.get("chat_id")
    if not token or chat_id is None:
        raise HTTPException(status_code=422, detail="token and chat_id are required")
    try:
        chat_id = int(chat_id)
    except Exception:
        raise HTTPException(status_code=422, detail="chat_id must be int")

    item: Optional[TgLinkToken] = (
        db.query(TgLinkToken)
        .filter(TgLinkToken.token == token)
        .order_by(TgLinkToken.id.desc())
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Token not found")
    if item.used_at is not None:
        raise HTTPException(status_code=409, detail="Token already used")
    if item.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=410, detail="Token expired")

    user = db.get(User, item.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.tg_chat_id = chat_id
    # enable by default right after linking; user can disable on /me/notifications
    user.tg_notify_enabled = 1
    item.used_at = datetime.utcnow()
    db.commit()

    return {"ok": True, "user_id": user.id, "tg_chat_id": user.tg_chat_id}


@router.get("/pending-notifications")
def pending_notifications(
    limit: int = 50,
    db: Session = Depends(get_db),
    x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
):
    """Internal: bot polls notifications not yet duplicated to Telegram."""
    _require_internal_token(x_internal_token)
    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200

    rows = (
        db.query(Notification, User)
        .join(User, User.id == Notification.user_id)
        .filter(User.tg_notify_enabled == 1)
        .filter(User.tg_chat_id.isnot(None))
        .filter(Notification.telegram_sent_at.is_(None))
        .order_by(Notification.id.asc())
        .limit(limit)
        .all()
    )

    out: List[dict] = []
    for n, u in rows:
        out.append(
            {
                "id": n.id,
                "user_id": n.user_id,
                "chat_id": u.tg_chat_id,
                "type": n.type,
                "entity_id": n.entity_id,
                "title": n.title,
                "body": n.body,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
        )
    return out


@router.post("/notifications/{notification_id}/sent")
def mark_notification_sent(
    notification_id: int,
    db: Session = Depends(get_db),
    x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
):
    _require_internal_token(x_internal_token)
    n = db.get(Notification, notification_id)
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    if n.telegram_sent_at is None:
        n.telegram_sent_at = datetime.utcnow()
        db.commit()
    return {"ok": True, "id": n.id}