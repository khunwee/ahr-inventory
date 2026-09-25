"""Shared business logic used by both the web API and the LINE bot, so a
withdrawal behaves identically no matter the channel."""
from datetime import datetime
from .tz import local_now
from sqlalchemy import select, func, update
from .models import Requisition, ReqLine, Item, StockTxn
from .db import urgency_of


def next_number(s, column, prefix) -> str:
    """Next running number = HIGHEST existing number + 1 (not a count), so
    deleting a document can never make the next number collide."""
    mx = 0
    for v in s.execute(select(column).where(column.like(f"{prefix}%"))).scalars():
        tail = (v or "").rsplit("-", 1)[-1]
        if tail.isdigit():
            mx = max(mx, int(tail))
    return f"{prefix}{mx + 1:03d}"


def next_ref(s) -> str:
    return next_number(s, Requisition.ref_no, f"REQ{local_now():%Y%m%d}-")


def save_with_number(s, obj, attr, make_number, tries=8):
    """Insert obj with a fresh running number; if another request took the same
    number at the same instant (unique constraint), retry with the next one."""
    from sqlalchemy.exc import IntegrityError
    for _ in range(tries):
        setattr(obj, attr, make_number(s))
        s.add(obj)
        try:
            s.flush()
            return obj
        except IntegrityError:
            s.rollback()
            obj = obj.__class__(**{c.name: getattr(obj, c.name) for c in obj.__table__.columns
                                   if c.name != "id"})
    raise RuntimeError("could not allocate a document number")


def change_stock(s, item_id, delta):
    """ATOMIC on-hand change: the database does `on_hand = on_hand + delta` in ONE
    statement (row-locked), so simultaneous withdrawals / receipts / returns can
    never overwrite each other. Returns the new balance (read in the same
    transaction). Never do `it.on_hand = it.on_hand - q` in Python."""
    delta = round(float(delta or 0), 6)
    s.execute(update(Item).where(Item.id == item_id)
              .values(on_hand=func.coalesce(Item.on_hand, 0) + delta, updated_at=datetime.utcnow())
              .execution_options(synchronize_session=False))
    new = s.execute(select(Item.on_hand).where(Item.id == item_id)).scalar_one()
    it = s.get(Item, item_id)
    if it is not None:                      # keep the in-session object consistent
        s.expire(it, ["on_hand", "updated_at"])
    return round(new or 0, 6)


def claim(s, model, row_id, from_status, to_status):
    """Atomically move a row from one status to another. Returns True only for
    the ONE request that wins (prevents double confirm / double delete / double
    PO receipt when a button is pressed twice or two users act at once)."""
    res = s.execute(update(model).where(model.id == row_id, model.status == from_status)
                    .values(status=to_status).execution_options(synchronize_session=False))
    return res.rowcount == 1


def issue_requisition(s, requester_id, requester_name, machine_id, machine_name,
                      problem, cart, source="web"):
    """Create a CONFIRMED requisition, deduct stock, write the ledger.
    cart = list of (item_id, qty). Returns (req, lines, triggered)."""
    now = datetime.utcnow()
    req = Requisition(requester_id=requester_id,
                      requester_name=requester_name, machine_id=machine_id,
                      machine_name=machine_name, problem=problem,
                      status="confirmed", source=source, confirmed_at=now)
    req = save_with_number(s, req, "ref_no", next_ref)
    lines, triggered = [], []
    for item_id, qty in cart:
        it = s.get(Item, item_id)
        if not it:
            continue
        if not qty or qty <= 0:
            continue
        bal = change_stock(s, it.id, -qty)
        ln = ReqLine(requisition_id=req.id, item_id=it.id, item_code=it.item_code,
                     description=it.description, qty=qty, system_after=bal)
        s.add(ln)
        s.add(StockTxn(item_id=it.id, item_code=it.item_code, txn_type="issue",
                       qty=qty, balance_after=bal, ref=req.ref_no,
                       user_id=requester_id, machine_name=machine_name, note=problem))
        lines.append(ln)
        if urgency_of(it):
            triggered.append((it, urgency_of(it)))
    s.commit()
    return req, lines, triggered


def confirm_message(req, lines):
    body = "\n".join(f"• {l.item_code} x{l.qty:g} ({l.description[:36]})" for l in lines)
    return (f"📤 เบิกอะไหล่ {req.ref_no}\nผู้เบิก: {req.requester_name}\n"
            f"เครื่อง: {req.machine_name or '-'}\nปัญหา: {req.problem or '-'}\n{body}")


def reorder_message(triggered):
    return "🔔 ต้องสั่งซื้อเพิ่ม (หลังการเบิกล่าสุด):\n" + "\n".join(
        f"[{urg.upper()}] {it.item_code} คงเหลือ {it.on_hand:g} / ROP {it.reorder_point:g}"
        for it, urg in triggered)
