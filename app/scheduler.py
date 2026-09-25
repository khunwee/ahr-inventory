"""Scheduled jobs: end-of-day summary, daily DB backup, daily Oracle export."""
from datetime import datetime, date
from pathlib import Path
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from .config import settings, BASE_DIR
from .db import engine, urgency_of, SessionLocal
from .models import Requisition, ReqLine, Item
from .notifications import notify
from .backup import run_backup
from .tz import local_today, utc_range, fmt_local

_scheduler = None
EXPORT_DIR = BASE_DIR / "exports"


def build_eod_report() -> str:
    with SessionLocal() as s:
        start = utc_range(local_today(), local_today())[0]
        reqs = s.exec(select(Requisition).where(
            Requisition.created_at >= start,
            Requisition.status.in_(["confirmed", "reconciled"]))).all()
        n_lines = 0
        for r in reqs:
            n_lines += len(s.exec(select(ReqLine).where(ReqLine.requisition_id == r.id)).all())
        items = s.exec(select(Item)).all()
        flagged = sorted(((it, urgency_of(it)) for it in items if urgency_of(it)),
                         key=lambda x: {"critical": 0, "high": 1, "watch": 2}.get(x[1], 9))
    lines = [f"📊 สรุปสิ้นวัน {local_today():%d/%m/%Y}",
             f"การเบิกวันนี้: {len(reqs)} ใบ / {n_lines} รายการ"]
    if flagged:
        lines.append(f"\n⚠️ ต้องสั่งซื้อ ({len(flagged)} รายการ):")
        for it, urg in flagged[:25]:
            lines.append(f"[{urg.upper()}] {it.item_code} คงเหลือ {it.on_hand:g} "
                         f"/ ROP {it.reorder_point:g} — {it.part_name[:30]}")
        if len(flagged) > 25:
            lines.append(f"...และอีก {len(flagged) - 25} รายการ (ดูในเว็บ)")
    else:
        lines.append("✅ ไม่มีรายการที่ต้องสั่งซื้อ")
    return "\n".join(lines)


async def _run_eod():
    await notify("eod.summary", build_eod_report(), channels=("discord", "telegram", "line", "ws"))


def export_today_oracle() -> str:
    """Write today's confirmed issues to exports/oracle_<date>.xlsx."""
    from openpyxl import Workbook
    EXPORT_DIR.mkdir(exist_ok=True)
    today = local_today()
    with SessionLocal() as s:
        reqs = s.exec(select(Requisition).where(
            Requisition.status.in_(["confirmed", "reconciled"]),
            Requisition.created_at >= utc_range(today, today)[0],
            Requisition.created_at <= utc_range(today, today)[1])).all()
        wb = Workbook(); ws = wb.active; ws.title = "Issues"
        ws.append(["RefNo", "Date", "ItemCode", "Description", "Qty", "UOM",
                   "Machine", "Problem", "Requester", "UnitPrice", "Amount"])
        for r in reqs:
            for l in s.exec(select(ReqLine).where(ReqLine.requisition_id == r.id)).all():
                it = s.get(Item, l.item_id)
                price = it.unit_price if it else 0
                ws.append([r.ref_no, fmt_local(r.created_at, "%d/%m/%Y %H:%M"), l.item_code,
                           l.description, l.qty, it.uom if it else "", r.machine_name,
                           r.problem, r.requester_name, price, round(l.qty * price, 2)])
    dest = EXPORT_DIR / f"oracle_{today:%Y%m%d}.xlsx"
    wb.save(dest)
    return dest.name


def _run_export():
    try:
        export_today_oracle()
    except Exception as e:
        print(f"[scheduler] export failed: {e}")


def _run_backup():
    try:
        run_backup()
    except Exception as e:
        print(f"[scheduler] backup failed: {e}")


def start_scheduler():
    global _scheduler
    if _scheduler:
        return
    try:
        _scheduler = AsyncIOScheduler(timezone=settings.TIMEZONE)
        _scheduler.add_job(_run_eod, CronTrigger(hour=settings.EOD_HOUR, minute=settings.EOD_MINUTE),
                           id="eod_summary", replace_existing=True)
        # auto Oracle export a few minutes after EOD
        _scheduler.add_job(_run_export, CronTrigger(hour=settings.EOD_HOUR,
                                                    minute=min(settings.EOD_MINUTE + 5, 59)),
                           id="oracle_export", replace_existing=True)
        # nightly DB backup at 01:00
        _scheduler.add_job(_run_backup, CronTrigger(hour=1, minute=0),
                           id="db_backup", replace_existing=True)
        _scheduler.start()
    except Exception as e:
        print(f"[scheduler] disabled: {e}")
