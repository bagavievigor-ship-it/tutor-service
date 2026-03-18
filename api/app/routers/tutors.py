import json
import os
import secrets
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.core.slugs import slugify
from app.core.config import settings
from app.models.tutor_profile import TutorProfile
from app.routers.deps import get_current_user, get_db
from app.schemas.tutor import TutorOut, TutorUpsertIn

router = APIRouter(prefix="/tutors", tags=["tutors"])


def _fill_lists(t: TutorProfile) -> TutorProfile:
    t.subjects = json.loads(t.subjects_json or "[]")
    t.levels = json.loads(t.levels_json or "[]")
    t.formats = json.loads(t.formats_json or "[]")

    # expose a couple of safe User fields for UI (avatar/username)
    try:
        u = getattr(t, "user", None)
        t.username = getattr(u, "username", None) if u else None
        t.photo_url = getattr(u, "photo_url", None) if u else None
    except Exception:
        t.username = None
        t.photo_url = None

    # If tutor uploaded a custom photo — override Telegram photo
    try:
        fn = getattr(t, "uploaded_photo_filename", None)
        if fn:
            t.photo_url = f"{settings.API_PUBLIC_URL}/media/tutor_photos/{fn}"
    except Exception:
        pass
    return t


@router.get("", response_model=List[TutorOut])
def list_tutors(db: Session = Depends(get_db)):
    items = (
        db.query(TutorProfile)
        .options(joinedload(TutorProfile.user))
        .filter(TutorProfile.is_listed == True)
        .order_by(
            (TutorProfile.bumped_at.is_(None)).asc(),  # bumped выше None
            desc(TutorProfile.bumped_at),
            desc(TutorProfile.id),
        )
        .all()
    )
    return [_fill_lists(i) for i in items]




@router.get("/me/exists", response_model=dict)
def me_exists(db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = db.query(TutorProfile).filter(TutorProfile.user_id == user.id).first()
    return {"exists": bool(t)}
@router.get("/me", response_model=TutorOut)
def get_me(db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = (
        db.query(TutorProfile)
        .options(joinedload(TutorProfile.user))
        .filter(TutorProfile.user_id == user.id)
        .one_or_none()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Tutor profile not found")
    return _fill_lists(t)


@router.post("/me", response_model=TutorOut)
def upsert_me(payload: TutorUpsertIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = db.query(TutorProfile).filter(TutorProfile.user_id == user.id).one_or_none()
    if not t:
        t = TutorProfile(user_id=user.id, display_name=payload.display_name, bio=payload.bio)
        db.add(t)

    t.display_name = payload.display_name
    t.bio = payload.bio
    t.subjects_json = json.dumps(payload.subjects, ensure_ascii=False)
    t.levels_json = json.dumps(payload.levels, ensure_ascii=False)
    t.formats_json = json.dumps(payload.formats, ensure_ascii=False)
    t.city = payload.city
    t.price_from = payload.price_from
    t.price_to = payload.price_to
    t.is_listed = payload.is_listed
    t.seo_title = payload.seo_title
    t.seo_description = payload.seo_description
    t.telegram_contact = payload.telegram_contact
    t.vk_contact = payload.vk_contact

    base = payload.display_name
    if payload.subjects:
        base += " " + payload.subjects[0]
    t.slug = slugify(base)

    db.commit()
    db.refresh(t)
    return _fill_lists(t)


@router.post("/me/bump")
def bump_my_tutor(db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = db.query(TutorProfile).filter(TutorProfile.user_id == user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tutor profile not found")

    t.bumped_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(t)

    return {"ok": True, "bumped_at": t.bumped_at.isoformat() if t.bumped_at else None}


@router.get("/by-slug/{slug}", response_model=TutorOut)
def get_tutor_by_slug(slug: str, db: Session = Depends(get_db)):
    t = (
        db.query(TutorProfile)
        .options(joinedload(TutorProfile.user))
        .filter(TutorProfile.slug == slug)
        .filter(TutorProfile.is_listed == True)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Tutor not found")
    return _fill_lists(t)


@router.get("/{tutor_id}", response_model=TutorOut)
def get_tutor(tutor_id: int, db: Session = Depends(get_db)):
    t = (
        db.query(TutorProfile)
        .options(joinedload(TutorProfile.user))
        .filter(TutorProfile.id == tutor_id)
        .first()
    )
    if not t or not t.is_listed:
        raise HTTPException(status_code=404, detail="Tutor not found")
    return _fill_lists(t)


@router.post("/me/photo", response_model=TutorOut)
def upload_me_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Upload custom tutor profile photo. If set — it overrides Telegram photo_url."""
    t = db.query(TutorProfile).options(joinedload(TutorProfile.user)).filter(TutorProfile.user_id == user.id).one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Анкета репетитора не найдена. Сначала заполните анкету.")

    ct = (file.content_type or "").lower()
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Можно загрузить только изображение.")

    # Extension whitelist (keep it simple for MVP)
    orig_name = (file.filename or "").lower()
    ext = ".jpg"
    for e in [".jpg", ".jpeg", ".png", ".webp"]:
        if orig_name.endswith(e):
            ext = ".jpg" if e == ".jpeg" else e
            break

    media_dir = os.path.join("/opt/repetitor_app_api/app/media", "tutor_photos")
    os.makedirs(media_dir, exist_ok=True)

    token = secrets.token_hex(12)
    filename = f"u{user.id}_{token}{ext}"
    path = os.path.join(media_dir, filename)

    # delete old file if any
    old = getattr(t, "uploaded_photo_filename", None)
    if old:
        old_path = os.path.join(media_dir, old)
        try:
            if os.path.exists(old_path):
                os.remove(old_path)
        except Exception:
            pass

    # save
    with open(path, "wb") as out:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)

    t.uploaded_photo_filename = filename
    t.updated_at = datetime.utcnow()
    db.add(t)
    db.commit()
    db.refresh(t)
    return _fill_lists(t)


@router.delete("/me/photo", response_model=TutorOut)
def delete_me_photo(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Remove uploaded tutor photo (fallback to Telegram avatar)."""
    t = db.query(TutorProfile).options(joinedload(TutorProfile.user)).filter(TutorProfile.user_id == user.id).one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Анкета репетитора не найдена.")

    media_dir = os.path.join("/opt/repetitor_app_api/app/media", "tutor_photos")
    old = getattr(t, "uploaded_photo_filename", None)
    if old:
        try:
            old_path = os.path.join(media_dir, old)
            if os.path.exists(old_path):
                os.remove(old_path)
        except Exception:
            pass

    t.uploaded_photo_filename = None
    t.updated_at = datetime.utcnow()
    db.add(t)
    db.commit()
    db.refresh(t)
    return _fill_lists(t)
