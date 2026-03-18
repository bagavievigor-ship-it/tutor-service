from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.request import Request
from app.models.response import Response
from app.models.thread import Thread
from app.models.tutor_profile import TutorProfile
from app.models.user import User
from app.routers.deps import get_current_user, get_db
from app.schemas.response import ResponseCreateIn, ResponseOut, ResponseTutorOut
from app.services.notification_email import try_send_notification_email

router = APIRouter(tags=["responses"])


@router.post("/requests/{request_id}/responses", response_model=ResponseOut)
def create_response(
    request_id: int,
    payload: ResponseCreateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status != "open":
        raise HTTPException(status_code=400, detail="Request is not open")

    if req.author_user_id == user.id:
        raise HTTPException(status_code=400, detail="Author cannot respond to own request")

    # ✅ НОВОЕ: откликаться могут только пользователи с заполненной анкетой репетитора
    tp = db.query(TutorProfile).filter(TutorProfile.user_id == user.id).one_or_none()
    if not tp:
        raise HTTPException(
            status_code=403,
            detail="Чтобы откликаться, нужно заполнить анкету репетитора: /tutors/me",
        )

    # минимальная “заполненность”: display_name + bio (у вас это и так NOT NULL, но проверим на всякий)
    if not (tp.display_name or "").strip() or len((tp.display_name or "").strip()) < 2:
        raise HTTPException(status_code=400, detail="Заполните имя в анкете репетитора (/tutors/me).")
    if not (tp.bio or "").strip() or len((tp.bio or "").strip()) < 10:
        raise HTTPException(status_code=400, detail="Заполните описание (bio) в анкете репетитора (/tutors/me).")

    # ✅ Запрет повторного отклика
    exists = (
        db.query(Response.id)
        .filter(Response.request_id == req.id, Response.from_user_id == user.id)
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="You have already responded to this request")

    r = Response(
        request_id=req.id,
        from_user_id=user.id,
        message=payload.message.strip(),
        status="sent",
        created_at=datetime.utcnow(),
    )
    db.add(r)
    db.commit()
    db.refresh(r)

    # ✅ Уведомление автору заявки: “Новый отклик”
    n = Notification(
        user_id=req.author_user_id,
        type="new_response",
        entity_id=req.id,
        title="Новый отклик на вашу заявку",
        body=f"Отклик на заявку #{req.id}: {req.subject} — {req.level}",
        is_read=0,
        created_at=datetime.utcnow(),
    )
    db.add(n)
    db.commit()

    # ✅ Дублирование уведомления на email (только если email-авторизация подключена и подтверждена)
    try_send_notification_email(db, req.author_user_id, n.title, n.body)

    return r


@router.get("/requests/{request_id}/responses", response_model=List[ResponseOut])
def list_responses_for_request(
    request_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only request author can view responses")

    rows = (
        db.query(Response, User, TutorProfile)
        .join(User, User.id == Response.from_user_id)
        .outerjoin(TutorProfile, TutorProfile.user_id == User.id)
        .filter(Response.request_id == request_id)
        .order_by(Response.id.desc())
        .all()
    )

    out: List[ResponseOut] = []
    for resp, u, tp in rows:
        # чтобы Pydantic мог достать user из relationship
        resp.user = u
        tutor_obj = None
        if tp:
            tutor_obj = ResponseTutorOut(
                tutor_id=tp.id,
                user_id=tp.user_id,
                display_name=tp.display_name,
                slug=tp.slug,
                telegram_contact=tp.telegram_contact,
            )
        out.append(ResponseOut.model_validate(resp, from_attributes=True).model_copy(update={"tutor": tutor_obj}))
    return out
