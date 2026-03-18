from datetime import datetime
from typing import Optional, Tuple

import httpx

from app.core.config import settings


def commission_text(
    commission_type: Optional[str],
    commission_value: Optional[int],
    currency: Optional[str],
) -> Optional[str]:
    # MVP: комиссия может быть произвольной строкой (например "2 занятия", "половина оплаты", "по договорённости").
    if not commission_type:
        return None

    # Старый формат (число + тип) тоже поддерживаем для совместимости.
    if not commission_value:
        return ("Комиссия: %s" % commission_type).strip()

    if commission_type == "lessons":
        if commission_value == 1:
            return "Комиссия: 1 занятие"
        return "Комиссия: %d занятия" % commission_value

    # fixed
    symbol = "₽" if currency == "RUB" else (currency or "")
    return ("Комиссия: %d %s" % (commission_value, symbol)).strip()



async def try_send_turbo(payload: dict) -> Tuple[str, Optional[datetime]]:
    """
    Возвращает (status, sent_at)
      status: sent | pending | failed
    """
    headers = {"X-APP-SECRET": settings.TURBO_SHARED_SECRET}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(settings.TURBO_ENDPOINT, json=payload, headers=headers)

        if r.status_code in (404, 501):
            return "pending", None
        if r.status_code in (401, 403):
            return "failed", None
        if 200 <= r.status_code < 300:
            return "sent", datetime.utcnow()

        return "pending", None
    except Exception:
        return "pending", None
