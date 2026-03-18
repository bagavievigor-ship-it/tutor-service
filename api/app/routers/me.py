import os
import re
import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text

from app.models.request import Request
from app.models.response import Response
from app.models.thread import Thread
from app.models.user import User
from app.routers.deps import get_current_user, get_db
from app.schemas.user import UserOut
from app.schemas.me import MyRequestOut, MyResponseOut, MyThreadOut

router = APIRouter(prefix="/me", tags=["me"])


class AuthMethodOut(BaseModel):
    provider: str
    label: str
    is_linked: bool


class LinkEmailStartIn(BaseModel):
    email: str


class LinkEmailVerifyIn(BaseModel):
    email: str
    code: str


class LinkTelegramIn(BaseModel):
    # Telegram Login Widget payload
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str


def _ensure_auth_tables(db: Session) -> None:
    # Keep it SQLite-compatible and harmless for Postgres too.
    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS auth_identities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider VARCHAR(32) NOT NULL,
                provider_user_id VARCHAR(128) NOT NULL,
                user_id INTEGER NOT NULL,
                created_at DATETIME NOT NULL,
                UNIQUE(provider, provider_user_id)
            );
            """
        )
    )
    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS email_login_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email VARCHAR(320) NOT NULL,
                code VARCHAR(12) NOT NULL,
                created_at DATETIME NOT NULL,
                expires_at DATETIME NOT NULL,
                used_at DATETIME
            );
            """
        )
    )



def _insert_identity(db: Session, provider: str, provider_user_id: str, user_id: int) -> bool:
    """Insert identity mapping once. Returns True if inserted, False if already existed.
    Raises HTTPException on conflicts (mapped to other user) or unexpected DB errors.
    """
    dialect = getattr(getattr(db, "bind", None), "dialect", None)
    name = getattr(dialect, "name", "").lower() if dialect else ""

    row = db.execute(
        text(
            """
            SELECT user_id FROM auth_identities
            WHERE provider = :p AND provider_user_id = :pid
            LIMIT 1
            """
        ),
        {"p": provider, "pid": provider_user_id},
    ).fetchone()

    if row:
        existing_uid = int(row[0])
        if existing_uid != int(user_id):
            raise HTTPException(status_code=409, detail=f"Этот {provider} уже привязан к другому аккаунту")
        return False

    try:
        if name == "sqlite":
            res = db.execute(
                text(
                    """
                    INSERT OR IGNORE INTO auth_identities (provider, provider_user_id, user_id, created_at)
                    VALUES (:p, :pid, :uid, :ts)
                    """
                ),
                {"p": provider, "pid": provider_user_id, "uid": user_id, "ts": datetime.utcnow()},
            )
        else:
            res = db.execute(
                text(
                    """
                    INSERT INTO auth_identities (provider, provider_user_id, user_id, created_at)
                    VALUES (:p, :pid, :uid, :ts)
                    ON CONFLICT (provider, provider_user_id) DO NOTHING
                    """
                ),
                {"p": provider, "pid": provider_user_id, "uid": user_id, "ts": datetime.utcnow()},
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Не удалось сохранить привязку ({provider}): {e}")

    if getattr(res, "rowcount", 1) == 0:
        row2 = db.execute(
            text(
                """
                SELECT user_id FROM auth_identities
                WHERE provider = :p AND provider_user_id = :pid
                LIMIT 1
                """
            ),
            {"p": provider, "pid": provider_user_id},
        ).fetchone()
        if row2 and int(row2[0]) != int(user_id):
            raise HTTPException(status_code=409, detail=f"Этот {provider} уже привязан к другому аккаунту")
        return False

    return True

def _identity_user_id(db: Session, provider: str, provider_user_id: str) -> Optional[int]:
    row = db.execute(
        text(
            """
            SELECT user_id FROM auth_identities
            WHERE provider=:p AND provider_user_id=:pid
            LIMIT 1
            """
        ),
        {"p": provider, "pid": provider_user_id},
    ).fetchone()
    if not row:
        return None
    try:
        return int(row[0])
    except Exception:
        return None


def _list_identities_for_user(db: Session, user_id: int):
    return db.execute(
        text(
            """
            SELECT provider, provider_user_id
            FROM auth_identities
            WHERE user_id = :uid
            ORDER BY provider ASC
            """
        ),
        {"uid": user_id},
    ).fetchall()


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if len(email) < 3 or len(email) > 254 or not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="invalid email")
    return email


