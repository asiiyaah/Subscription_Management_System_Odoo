from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    APP_NAME: str = "SubscriptIQ"
    APP_ENV: str = "development"
    DEBUG: bool = True

    DATABASE_URL: str
    SECRET_KEY: str

    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    AI_PROVIDER: str = "gemini"
    AI_API_KEY: str = ""
    AI_MODEL: str = ""
    AI_BASE_URL: str = ""
    AI_TEMPERATURE: float = Field(default=0.3, ge=0, le=2)
    AI_MAX_TOKENS: int = Field(default=2048, ge=128, le=32768)
    AI_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=120)
    AI_TURN_TIMEOUT_SECONDS: int = Field(default=50, ge=1, le=120)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    FRONTEND_URL: str = "http://localhost:5173"

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_STARTTLS: bool = True

    # Customers must confirm their email before logging in. Off by default so the app works without SMTP.
    REQUIRE_EMAIL_VERIFICATION: bool = False
    INVITE_LINK_TTL_HOURS: int = 48
    ENABLE_AUTOMATION: bool = False
    AUTO_GENERATE_DUE_INVOICES: bool = False
    AUTO_CLOSE_EXPIRED_SUBSCRIPTIONS: bool = False

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
