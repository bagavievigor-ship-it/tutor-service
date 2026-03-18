from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.routers.deps import get_current_user, get_db
from app.schemas.notification import NotificationOut

router = APIRouter(prefix="/me/notifications", tags=["notifications"])


@router.get("", response_model=List[NotificationOut])
def list_my_notifications(
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200
    if offset < 0:
        offset = 0

    q = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        q = q.filter(Notification.is_read == 0)

    items = (
        q.order_by(Notification.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return items


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    cnt = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read == 0)
        .count()
    )
    return {"count": cnt}


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    # обновляем только непрочитанные
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read == 0)
        .update({"is_read": 1})
    )
    db.commit()
    return {"ok": True, "updated": updated}


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    n = db.get(Notification, notification_id)
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    if n.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if n.is_read != 1:
        n.is_read = 1
        db.commit()

    return {"ok": True, "id": n.id}