def _mask_email(email: str) -> str:
    try:
        local, dom = email.split("@", 1)
        if len(local) <= 2:
            local_mask = local[0] + "*"
        else:
            local_mask = local[0] + "*" * (len(local) - 2) + local[-1]
        return f"{local_mask}@{dom}"
    except Exception:
        return email


@router.get("", response_model=UserOut)
def me(user=Depends(get_current_user)):
    return user


@router.post("/telegram-notify")
def set_telegram_notify(
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Enable/disable duplicating notifications to Telegram."""
    enabled = payload.get("enabled")
    if enabled is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="enabled is required")
    user.tg_notify_enabled = 1 if bool(enabled) else 0
    db.add(user)
    db.commit()
    return {"ok": True, "tg_notify_enabled": user.tg_notify_enabled, "tg_chat_id": user.tg_chat_id}


@router.get("/requests", response_model=List[MyRequestOut])
def my_requests(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    rows = (
        db.query(Request, func.count(Response.id).label("responses_count"))
        .outerjoin(Response, Response.request_id == Request.id)
        .filter(Request.author_user_id == user.id)
        .group_by(Request.id)
        .order_by(Request.id.desc())
        .all()
    )

    out: List[MyRequestOut] = []
    for req, cnt in rows:
        out.append(
            MyRequestOut.model_validate(req, from_attributes=True).model_copy(
                update={"responses_count": int(cnt or 0)}
            )
        )
    return out


@router.get("/responses", response_model=List[MyResponseOut])
def my_responses(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    rows = (
        db.query(Response, Request)
        .join(Request, Request.id == Response.request_id)
        .filter(Response.from_user_id == user.id)
        .order_by(Response.id.desc())
        .all()
    )

    out: List[MyResponseOut] = []
    for resp, req in rows:
        out.append(
            MyResponseOut(
                id=resp.id,
                request_id=resp.request_id,
                from_user_id=resp.from_user_id,
                message=resp.message,
                status=resp.status,
                created_at=resp.created_at,
                request_subject=req.subject,
                request_level=req.level,
                request_format=req.format,
                request_city=req.city,
                request_status=req.status,
                request_slug=req.slug,
                request_kind=req.request_kind,
            )
        )
    return out


@router.get("/threads", response_model=List[MyThreadOut])
def my_threads(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    rows = (
        db.query(Thread, Request)
        .join(Request, Request.id == Thread.request_id)
        .filter(or_(Thread.author_user_id == user.id, Thread.tutor_user_id == user.id))
        .order_by(Thread.id.desc())
        .all()
    )

    out: List[MyThreadOut] = []
    for th, req in rows:
        out.append(
            MyThreadOut(
                id=th.id,
                request_id=th.request_id,
                author_user_id=th.author_user_id,
                tutor_user_id=th.tutor_user_id,
                created_at=th.created_at,
                request_subject=req.subject,
                request_level=req.level,
                request_format=req.format,
                request_city=req.city,
                request_status=req.status,
                request_slug=req.slug,
                request_kind=req.request_kind,
            )
        )
    return out


@router.get("/auth-methods", response_model=List[AuthMethodOut])
def my_auth_methods(db: Session = Depends(get_db), user=Depends(get_current_user)):
    _ensure_auth_tables(db)
    rows = _list_identities_for_user(db, user.id)
    providers = {(r[0], r[1]) for r in rows}

    has_tg = bool(user.telegram_id) or any(p == "telegram" for p, _ in providers)
    email_val = None
    for p, pid in providers:
        if p == "email":
            email_val = pid
            break

    return [
        AuthMethodOut(provider="telegram", label=("Telegram подключен" if has_tg else "Telegram не подключен"), is_linked=has_tg),
        AuthMethodOut(
            provider="email",
            label=(f"Email: {_mask_email(email_val)}" if email_val else "Email не подключен"),
            is_linked=bool(email_val),
        ),
    ]


@router.post("/auth-methods/email/start")
def link_email_start(payload: LinkEmailStartIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    # Reuse SMTP helper from auth router
    from app.routers.auth import _smtp_send

    _ensure_auth_tables(db)
    email = _normalize_email(payload.email)

    # IMPORTANT:
    # We allow sending the code even if this email is currently linked to another account.
    # The ownership transfer (if allowed) is handled on /email/verify after the user proves
    # control of the mailbox by entering the code.

    code = f"{secrets.randbelow(1000000):06d}"
    now = datetime.utcnow()
    exp = now + timedelta(minutes=15)
    db.execute(
        text(
            """
            INSERT INTO email_login_codes (email, code, created_at, expires_at, used_at)
            VALUES (:email, :code, :created, :expires, NULL)
            """
        ),
        {"email": email, "code": code, "created": now, "expires": exp},
    )
    db.commit()

    subject = "Код подтверждения Repetitor18"
    body = f"Ваш код подтверждения: {code}\n\nКод действует 15 минут."
    try:
        _smtp_send(email, subject, body)
    except Exception as e:
        if os.getenv("DEV_RETURN_EMAIL_CODE") == "1":
            return {"ok": True, "dev_code": code, "warning": str(e)}
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/auth-methods/email/verify")
def link_email_verify(payload: LinkEmailVerifyIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _ensure_auth_tables(db)
    email = _normalize_email(payload.email)
    code = (payload.code or "").strip()

    row = db.execute(
        text(
            """
            SELECT id, expires_at, used_at
            FROM email_login_codes
            WHERE email = :email AND code = :code
            ORDER BY id DESC
            LIMIT 1
            """
        ),
        {"email": email, "code": code},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="Invalid code")
    code_id, expires_at, used_at = row[0], row[1], row[2]
    if used_at is not None:
        raise HTTPException(status_code=400, detail="Code already used")
    if isinstance(expires_at, str):
        exp_dt = datetime.fromisoformat(expires_at)
    else:
        exp_dt = expires_at
    if datetime.utcnow() > exp_dt:
        raise HTTPException(status_code=400, detail="Code expired")

    other_uid = _identity_user_id(db, "email", email)

    # Mark code as used (one-time) before linking
    db.execute(
        text("UPDATE email_login_codes SET used_at = :ts WHERE id = :id"),
        {"ts": datetime.utcnow(), "id": int(code_id)},
    )

    if other_uid and int(other_uid) != int(user.id):
        # Email is already linked to another account.
        # For MVP we allow *transfer* of the email identity ONLY if that other account
        # is "email-only" (no Telegram) and has no other identities.
        other_user = db.query(User).filter(User.id == int(other_uid)).first()
        has_tg = bool(getattr(other_user, "telegram_id", None)) if other_user else False

        other_id_cnt_row = db.execute(
            text("SELECT COUNT(*) FROM auth_identities WHERE user_id = :uid"),
            {"uid": int(other_uid)},
        ).fetchone()
        other_id_cnt = int(other_id_cnt_row[0]) if other_id_cnt_row else 0

        if has_tg or other_id_cnt > 1:
            raise HTTPException(
                status_code=409,
                detail="Этот email уже привязан к другому аккаунту и не может быть перенесён",
            )

        db.execute(
            text(
                """
                UPDATE auth_identities
                SET user_id = :new_uid
                WHERE provider = 'email' AND provider_user_id = :email
                """
            ),
            {"new_uid": int(user.id), "email": email},
        )
    else:
        _insert_identity(db, "email", email, int(user.id))

    db.commit()
    return {"ok": True}


@router.post("/auth-methods/telegram/link")
def link_telegram(payload: LinkTelegramIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from app.core.security import verify_telegram_login

    _ensure_auth_tables(db)
    raw = payload.model_dump()
    verify_telegram_login(raw)
    telegram_id = int(raw["id"])

    # Also check legacy direct column binding (users.telegram_id) in case identity row is missing.
    from app.models.user import User
    existing = db.query(User).filter(User.telegram_id == telegram_id).first()
    if existing and int(existing.id) != int(user.id):
        raise HTTPException(status_code=409, detail="Этот Telegram уже привязан к другому аккаунту")

    other_uid = _identity_user_id(db, "telegram", str(telegram_id))
    if other_uid and int(other_uid) != int(user.id):
        raise HTTPException(status_code=409, detail="Этот Telegram уже привязан к другому аккаунту")

    user.telegram_id = telegram_id
    user.username = raw.get("username") or user.username
    user.first_name = raw.get("first_name") or user.first_name
    user.last_name = raw.get("last_name") or user.last_name
    user.photo_url = raw.get("photo_url") or user.photo_url

    _insert_identity(db, "telegram", str(telegram_id), int(user.id))
    try:
        db.commit()
    except Exception as e:
        # Most common: UNIQUE constraint on users.telegram_id (if row exists without identity),
        # or uniqueness conflict in auth_identities.
        from sqlalchemy.exc import IntegrityError
        db.rollback()
        if isinstance(e, IntegrityError):
            raise HTTPException(status_code=409, detail="Этот Telegram уже привязан к другому аккаунту")
        raise
    return {"ok": True}