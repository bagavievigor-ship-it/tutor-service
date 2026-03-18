import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("email")


def send_login_code(email_to: str, code: str) -> None:
    """Send a one-time login code.

    If SMTP is not configured, we only log the code (useful for early MVP).
    """

    if not settings.SMTP_HOST:
        logger.warning("[EMAIL] SMTP_HOST is empty. Login code for %s is: %s", email_to, code)
        return

    msg = EmailMessage()
    msg["Subject"] = "Код входа Repetitor18"
    msg["From"] = settings.SMTP_FROM
    msg["To"] = email_to
    msg.set_content(
        """Ваш код входа в Repetitor18:\n\n{code}\n\n"
        "Код действует ограниченное время. Если это были не вы — просто проигнорируйте письмо.\n""".format(
            code=code
        )
    )

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as s:
        s.ehlo()
        try:
            s.starttls()
            s.ehlo()
        except Exception:
            # Some servers may not support STARTTLS
            pass

        if settings.SMTP_USER:
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

        s.send_message(msg)
