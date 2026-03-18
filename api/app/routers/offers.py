from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.offer import Offer
from app.models.request import Request
from app.models.tutor_profile import TutorProfile
from app.models.notification import Notification
from app.routers.deps import get_current_user, get_db
from app.schemas.offer import OfferCreateIn, OfferOut
from app.services.notification_email import try_send_notification_email


router = APIRouter(prefix="/offers", tags=["offers"])


@router.post("", response_model=OfferOut)
def create_offer(
    payload: OfferCreateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    r = db.get(Request, payload.request_id)
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")

    # Только автор заявки может предлагать её репетитору
    if r.author_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only request author can create offer")

    if (r.status or "").lower() != "open":
        raise HTTPException(status_code=400, detail="Only open requests can be offered")

    # Проверим что адресат — репетитор (есть анкета)
    tp = db.query(TutorProfile).filter(TutorProfile.user_id == payload.to_tutor_user_id).first()
    if not tp:
        raise HTTPException(status_code=400, detail="Target user is not a tutor")

    msg = (payload.message or "").strip()
    if not msg:
        msg = "Вам предложили откликнуться на заявку."

    offer = Offer(
        request_id=r.id,
        to_tutor_user_id=payload.to_tutor_user_id,
        message=msg,
        status="sent",
    )

    db.add(offer)
    try:
        db.commit()
        db.refresh(offer)
    except IntegrityError:
        # uq_offer_request_tutor — уже предлагали эту заявку этому репетитору.
        # Делаем операцию идемпотентной: обновляем существующий Offer и возвращаем его.
        db.rollback()
        offer = (
            db.query(Offer)
            .filter(Offer.request_id == r.id, Offer.to_tutor_user_id == payload.to_tutor_user_id)
            .one_or_none()
        )
        if not offer:
            raise HTTPException(status_code=409, detail="Offer already exists")

        offer.message = msg
        offer.status = "sent"
        offer.created_at = datetime.utcnow()
        db.commit()

    # Уведомление репетитору со ссылкой на заявку (entity_id = request_id)
    sender_name = (
        f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()
        or (user.username or "Пользователь")
    )
    notif = Notification(
        user_id=payload.to_tutor_user_id,
        type="offer",
        entity_id=r.id,
        title="Предложение заявки",
        body=f"{sender_name} предлагает вам откликнуться на заявку: {r.subject} ({r.level}, {r.format})",
        is_read=False,
    )
    db.add(notif)
    db.commit()
    try_send_notification_email(db, payload.to_tutor_user_id, notif.title, notif.body)

    return OfferOut.model_validate(offer, from_attributes=True)
