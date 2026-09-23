"""Import the three AHR Excel workbooks into the inventory database.

Run once to seed, or re-run to upsert (matched by item_code). Handles the
quirks found while studying the source files:
  * real headers are on row 3, data starts row 4
  * Description packs several fields separated by '\\' and ':'
  * UOM casing is inconsistent (Pcs / PCS / pcs / Pcs.)
  * Machine field is free-text and coarse; the Machine list is the controlled
    vocabulary the dropdown will use going forward
Usage:
  python -m scripts.import_excel --dir /path/to/folder   (defaults to ./source)
"""
import argparse
import re
from datetime import datetime
from pathlib import Path

import openpyxl
from sqlalchemy import select

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.db import engine, init_db, SessionLocal, Session
from app.models import Machine, Item, StockTxn

UOM_MAP = {
    "pcs": "Pcs", "pc": "Pcs", "set": "Set", "uni": "Unit", "unit": "Unit",
    "pail": "Pail", "roll": "Roll", "kgs": "Kg", "kg": "Kg", "lites": "Litre",
    "litre": "Litre", "l": "Litre", "drum": "Drum", "meters": "Metre",
    "metre": "Metre", "m": "Metre", "box": "Box",
}


def clean_uom(v):
    if not v:
        return "Pcs"
    key = str(v).strip().strip(".").lower()
    return UOM_MAP.get(key, str(v).strip())


def parse_description(desc: str):
    """'GROUP \\ NAME : PARTNO \\ BRAND' -> (part_name, part_number, brand)."""
    if not desc:
        return "", "", ""
    parts = [p.strip() for p in str(desc).split("\\") if p.strip()]
    brand = ""
    if len(parts) >= 3:
        brand = parts[-1]
        core = parts[1]
    elif len(parts) == 2:
        core = parts[1]
    else:
        core = parts[0]
    name, pn = core, ""
    if ":" in core:
        name, pn = core.split(":", 1)
    return name.strip(), pn.strip(), brand.strip()


def cat_of(code: str) -> str:
    m = re.match(r"([A-Za-z]+)", str(code or ""))
    return m.group(1).upper() if m else ""


def as_num(v, default=0.0):
    try:
        if v in (None, "", "#DIV/0!"):
            return default
        return float(v)
    except (ValueError, TypeError):
        return default


def as_dt(v):
    return v if isinstance(v, datetime) else None


def upsert_item(s: Session, code, **fields):
    it = s.exec(select(Item).where(Item.item_code == code)).first()
    if it:
        for k, v in fields.items():
            setattr(it, k, v)
    else:
        it = Item(item_code=code, **fields)
        s.add(it)
    return it


def import_machines(path: Path, s: Session):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Machine list"]
    existing = {m.name for m in s.exec(select(Machine)).all()}
    n = 0
    for r in range(2, ws.max_row + 1):
        name = ws.cell(r, 1).value
        if name and str(name).strip() and str(name).strip() not in existing:
            s.add(Machine(name=str(name).strip()))
            existing.add(str(name).strip())
            n += 1
    s.commit()
    print(f"  machines: +{n} (total {len(existing)})")


def enrich_from_itemcode(path: Path):
    """Build code -> {brand, model, history} from the 'Item code' master sheet."""
    out = {}
    wb = openpyxl.load_workbook(path, data_only=True)
    if "Item code" not in wb.sheetnames:
        return out
    ws = wb["Item code"]
    # cols: D=4 code, F=6 history(th), G=7 model, H=8 brand
    for r in range(4, ws.max_row + 1):
        code = ws.cell(r, 4).value
        if not code:
            continue
        out[str(code).strip()] = {
            "history": str(ws.cell(r, 6).value or "").strip(),
            "model": str(ws.cell(r, 7).value or "").strip(),
            "brand": str(ws.cell(r, 8).value or "").strip(),
        }
    return out


def import_sheet(path: Path, sheet: str, s: Session, enrich=None, kind="spare"):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[sheet]
    enrich = enrich or {}
    # column indices (1-based) differ slightly between the two layouts
    if kind == "spare":
        C = dict(box=4, level=5, code=6, desc=7, machine=8, uom=9, stock=10,
                 out_year=49, mn=54, mx=53, lead=57, receipt=58, price=62)
    else:  # tool/facility
        C = dict(box=4, level=5, code=6, desc=7, machine=8, uom=9, stock=10,
                 out_year=49, mn=None, mx=None, lead=None, receipt=None, price=None)
    n = 0
    for r in range(4, ws.max_row + 1):
        code = ws.cell(r, C["code"]).value
        if not code or not str(code).strip():
            continue
        code = str(code).strip()
        desc = str(ws.cell(r, C["desc"]).value or "").strip()
        name, pn, brand = parse_description(desc)
        info = enrich.get(code, {})
        if not brand:
            brand = info.get("brand", "")
        stock = as_num(ws.cell(r, C["stock"]).value)
        out_year = as_num(ws.cell(r, C["out_year"]).value) if C["out_year"] else 0
        lead = as_num(ws.cell(r, C["lead"]).value, 2.0) if C["lead"] else 2.0
        mn = as_num(ws.cell(r, C["mn"]).value) if C["mn"] else 0.0
        mx = as_num(ws.cell(r, C["mx"]).value) if C["mx"] else 0.0
        price = as_num(ws.cell(r, C["price"]).value) if C["price"] else 0.0
        # practical reorder point: cover lead time from average monthly usage,
        # never below the recorded minimum level
        avg_month = out_year / 12.0
        rop = max(mn, round(avg_month * lead, 1))
        it = upsert_item(
            s, code,
            category=cat_of(code), description=desc,
            part_name=name or info.get("history", ""), part_number=pn, brand=brand,
            machine_group=str(ws.cell(r, C["machine"]).value or "").strip(),
            uom=clean_uom(ws.cell(r, C["uom"]).value),
            box=str(ws.cell(r, C["box"]).value or "").strip(),
            level=str(ws.cell(r, C["level"]).value or "").strip(),
            unit_price=price, on_hand=stock, min_level=mn,
            max_level=max(mx, stock), reorder_point=rop, lead_time_months=lead,
            source_sheet=sheet,
            last_receipt=as_dt(ws.cell(r, C["receipt"]).value) if C["receipt"] else None,
            updated_at=datetime.utcnow())
        s.flush()
        # opening-balance ledger row so on_hand is always ledger-backed
        if stock:
            s.add(StockTxn(item_id=it.id, item_code=code, txn_type="receive",
                           qty=stock, balance_after=stock, ref="OPENING",
                           note="Opening balance from Excel"))
        n += 1
    s.commit()
    print(f"  {sheet}: {n} items")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(Path(__file__).resolve().parent.parent / "source"))
    args = ap.parse_args()
    d = Path(args.dir)
    f_spare = d / "2_Spare_Parts_Control_2026.xlsx"
    f_cons = d / "2_Spare_Parts_Control_2026_Consumable.xlsx"
    f_mach = d / "Machine_list_.xlsx"

    init_db()
    with SessionLocal() as s:
        print("Importing…")
        if f_mach.exists():
            import_machines(f_mach, s)
        enrich = enrich_from_itemcode(f_cons) if f_cons.exists() else {}
        if f_spare.exists():
            import_sheet(f_spare, "Machine Spare parts 2026", s, enrich, kind="spare")
        if f_cons.exists():
            import_sheet(f_cons, "Tool And Facility", s, enrich, kind="tool")
        total = len(s.exec(select(Item)).all())
        print(f"Done. Total items in DB: {total}")


if __name__ == "__main__":
    main()
