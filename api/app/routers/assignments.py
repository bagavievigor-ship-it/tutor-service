from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.assignment import Assignment
from app.models.notification import Notification
from app.models.request import Request
from app.models.thread import Thread
from app.models.tutor_profile import TutorProfile
from app.models.user import User
from app.routers.deps import get_current_user, get_db
from app.schemas.thread import AssignIn, ThreadOut

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.post("/request/{request_id}", response_model=ThreadOut)
def assign_tutor(
    request_id: int,
    payload: AssignIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only request author can assign")
    if req.status in ("closed", "archived"):
        raise HTTPException(status_code=400, detail="Request is closed/archived")

    # выбранный исполнитель должен быть репетитором из каталога
    t = (
        db.query(TutorProfile)
        .filter(TutorProfile.user_id == payload.tutor_user_id, TutorProfile.is_listed == True)
        .one_or_none()
    )
    if not t:
        raise HTTPException(status_code=400, detail="Selected user is not a listed tutor")

    existing = db.query(Assignment).filter(Assignment.request_id == request_id).one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Already assigned")

    a = Assignment(request_id=request_id, tutor_user_id=payload.tutor_user_id, status="active")
    db.add(a)

    # создаём чат (thread) только после назначения
    th = Thread(request_id=request_id, author_user_id=user.id, tutor_user_id=payload.tutor_user_id)
    db.add(th)

    # ✅ синхронизируем поля заявки
    req.status = "assigned"
    req.assigned_user_id = payload.tutor_user_id
    req.assigned_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()

    # ✅ уведомление репетитору
    author = db.get(User, user.id)
    author_u = (author.username or "").strip() if author else ""
    author_label = f"@{author_u}" if author_u else f"user_id={user.id}"

    n = Notification(
        user_id=payload.tutor_user_id,
        type="assigned",
        entity_id=req.id,
        title="Вас назначили исполнителем",
        body=f"Вас выбрали по заявке #{req.id}: {req.subject} — {req.level}. Автор: {author_label}",
        is_read=0,
        created_at=datetime.utcnow(),
    )
    db.add(n)

    db.commit()
    db.refresh(th)
    return th
