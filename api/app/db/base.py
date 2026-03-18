# noqa: F401
from app.db.base_class import Base

from app.models.user import User
from app.models.tutor_profile import TutorProfile
from app.models.request import Request
from app.models.response import Response
from app.models.notification import Notification
from app.models.tg_link_token import TgLinkToken

# ✅ ВАЖНО: чтобы create_all создавал таблицы threads/messages
from app.models.thread import Thread
from app.models.message import Message

# offers (предложения заявок репетиторам)
from app.models.offer import Offer


# auth identities (multi-provider login)
from app.models.auth_identity import AuthIdentity
from app.models.vk_oauth_state import VkOAuthState
