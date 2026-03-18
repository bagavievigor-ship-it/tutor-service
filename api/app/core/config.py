from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_ENV: str = "dev"

    DATABASE_URL: str = "postgresql://repetitor:GVUkvuk3682%+d@localhost/repetitor18"

    JWT_SECRET: str
    JWT_TTL_MINUTES: int = 43200  # 30 days

    TELEGRAM_BOT_TOKEN: str

    # Internal token for bot<->API calls (linking Telegram chat_id, sending pending notifications).
    # If empty, TURBO_SHARED_SECRET will be used as a fallback (MVP).
    TELEGRAM_INTERNAL_TOKEN: str = ""

    TURBO_ENDPOINT: str = "https://api.repetitor18.ru/internal/turbo"
    TURBO_SHARED_SECRET: str
    APP_PUBLIC_URL: str = "https://app.repetitor18.ru"
    API_PUBLIC_URL: str = "https://api.app.repetitor18.ru"

    # VK ID OAuth (id.vk.ru)
    VKID_CLIENT_ID: str = ""
    VKID_CLIENT_SECRET: str = ""
    VKID_SCOPE: str = "vkid.personal_info email"
    # Redirect URI must match VK ID app settings; should point to frontend login page.
    VKID_REDIRECT_URI: str = "https://app.repetitor18.ru/login"

    class Config:
        env_file = "/opt/repetitor_app_api/.env"
        extra = "ignore"


settings = Settings()
