"""Runtime settings resolved from the DB first, then .env defaults.

Lets admins configure notification channels from the UI without editing files.
Keys mirror the .env names so either source works.
"""
from .config import settings as env
from .db import SessionLocal
from .models import Setting

# key -> env fallback value
DEFAULTS = {
    "DISCORD_WEBHOOK": env.DISCORD_WEBHOOK,
    "TELEGRAM_BOT_TOKEN": env.TELEGRAM_BOT_TOKEN,
    "TELEGRAM_CHAT_ID": env.TELEGRAM_CHAT_ID,
    "LINE_CHANNEL_ACCESS_TOKEN": env.LINE_CHANNEL_ACCESS_TOKEN,
    "LINE_CHANNEL_SECRET": env.LINE_CHANNEL_SECRET,
    "LINE_NOTIFY_TARGET": env.LINE_NOTIFY_TARGET,
}
# keys that must never be returned to the browser in full
SECRET_KEYS = {"DISCORD_WEBHOOK", "TELEGRAM_BOT_TOKEN",
               "LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"}


def get(key: str) -> str:
    with SessionLocal() as s:
        row = s.get(Setting, key)
        if row and row.value is not None and row.value != "":
            return row.value
    return DEFAULTS.get(key, "")


def get_many(keys) -> dict:
    return {k: get(k) for k in keys}


def set_many(values: dict):
    with SessionLocal() as s:
        for k, v in values.items():
            row = s.get(Setting, k)
            if row:
                row.value = v or ""
            else:
                s.add(Setting(key=k, value=v or ""))
        s.commit()


def masked() -> dict:
    """Return current config for the UI, secrets shown only as 'set / not set'."""
    out = {}
    for k in DEFAULTS:
        v = get(k)
        if k in SECRET_KEYS:
            out[k] = {"set": bool(v)}
        else:
            out[k] = {"value": v}
    return out
