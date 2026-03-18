import base64
import hashlib
import os
import secrets
import smtplib
import urllib.parse
import re
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from typing import Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import create_access_token, decode_token, verify_telegram_login
from app.models.user import User
from app.routers.deps import get_db
from app.core.config import settings
from app.schemas.auth import TelegramAuthIn, TokenOut

router = APIRouter(prefix="/auth", tags=["auth"])


# -------------------------
# Small DB helpers (SQLite MVP)
# -------------------------

def _ensure_auth_tables(db: Session) -> None:
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS auth_identities (
            id SERIAL,
            provider VARCHAR(32) NOT NULL,
            provider_user_id VARCHAR(128) NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP NOT NULL,
            UNIQUE(provider, provider_user_id)
        );
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS email_login_codes (
            id SERIAL,
            email VARCHAR(320) NOT NULL,
            code VARCHAR(12) NOT NULL,
            created_at TIMESTAMP NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP
        );
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS vk_oauth_states (
            state VARCHAR(96) PRIMARY KEY,
            code_verifier VARCHAR(128) NOT NULL,
            created_at TIMESTAMP NOT NULL,
            expires_at TIMESTAMP NOT NULL
        );
    """))


def _upsert_identity(db: Session, provider: str, provider_user_id: str, user_id: int) -> None:
    row = db.execute(text("""
        SELECT user_id FROM auth_identities
        WHERE provider = :p AND provider_user_id = :pid
        LIMIT 1
    """), {"p": provider, "pid": provider_user_id}).fetchone()

    if row:
        existing_uid = int(row[0])
        if existing_uid != int(user_id):
            raise HTTPException(status_code=409, detail=f"Этот {provider} уже привязан к другому аккаунту")
        return

    db.execute(text("""
        INSERT OR IGNORE INTO auth_identities (provider, provider_user_id, user_id, created_at)
        VALUES (:p, :pid, :uid, :ts)
    """), {"p": provider, "pid": provider_user_id, "uid": user_id, "ts": datetime.utcnow()})


def _find_user_by_identity(db: Session, provider: str, provider_user_id: str) -> Optional[User]:
    row = db.execute(text("""
        SELECT user_id FROM auth_identities
        WHERE provider = :p AND provider_user_id = :pid
        LIMIT 1
    """), {"p": provider, "pid": provider_user_id}).fetchone()
    if not row:
        return None
    return db.query(User).filter(User.id == int(row[0])).one_or_none()


def _get_user_from_auth_header(db: Session, authorization: Optional[str]) -> Optional[User]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2:
        return None
    token = parts[1]
    try:
        payload = decode_token(token)
        uid = int(payload.get("sub"))
    except Exception:
        return None
    return db.query(User).filter(User.id == uid).one_or_none()


# -------------------------
# Telegram auth
# -------------------------

@router.post("/telegram", response_model=TokenOut)
def auth_telegram(data: TelegramAuthIn, db: Session = Depends(get_db)):
    raw = data.model_dump()
    verify_telegram_login(raw)

    telegram_id = int(raw["id"])
    _ensure_auth_tables(db)

    user = _find_user_by_identity(db, "telegram", str(telegram_id))
    if not user:
        user = db.query(User).filter(User.telegram_id == telegram_id).one_or_none()

    if not user:
        user = User(
            telegram_id=telegram_id,
            username=raw.get("username"),
            first_name=raw.get("first_name"),
            last_name=raw.get("last_name"),
            photo_url=raw.get("photo_url"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.telegram_id = telegram_id
        db.commit()

    _upsert_identity(db, "telegram", str(telegram_id), user.id)
    db.commit()

    token = create_access_token(str(user.id))
    return TokenOut(access_token=token)


# -------------------------
# Email auth
# -------------------------

class EmailStartIn(BaseModel):
    email: str


class EmailVerifyIn(BaseModel):
    email: str
    code: str


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="invalid email")
    return email


def _smtp_send(to_email: str, subject: str, body: str) -> None:
    host = settings.SMTP_HOST
    port = int(str(settings.SMTP_PORT))
    user = settings.SMTP_USER
    password = settings.SMTP_PASSWORD
    from_email = settings.SMTP_FROM or user

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


@router.post("/email/start")
def email_start(payload: EmailStartIn, db: Session = Depends(get_db)):
    _ensure_auth_tables(db)

    email = _normalize_email(payload.email)
    code = f"{secrets.randbelow(1000000):06d}"
    now = datetime.utcnow()
    exp = now + timedelta(minutes=15)

    db.execute(text("""
        INSERT INTO email_login_codes (email, code, created_at, expires_at, used_at)
        VALUES (:email, :code, :created, :expires, NULL)
    """), {"email": email, "code": code, "created": now, "expires": exp})
    db.commit()

    subject = "Код входа Repetitor18"
    body = f"Ваш код входа: {code}\n\nКод действует 15 минут."

    try:
        _smtp_send(email, subject, body)
    except Exception as e:
        if os.getenv("DEV_RETURN_EMAIL_CODE") == "1":
            return {"ok": True, "dev_code": code, "warning": str(e)}
        raise HTTPException(status_code=400, detail=str(e))

    return {"ok": True}



@router.post("/email/verify", response_model=TokenOut)
def email_verify(payload: EmailVerifyIn, db: Session = Depends(get_db), authorization: Optional[str] = Header(default=None)):
    _ensure_auth_tables(db)

    email = _normalize_email(payload.email)

    user = _find_user_by_identity(db, "email", email)
    if user:
        token = create_access_token(str(user.id))
        return TokenOut(access_token=token)

    current_user = _get_user_from_auth_header(db, authorization)
    if current_user:
        _upsert_identity(db, "email", email, current_user.id)
        db.commit()
        token = create_access_token(str(current_user.id))
        return TokenOut(access_token=token)

    user = User()
    db.add(user)
    db.commit()
    db.refresh(user)

    _upsert_identity(db, "email", email, user.id)
    db.commit()

    token = create_access_token(str(user.id))
    return TokenOut(access_token=token)


# -------------------------
# VK OAuth
# -------------------------

from fastapi import Request as FastapiRequest
from fastapi.responses import RedirectResponse


class VkFinishIn(BaseModel):
    code: str
    state: str
    device_id: Optional[str] = None


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _pkce_pair() -> Tuple[str, str]:
    verifier = _b64url(os.urandom(32))
    challenge = _b64url(hashlib.sha256(verifier.encode("utf-8")).digest())
    return verifier, challenge


def _vk_base() -> str:
    return (os.getenv("VK_ID_BASE_URL") or "https://id.vk.com").rstrip("/")


@router.get("/vk/start")
def vk_start(req: FastapiRequest, db: Session = Depends(get_db)):
    _ensure_auth_tables(db)

    client_id = os.getenv("VK_CLIENT_ID")
    redirect_uri = os.getenv("VK_REDIRECT_URI")

    state = secrets.token_urlsafe(24)
    verifier, challenge = _pkce_pair()

    now = datetime.utcnow()
    exp = now + timedelta(minutes=15)

    db.execute(text("""
        INSERT INTO vk_oauth_states (state, code_verifier, created_at, expires_at)
        VALUES (:state, :verifier, :created, :expires)
    """), {"state": state, "verifier": verifier, "created": now, "expires": exp})
    db.commit()

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "scope": os.getenv("VK_SCOPE") or "vkid.personal_info",
    }

    authorize_url = _vk_base() + "/authorize?" + urllib.parse.urlencode(params)
    return RedirectResponse(authorize_url, status_code=302)


@router.post("/vk/finish", response_model=TokenOut)
def vk_finish(
    payload: VkFinishIn,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    """
    Exchange VK authorization_code for tokens (PKCE), fetch VK profile and either:
    - log in existing user with vk identity
    - link vk identity to current user (if Authorization: Bearer ... provided)
    - create a new user and attach vk identity
    """
    _ensure_auth_tables(db)

    client_id = os.getenv("VK_CLIENT_ID")
    client_secret = os.getenv("VK_CLIENT_SECRET")  # optional for PKCE public clients
    redirect_uri = os.getenv("VK_REDIRECT_URI")

    if not client_id or not redirect_uri:
        raise HTTPException(status_code=500, detail="VK OAuth не настроен: VK_CLIENT_ID/VK_REDIRECT_URI")

    # Validate state + get code_verifier
    row = db.execute(
        text(
            """
            SELECT code_verifier, expires_at
            FROM vk_oauth_states
            WHERE state = :state
            LIMIT 1
            """
        ),
        {"state": payload.state},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Неверный state (возможно, уже использован или истёк)")

    code_verifier = str(row[0])
    expires_at = row[1]
    try:
        if expires_at and datetime.utcnow() > expires_at:
            # cleanup
            db.execute(text("DELETE FROM vk_oauth_states WHERE state = :state"), {"state": payload.state})
            db.commit()
            raise HTTPException(status_code=400, detail="Истёк state (повторите вход через VK)")
    except HTTPException:
        raise
    except Exception:
        # if expires_at type differs, ignore strict compare
        pass

    # One-time use: delete state row to avoid replay
    db.execute(text("DELETE FROM vk_oauth_states WHERE state = :state"), {"state": payload.state})
    db.commit()

    if not payload.device_id:
        raise HTTPException(status_code=400, detail="От VK не пришёл device_id")

    # Exchange code -> tokens
    token_url = _vk_base() + "/oauth2/auth"
    form = {
        "grant_type": "authorization_code",
        "code": payload.code,
        "code_verifier": code_verifier,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "device_id": payload.device_id,
        "state": payload.state,
        # VK API version (commonly required by VK endpoints)
        "v": os.getenv("VK_API_VERSION") or "5.199",
    }
    if client_secret:
        form["client_secret"] = client_secret

    try:
        resp = httpx.post(token_url, data=form, timeout=15.0)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"VK token exchange error: {e}")

    try:
        tok = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail=f"VK token exchange bad response: {resp.text[:500]}")

    if resp.status_code >= 400 or tok.get("error"):
        detail = tok.get("error_description") or tok.get("error") or resp.text
        raise HTTPException(status_code=400, detail=f"VK token exchange failed: {detail}")

    access_token = tok.get("access_token")
    vk_user_id = tok.get("user_id") or tok.get("sub")
    if not access_token:
        raise HTTPException(status_code=400, detail="VK не вернул access_token")

    # Fetch user info (prefer VK ID user_info endpoint)
    vk_profile = {}
    try:
        ui_resp = httpx.post(
            _vk_base() + "/oauth2/user_info",
            data={"client_id": client_id, "access_token": access_token},
            timeout=15.0,
        )
        if ui_resp.status_code < 400:
            vk_profile = ui_resp.json() or {}
    except Exception:
        vk_profile = {}

    # Extract user fields (be tolerant to different response shapes)
    user_obj = None
    if isinstance(vk_profile, dict):
        user_obj = vk_profile.get("user") or vk_profile.get("data") or vk_profile.get("response")

    if isinstance(user_obj, list) and user_obj:
        user_obj = user_obj[0]

    if isinstance(user_obj, dict):
        vk_user_id = vk_user_id or user_obj.get("user_id") or user_obj.get("id") or user_obj.get("sub")
        first_name = user_obj.get("first_name") or user_obj.get("given_name")
        last_name = user_obj.get("last_name") or user_obj.get("family_name")
        photo_url = (
            user_obj.get("photo")
            or user_obj.get("photo_200")
            or user_obj.get("photo_max")
            or user_obj.get("picture")
        )
        username = user_obj.get("username") or user_obj.get("screen_name")
    else:
        first_name = last_name = photo_url = username = None

    if not vk_user_id:
        raise HTTPException(status_code=400, detail="Не удалось определить VK user_id")

    provider_user_id = str(vk_user_id)

    # Case 1: login existing vk identity
    user = _find_user_by_identity(db, "vk", provider_user_id)
    if user:
        # Best-effort profile fill
        if first_name and not user.first_name:
            user.first_name = first_name
        if last_name and not user.last_name:
            user.last_name = last_name
        if photo_url and not user.photo_url:
            user.photo_url = photo_url
        if username and not user.username:
            user.username = username
        db.commit()
        token = create_access_token(str(user.id))
        return TokenOut(access_token=token)

    # Case 2: link to current logged-in user (Authorization header passed)
    current_user = _get_user_from_auth_header(db, authorization)
    if current_user:
        _upsert_identity(db, "vk", provider_user_id, current_user.id)
        # Best-effort profile fill
        if first_name and not current_user.first_name:
            current_user.first_name = first_name
        if last_name and not current_user.last_name:
            current_user.last_name = last_name
        if photo_url and not current_user.photo_url:
            current_user.photo_url = photo_url
        if username and not current_user.username:
            current_user.username = username
        db.commit()
        token = create_access_token(str(current_user.id))
        return TokenOut(access_token=token)

    # Case 3: create new user
    user = User(
        first_name=first_name,
        last_name=last_name,
        username=username,
        photo_url=photo_url,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _upsert_identity(db, "vk", provider_user_id, user.id)
    db.commit()

    token = create_access_token(str(user.id))
    return TokenOut(access_token=token)
