"""Central configuration. All values can be overridden from a .env file
placed next to run.bat — non-technical users never edit code, only .env."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"
WEB_DIR = BASE_DIR / "web"
DATA_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)


def _load_env():
    env = BASE_DIR / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


_load_env()


class Settings:
    APP_NAME = os.getenv("APP_NAME", "AHR Maintenance Inventory")
    # DB_URL: default local SQLite; on a host set DB_URL to a Postgres URL.
    # Many hosts hand out "postgres://..." which SQLAlchemy 2.x doesn't accept,
    # so normalize it to the psycopg2 driver form.
    _db_url = os.getenv("DB_URL", f"sqlite:///{DATA_DIR / 'inventory.db'}")
    if _db_url.startswith("postgres://"):
        _db_url = _db_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif _db_url.startswith("postgresql://"):
        _db_url = _db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    DB_URL = _db_url
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-.env-please-use-a-long-random-string")
    TOKEN_HOURS = int(os.getenv("TOKEN_HOURS", "12"))
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "8770"))

    # Reorder tuning
    REORDER_BUFFER = float(os.getenv("REORDER_BUFFER", "0"))     # extra units above reorder point still "watch"
    DEAD_STOCK_DAYS = int(os.getenv("DEAD_STOCK_DAYS", "365"))

    # End-of-day summary time (24h, local)
    EOD_HOUR = int(os.getenv("EOD_HOUR", "18"))
    EOD_MINUTE = int(os.getenv("EOD_MINUTE", "0"))
    TIMEZONE = os.getenv("TIMEZONE", "Asia/Bangkok")

    # Optional: full path to the MiniZinc executable (else looked up on PATH)
    MINIZINC_PATH = os.getenv("MINIZINC_PATH", "")

    # Notification channels — leave blank to disable a channel
    DISCORD_WEBHOOK = os.getenv("DISCORD_WEBHOOK", "")
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
    LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
    LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET", "")
    LINE_NOTIFY_TARGET = os.getenv("LINE_NOTIFY_TARGET", "")  # group/user id to push summaries to


settings = Settings()
