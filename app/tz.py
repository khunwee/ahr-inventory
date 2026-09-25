"""Time-zone helpers.

All timestamps are STORED as naive UTC (datetime.utcnow()). Anything shown to
people, grouped by day, or filtered by a calendar date must use the factory's
local time zone (settings.TIMEZONE, default Asia/Bangkok) — cloud servers such
as Render run on UTC, which previously shifted times by 7 hours.
"""
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo
from .config import settings

try:
    TZ = ZoneInfo(settings.TIMEZONE)
except Exception:          # bad name / missing tzdata -> fixed UTC+7
    TZ = timezone(timedelta(hours=7))


def local_now() -> datetime:
    return datetime.now(TZ)


def local_today() -> date:
    return local_now().date()


def to_local(dt_utc_naive):
    """naive-UTC datetime -> naive local datetime (for formatting/grouping)."""
    if dt_utc_naive is None:
        return None
    return dt_utc_naive.replace(tzinfo=timezone.utc).astimezone(TZ).replace(tzinfo=None)


def utc_range(d_from: date, d_to: date):
    """Local calendar dates (inclusive) -> naive-UTC [start, end] bounds."""
    start = datetime.combine(d_from, datetime.min.time()).replace(tzinfo=TZ)
    end = datetime.combine(d_to, datetime.max.time()).replace(tzinfo=TZ)
    return (start.astimezone(timezone.utc).replace(tzinfo=None),
            end.astimezone(timezone.utc).replace(tzinfo=None))


def fmt_local(dt_utc_naive, pattern="%d/%m/%Y %H:%M"):
    x = to_local(dt_utc_naive)
    return x.strftime(pattern) if x else ""
