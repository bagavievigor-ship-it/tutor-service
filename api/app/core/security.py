import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from jose import jwt
from fastapi import HTTPException, status

from app.core.config import settings


ALGORITHM = "HS256"


def create_access_token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.JWT_TTL_MINUTES)
    payload = {"sub": sub, "iat": int(now.timestamp()), "exp": int(exp.timestamp())}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def verify_telegram_login(data: Dict[str, Any]) -> None:
    """
    Проверка Telegram Login Widget.
    Telegram присылает поля + hash. Мы:
      1) берём все поля кроме hash
      2) сортируем по key
      3) собираем "key=value\n..."
      4) secret_key = sha256(bot_token)
      5) сравниваем HMAC-SHA256(data_check_string, secret_key) с hash
    """
    if "hash" not in data:
        raise HTTPException(status_code=400, detail="Telegram data missing hash")

    received_hash = str(data["hash"])

    pairs = []
    for k, v in data.items():
        if k == "hash":
            continue
        if v is None:
            continue
        pairs.append(f"{k}={v}")
    pairs.sort()
    data_check_string = "\n".join(pairs).encode("utf-8")

    secret_key = hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode("utf-8")).digest()
    calculated_hash = hmac.new(secret_key, data_check_string, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise HTTPException(status_code=401, detail="Telegram login verification failed")
