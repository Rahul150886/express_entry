"""
Infrastructure — Config, Blob Storage, Notifications
"""

# ─── infrastructure/config.py ───────────────

import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings

# Explicitly load .env from the backend directory
# This works regardless of which directory the process is started from
_backend_dir = Path(__file__).resolve().parent.parent  # infrastructure/ -> backend/
_env_file = _backend_dir / ".env"

try:
    from dotenv import load_dotenv
    if _env_file.exists():
        load_dotenv(_env_file, override=False)
except ImportError:
    pass


class Settings(BaseSettings):
    # App
    APP_NAME: str = "ExpressEntryPR"
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-in-production"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/express_entry"
    DATABASE_POOL_SIZE: int = 10

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # Azure OpenAI
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-4o"
    AZURE_OPENAI_API_VERSION: str = "2024-08-01-preview"

    # Azure Document Intelligence
    AZURE_DOC_INTELLIGENCE_KEY: str = ""
    AZURE_DOC_INTELLIGENCE_ENDPOINT: str = ""

    # Azure Blob Storage
    AZURE_STORAGE_CONNECTION_STRING: str = ""
    AZURE_STORAGE_CONTAINER: str = "express-entry-documents"

    # Auth
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Notifications
    SENDGRID_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@expressentry.app"
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE: str = ""
    FIREBASE_CREDENTIALS_PATH: str = "firebase-credentials.json"

    # ChromaDB
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8001

    # IRCC Monitor
    IRCC_DRAW_URL: str = "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html"
    DRAW_MONITOR_INTERVAL_MINUTES: int = 30

    # Sentry
    SENTRY_DSN: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

    @property
    def azure_openai_endpoint_clean(self) -> str:
        """Strip any accidental '* ' prefix from the endpoint value."""
        return self.AZURE_OPENAI_ENDPOINT.lstrip('* ').strip()


@lru_cache()
def get_settings() -> Settings:
    s = Settings()

    # ── Emit a clear config health summary at startup ──
    try:
        from loguru import logger

        ok  = "✓"
        bad = "✗ MISSING"

        logger.info("=" * 60)
        logger.info("CONFIG HEALTH CHECK")
        logger.info("=" * 60)
        logger.info(f"  APP_ENV              : {s.APP_ENV}")
        logger.info(f"  DEBUG                : {s.DEBUG}")
        logger.info(f"  SECRET_KEY           : {'[CHANGED]' if s.SECRET_KEY != 'change-in-production' else '⚠ DEFAULT — change before deploying!'}")
        logger.info(f"  DATABASE_URL         : {s.DATABASE_URL[:55]}...")
        logger.info(f"  REDIS_URL            : {s.REDIS_URL}")
        logger.info(f"  CELERY_BROKER_URL    : {s.CELERY_BROKER_URL}")
        logger.info(f"  CHROMA               : {s.CHROMA_HOST}:{s.CHROMA_PORT}")

        # Azure services — required for full functionality
        logger.info("  ── Azure services ──")
        logger.info(f"  AZURE_OPENAI_KEY     : {ok if s.AZURE_OPENAI_API_KEY else bad + ' — AI chat/NOC/CRS improvements will return 503'}")
        logger.info(f"  AZURE_OPENAI_ENDPOINT: {ok if s.AZURE_OPENAI_ENDPOINT else bad}")
        logger.info(f"  AZURE_OPENAI_DEPLOY  : {s.AZURE_OPENAI_DEPLOYMENT}")
        logger.info(f"  AZURE_DOC_INTEL_KEY  : {ok if s.AZURE_DOC_INTELLIGENCE_KEY else bad + ' — document AI extraction disabled'}")
        logger.info(f"  AZURE_BLOB_STORAGE   : {ok if s.AZURE_STORAGE_CONNECTION_STRING else bad + ' — using local disk /tmp/express_entry_uploads'}")

        # Notification services — graceful degradation
        logger.info("  ── Notification services ──")
        logger.info(f"  SENDGRID_API_KEY     : {ok if s.SENDGRID_API_KEY else bad + ' — emails silently skipped'}")
        logger.info(f"  TWILIO_ACCOUNT_SID   : {ok if s.TWILIO_ACCOUNT_SID else bad + ' — SMS silently skipped'}")
        logger.info(f"  FIREBASE_CREDS       : {ok if s.FIREBASE_CREDENTIALS_PATH else bad + ' — push notifications silently skipped'}")
        logger.info(f"  SENTRY_DSN           : {ok if s.SENTRY_DSN else bad + ' — error tracking disabled'}")
        logger.info("=" * 60)

        # Raise early if completely broken
        if "localhost" in s.DATABASE_URL and s.APP_ENV == "production":
            logger.error("DATABASE_URL points to localhost in production — this will fail!")

    except ImportError:
        pass  # loguru not yet installed during import resolution

    return s