"""Email notification duplication (best-effort).

Sends emails ONLY when a user has an email auth method connected.

This module must never crash app startup.
It supports both legacy and new auth_identities schemas.

SMTP settings are taken from environment variables primarily, because the project
may not expose SMTP fields on `settings` object.

Env vars used:
- SMTP_HOST
- SMTP_PORT (default 587)
- SMTP_USER
- SMTP_PASSWORD
- SMTP_FROM (default SMTP_USER)
"""

import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# Backward-compat export: some routers may import ResponseTutorOut from here.
try:
    from app.schemas.response import ResponseTutorOut  # noqa: F401
except Exception:  # pragma: no cover
    ResponseTutorOut = None  # type: ignore

logger = logging.getLogger("email")


def _auth_identities_columns(db: Session) -> set:
    try:
        rows = db.execute(text("PRAGMA table_info(auth_identities)")).fetchall()
        return {str(r[1]) for r in rows}  # r[1] = name
    except Exception:
        return set()


def _get_connected_email(db: Session, user_id: int) -> Optional[str]:
    """Return user's email if email auth is connected.

    Works with BOTH schemas:
    - legacy: provider_user_id stores email
    - newer: email_normalized + is_verified
    """
    cols = _auth_identities_columns(db)

    # Prefer the new schema if present.
    if "email_normalized" in cols and "is_verified" in cols:
        row = db.execute(
            text(
                """
                SELECT email_normalized
                FROM auth_identities
                WHERE user_id = :uid AND provider = 'email' AND is_verified = 1
                ORDER BY id DESC
                LIMIT 1
                """
            ),
            {"uid": user_id},
        ).fetchone()
        email = (row[0] if row else None) or None
        if email:
            email = str(email).strip().lower()
            return email or None
        # fall through: maybe legacy rows without verification flag set

    # Legacy schema (or unverified rows): provider_user_id carries email.
    row = db.execute(
        text(
            """
            SELECT provider_user_id
            FROM auth_identities
            WHERE user_id = :uid AND provider = 'email'
            ORDER BY id DESC
            LIMIT 1
            """
        ),
        {"uid": user_id},
    ).fetchone()

    email = (row[0] if row else None) or None
    if not email:
        return None
    email = str(email).strip().lower()
    return email or None


def _smtp_send(to_email: str, subject: str, body: str) -> None:
    host = (os.getenv("SMTP_HOST") or "").strip()
    port = int((os.getenv("SMTP_PORT") or "587").strip() or "587")
    user = (os.getenv("SMTP_USER") or "").strip()
    password = os.getenv("SMTP_PASSWORD") or ""
    from_email = (os.getenv("SMTP_FROM") or user).strip()

    if not host or not from_email:
        raise RuntimeError("SMTP is not configured (SMTP_HOST/SMTP_FROM missing)")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(body)

    # Port 465 typically uses SSL; 25 often plain; 587 STARTTLS
    if port == 465:
        s = smtplib.SMTP_SSL(host, port, timeout=20)
    else:
        s = smtplib.SMTP(host, port, timeout=20)

    try:
        s.ehlo()
        if port != 25 and port != 465:
            # try STARTTLS on submission ports
            try:
                s.starttls()
                s.ehlo()
            except Exception:
                pass

        # Some providers do AUTH on 25, some don't. We'll try if creds are present.
        if user and password:
            try:
                s.login(user, password)
            except Exception:
                # allow sending without AUTH if server permits
                pass

        s.send_message(msg)
    finally:
        try:
            s.quit()
        except Exception:
            pass


def try_send_notification_email(db: Session, user_id: int, subject: str, body: str) -> bool:
    """Best-effort email duplication.

    Returns True if an email was sent successfully.
    Returns False if email auth isn't connected or sending failed.
    """
    try:
        to_email = _get_connected_email(db, user_id)
        if not to_email:
            return False

        _smtp_send(to_email, subject, body)
        logger.info("[EMAIL] notification sent to %s (user_id=%s)", to_email, user_id)
        return True
    except Exception as e:
        logger.exception("[EMAIL] notification failed for user_id=%s: %s", user_id, e)
        return False
