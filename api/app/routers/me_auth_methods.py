import os
import re
import secrets
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.user import User
from app.routers.deps import get_current_user, get_db

router = APIRouter(prefix="/me/auth-methods", tags=["me"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(raw: str) -> str:
    if raw is None:
        raise HTTPException(status_code=400, detail="email is required")
    email = raw.strip().lower()
    if len(email) < 3 or len(email) > 254 or not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="invalid email")
    return email


def _smtp_send(to_email: str, subject: str, body: str) -> None:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("SMTP_FROM") or user

    if not host or not user or not password or not from_email:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM"
        )

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email

    with smtplib.SMTP(host, port, timeout=15) as server:
        server.ehlo()
        if port == 587:
            server.starttls()
            server.ehlo()
        server.login(user, password)
        server.sendmail(from_email, [to_email], msg.as_string())


# -------------------------------------------------------------------
# DB helpers (we keep raw SQL for SQLite MVP compatibility)
# -------------------------------------------------------------------

def _ensure_auth_tables(db: Session) -> None:
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


def _identity_user_id(db: Session, provider: str, provider_user_id: str) -> Optional[int]:
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
    return int(row[0]) if row else None


def _upsert_identity(db: Session, provider: str, provider_user_id: str, user_id: int) -> None:
    try:
        db.execute(
            text(
                """
                INSERT INTO auth_identities (provider, provider_user_id, user_id, created_at)
                VALUES (:p, :pid, :uid, :ts)
                """
            ),
            {"p": provider, "pid": provider_user_id, "uid": user_id, "ts": datetime.utcnow()},
        )
    except Exception:
        # unique constraint
        db.execute(
            text(
                """
                UPDATE auth_identities
                SET user_id = :uid
                WHERE provider = :p AND provider_user_id = :pid
                """
            ),
            {"p": provider, "pid": provider_user_id, "uid": user_id},
        )


def _merge_users(db: Session, src_user_id: int, dst_user_id: int) -> None:
    """Move all domain data from src_user_id -> dst_user_id and delete src user.

    MVP-safe: updates the most common FK columns.
    """
    if src_user_id == dst_user_id:
        return

    # Move FK references
    fk_updates = [
        ("requests", "author_user_id"),
        ("threads", "author_user_id"),
        ("threads", "tutor_user_id"),
        ("responses", "from_user_id"),
        ("offers", "to_tutor_user_id"),
        ("assignments", "tutor_user_id"),
        ("messages", "sender_user_id"),
        ("notifications", "user_id"),
        ("tg_link_tokens", "user_id"),
    ]
    for table, col in fk_updates:
        db.execute(
            text(f"UPDATE {table} SET {col} = :dst WHERE {col} = :src"),
            {"src": src_user_id, "dst": dst_user_id},
        )

    # Tutor profile is 1:1 (unique user_id)
    # If dst has no profile and src has one -> move it. If both -> keep dst.
    src_prof = db.execute(
        text("SELECT id FROM tutor_profiles WHERE user_id = :src LIMIT 1"), {"src": src_user_id}
    ).fetchone()
    dst_prof = db.execute(
        text("SELECT id FROM tutor_profiles WHERE user_id = :dst LIMIT 1"), {"dst": dst_user_id}
    ).fetchone()
    if src_prof and not dst_prof:
        db.execute(
            text("UPDATE tutor_profiles SET user_id = :dst WHERE user_id = :src"),
            {"src": src_user_id, "dst": dst_user_id},
        )
    elif src_prof and dst_prof:
        # keep dst, drop src profile to avoid UNIQUE clash
        db.execute(text("DELETE FROM tutor_profiles WHERE user_id = :src"), {"src": src_user_id})

    # Finally delete the src user (identities will be repointed separately)
    db.execute(text("DELETE FROM users WHERE id = :src"), {"src": src_user_id})


class AuthMethodOut(BaseModel):
    provider: str
    label: str
    is_linked: bool


@router.get("", response_model=List[AuthMethodOut])
def list_methods(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_auth_tables(db)

    # Telegram is considered linked if telegram identity exists OR legacy users.telegram_id
    tg_linked = bool(user.telegram_id) or bool(_identity_user_id(db, "telegram", str(user.telegram_id or "")))

    email_row = db.execute(
        text(
            """
            SELECT provider_user_id FROM auth_identities
            WHERE provider='email' AND user_id=:uid
            LIMIT 1
            """
        ),
        {"uid": user.id},
    ).fetchone()
    email_linked = bool(email_row)

    vk_row = db.execute(
        text(
            """
            SELECT provider_user_id FROM auth_identities
            WHERE provider='vk' AND user_id=:uid
            LIMIT 1
            """
        ),
        {"uid": user.id},
    ).fetchone()
    vk_linked = bool(vk_row)

    out = [
        AuthMethodOut(provider="telegram", label="Вход через Telegram", is_linked=tg_linked),
        AuthMethodOut(
            provider="email",
            label=(f"Email: {email_row[0]}" if email_row else "Вход по email-коду"),
            is_linked=email_linked,
        ),
        AuthMethodOut(
            provider="vk",
            label=(f"VK: {vk_row[0]}" if vk_row else "Вход через VK"),
            is_linked=vk_linked,
        ),
    ]
    return out


class EmailStartIn(BaseModel):
    email: str


class EmailVerifyIn(BaseModel):
    email: str
    code: str


@router.post("/email/start")
def link_email_start(payload: EmailStartIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_auth_tables(db)

    email = _normalize_email(payload.email)
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

    subject = "Код привязки Repetitor18"
    body = f"Ваш код подтверждения: {code}\n\nКод действует 15 минут."

    try:
        _smtp_send(email, subject, body)
    except Exception as e:
        if os.getenv("DEV_RETURN_EMAIL_CODE") == "1":
            return {"ok": True, "dev_code": code, "warning": str(e)}
        raise HTTPException(status_code=400, detail=str(e))

    return {"ok": True}


@router.post("/email/verify")
def link_email_verify(payload: EmailVerifyIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_auth_tables(db)

    email = _normalize_email(payload.email)
    code = payload.code.strip()

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

    # SQLite may return string
    if isinstance(expires_at, str):
        try:
            expires_at_dt = datetime.fromisoformat(expires_at)
        except Exception:
            expires_at_dt = datetime.strptime(expires_at, "%Y-%m-%d %H:%M:%S")
    else:
        expires_at_dt = expires_at

    if expires_at_dt < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Code expired")

    # mark used
    db.execute(
        text("UPDATE email_login_codes SET used_at = :ts WHERE id = :id"),
        {"ts": datetime.utcnow(), "id": code_id},
    )

    # If this email already belongs to a different user, merge that user into current
    existing_uid = _identity_user_id(db, "email", email)
    if existing_uid and existing_uid != user.id:
        # Move all identities from existing_uid to current user, then merge data
        db.execute(
            text(
                """
                UPDATE auth_identities
                SET user_id = :dst
                WHERE user_id = :src
                """
            ),
            {"src": existing_uid, "dst": user.id},
        )
        _merge_users(db, existing_uid, user.id)

    # Link (or relink) email to current user
    _upsert_identity(db, "email", email, user.id)

    db.commit()
    return {"ok": True}
