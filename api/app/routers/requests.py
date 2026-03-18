from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.slugs import slugify
from app.models.request import Request
from app.models.user import User
from app.models.thread import Thread
from app.models.response import Response
from app.models.assignment import Assignment
from app.models.notification import Notification
from app.routers.deps import get_current_user, get_optional_user, get_db
from app.schemas.request import RequestCreateIn, RequestOut, AssignedUserOut
from app.services.turbo import commission_text, try_send_turbo
from app.services.notification_email import try_send_notification_email

router = APIRouter(prefix="/requests", tags=["requests"])


@router.get("", response_model=List[RequestOut])
def list_requests(
    include_hidden: bool = False,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Public requests list.

    - By default returns only non-hidden requests.
    - Admin (user_id=1) can pass include_hidden=1 to see everything.
    """

    q = (
        db.query(Request, func.count(Response.id).label("responses_count"))
        .outerjoin(Response, Response.request_id == Request.id)
        .group_by(Request.id)
        .order_by(Request.id.desc())
    )

    is_admin = bool(user and user.id == 1)
    if not (include_hidden and is_admin):
        q = q.filter(Request.admin_hidden == 0)

    rows = q.all()

    out: List[RequestOut] = []
    for req, cnt in rows:
        # assigned_user тут не собираем (как и раньше в list) — это грузится на детальной странице
        out.append(
            RequestOut.model_validate(req, from_attributes=True).model_copy(
                update={"responses_count": int(cnt or 0)}
            )
        )
    return out


@router.get("/mine", response_model=List[RequestOut])
def list_my_requests(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = (
        db.query(Request, func.count(Response.id).label("responses_count"))
        .outerjoin(Response, Response.request_id == Request.id)
        .filter(Request.author_user_id == user.id)
        .group_by(Request.id)
        .order_by(Request.id.desc())
        .all()
    )

    out: List[RequestOut] = []
    for req, cnt in rows:
        out.append(
            RequestOut.model_validate(req, from_attributes=True).model_copy(
                update={"responses_count": int(cnt or 0)}
            )
        )
    return out


@router.get("/{request_id}", response_model=RequestOut)
def get_request(request_id: int, db: Session = Depends(get_db)):
    r = db.get(Request, request_id)
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")

    assigned_user: Optional[AssignedUserOut] = None
    if r.assigned_user_id:
        u = db.get(User, r.assigned_user_id)
        if u:
            assigned_user = AssignedUserOut.model_validate(u)

    responses_count = (
        db.query(func.count(Response.id))
        .filter(Response.request_id == r.id)
        .scalar()
    )

    return RequestOut(
        id=r.id,
        author_user_id=r.author_user_id,
        request_kind=r.request_kind,
        subject=r.subject,
        level=r.level,
        format=r.format,
        city=r.city,
        budget_text=r.budget_text,
        schedule_text=r.schedule_text,
        description=r.description,
        commission_type=r.commission_type,
        commission_value=r.commission_value,
        currency=r.currency,
        turbo_enabled=r.turbo_enabled,
        turbo_status=r.turbo_status,
        turbo_sent_at=r.turbo_sent_at,
        slug=r.slug,
        seo_title=r.seo_title,
        seo_description=r.seo_description,
        status=r.status,
        responses_count=int(responses_count or 0),
        assigned_user_id=r.assigned_user_id,
        assigned_at=r.assigned_at,
        assigned_user=assigned_user,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


@router.post("/{request_id}/close", response_model=dict)
def close_request(
    request_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    r = db.get(Request, request_id)
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if r.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only request author can close")
    if (r.status or "").lower() != "open":
        raise HTTPException(status_code=400, detail="Only open requests can be closed")

    r.status = "closed"
    r.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "request_id": r.id, "status": r.status}


@router.post("/{request_id}/open", response_model=dict)
def open_request(
    request_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    r = db.get(Request, request_id)
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if r.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only request author can open")
    if (r.status or "").lower() != "closed":
        raise HTTPException(status_code=400, detail="Only closed requests can be opened")

    r.status = "open"
    r.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "request_id": r.id, "status": r.status}



@router.post("/{request_id}/reopen", response_model=dict)
def reopen_request(
    request_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    r = db.get(Request, request_id)
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if r.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only request author can reopen")

    # Запомним, кто был выбран исполнителем, чтобы при "Поменять репетитора"
    # дать ему возможность откликнуться повторно.
    old_assigned_user_id = r.assigned_user_id

    # Reset assignment + status
    r.assigned_user_id = None
    r.assigned_at = None
    if getattr(r, "status", None):
        r.status = "open"
    r.updated_at = datetime.utcnow()

    # Reset responses back to 'sent' so author can pick again
    db.query(Response).filter(Response.request_id == r.id).update(
        {Response.status: "sent"}, synchronize_session=False
    )

    # Удалим отклик ранее выбранного исполнителя (если был), чтобы он мог откликнуться снова
    if old_assigned_user_id:
        db.query(Response).filter(
            Response.request_id == r.id,
            Response.from_user_id == old_assigned_user_id,
        ).delete(synchronize_session=False)

        # Если заявка была назначена через assignments — тоже сбросим
        db.query(Assignment).filter(
            Assignment.request_id == r.id,
            Assignment.tutor_user_id == old_assigned_user_id,
        ).delete(synchronize_session=False)

    # Delete existing thread (and messages via cascade)
    thread = db.query(Thread).filter(Thread.request_id == r.id).one_or_none()
    if thread:
        db.delete(thread)

    # Уведомление ранее выбранному репетитору: автор отменил выбор
    if old_assigned_user_id:
        author = db.get(User, r.author_user_id)
        author_name = (author.first_name or "").strip()
        author_last = (author.last_name or "").strip()
        author_label = (f"{author_name} {author_last}".strip() if (author_name or author_last) else None)
        if not author_label:
            u = (author.username or "").strip() if author else ""
            author_label = f"@{u}" if u else f"user_id={r.author_user_id}"

        n = Notification(
            user_id=old_assigned_user_id,
            type="unassigned",
            entity_id=r.id,
            title="Выбор отменён",
            body=f"Автор {author_label} отменил выбор по заявке #{r.id}: {r.subject} — {r.level}.",
            is_read=0,
            created_at=datetime.utcnow(),
        )
        db.add(n)

    db.commit()
    return {"ok": True, "request_id": r.id, "status": r.status}


@router.post("", response_model=RequestOut)
async def create_request(
    payload: RequestCreateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    turbo_enabled = bool(getattr(payload, "turbo_enabled", False))

    r = Request(
        author_user_id=user.id,
        request_kind=payload.request_kind,
        subject=payload.subject,
        level=payload.level,
        format=payload.format,
        city=payload.city,
        budget_text=payload.budget_text,
        schedule_text=payload.schedule_text,
        description=(payload.description or ""),
        turbo_enabled=turbo_enabled,

        # ✅ ВАЖНО: turbo_status в БД NOT NULL — задаём всегда
        turbo_status=("pending" if payload.turbo_enabled else "disabled"),
        turbo_sent_at=None,

        # Admin hide flag must always exist (DB NOT NULL)
        admin_hidden=0,

        commission_type=payload.commission_type,
        commission_value=payload.commission_value,
        currency=payload.currency,
        seo_title=payload.seo_title,
        seo_description=payload.seo_description,
        status="open",
        updated_at=datetime.utcnow(),
    )

    r.slug = slugify("%s %s %s" % (payload.subject, payload.level, payload.format))
    db.add(r)
    db.commit()
    db.refresh(r)

    # Turbo: пробуем отправить в старый API (если там ещё нет обработчика — вернется pending)
    if r.turbo_enabled:
        url = "%s/requests/%d-%s" % (settings.APP_PUBLIC_URL, r.id, r.slug)
        turbo_payload = {
            "request_id": r.id,
            "request_kind": r.request_kind,
            "subject": r.subject,
            "level": r.level,
            "format": r.format,
            "budget_text": r.budget_text,
            "commission_text": commission_text(r.commission_type, r.commission_value, r.currency)
            if r.request_kind == "broker"
            else None,
            "url": url,
        }
        status_, sent_at = await try_send_turbo(turbo_payload)

        # на всякий случай — чтобы не уронить NOT NULL, если сервис вернул None
        r.turbo_status = status_ or "pending"
        r.turbo_sent_at = sent_at

        db.commit()
        db.refresh(r)

    return r


@router.patch("/{request_id}/admin_hidden", response_model=RequestOut)
def set_admin_hidden(
    request_id: int,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hide/show a request in lists (admin only, user_id=1)."""
    if user.id != 1:
        raise HTTPException(status_code=403, detail="Admin only")

    r = db.get(Request, request_id)
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")

    hidden = bool(payload.get("hidden", False))
    r.admin_hidden = 1 if hidden else 0
    db.add(r)
    db.commit()
    db.refresh(r)
    return r
