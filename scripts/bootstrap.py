"""Startup bootstrap for hosted deployments.

Creates tables (+ default admin via the app on startup) and loads the sample
dataset ONLY when the database has no items yet. Safe to run on every boot:
on restart with data already present, it does nothing (no duplicate imports).
Works for both SQLite (on a persistent volume) and Postgres.
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, func
from app.db import SessionLocal, init_db
from app.models import Item
import scripts.import_excel as ie


def run():
    init_db()
    with SessionLocal() as s:
        n = s.execute(select(func.count()).select_from(Item)).scalar_one()
        if n:
            print(f"[bootstrap] {n} items already present — skip import")
            return
        d = Path(__file__).resolve().parent.parent / "source"
        if not d.exists():
            print("[bootstrap] no source folder — starting with empty catalog")
            return
        print("[bootstrap] empty database — importing sample dataset...")
        mach = d / "Machine_list_.xlsx"
        spare = d / "2_Spare_Parts_Control_2026.xlsx"
        cons = d / "2_Spare_Parts_Control_2026_Consumable.xlsx"
        if mach.exists():
            ie.import_machines(mach, s)
        enrich = ie.enrich_from_itemcode(cons) if cons.exists() else {}
        if spare.exists():
            ie.import_sheet(spare, "Machine Spare parts 2026", s, enrich, kind="spare")
        if cons.exists():
            ie.import_sheet(cons, "Tool And Facility", s, enrich, kind="tool")
        print("[bootstrap] import complete")


if __name__ == "__main__":
    run()
