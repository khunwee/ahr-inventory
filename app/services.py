"""Shared business logic used by both the web API and the LINE bot, so a
withdrawal behaves identically no matter the channel."""
from datetime import datetime
from sqlalchemy import select, func
from .models import Requisition, ReqLine, Item, StockTxn
from .db import urgency_of


def next_ref(s) -> str:
    today = datetime.now().strftime("%Y%m%d")
    n = s.execute(select(func.count(Requisition.id))
                  .where(Requisition.ref_no.like(f"REQ{today}%"))).scalar_one()
    return f"REQ{today}-{n + 1:03d}"


def issue_requisition(s, requester_id, requester_name, machine_id, machine_name,
                      problem, cart, source="web"):
    """Create a CONFIRMED requisition, deduct stock, write the ledger.
    cart = list of (item_id, qty). Returns (req, lines, triggered)."""
    now = datetime.utcnow()
    req = Requisition(ref_no=next_ref(s), requester_id=requester_id,
                      requester_name=requester_name, machine_id=machine_id,
                      machine_name=machine_name, problem=problem,
                      status="confirmed", source=source, confirmed_at=now)
    s.add(req); s.flush()
    lines, triggered = [], []
    for item_id, qty in cart:
        it = s.get(Item, item_id)
        if not it:
            continue
        it.on_hand = (it.on_hand or 0) - qty
        it.updated_at = now
        ln = ReqLine(requisition_id=req.id, item_id=it.id, item_code=it.item_code,
                     description=it.description, qty=qty, system_after=it.on_hand)
        s.add(ln)
        s.add(StockTxn(item_id=it.id, item_code=it.item_code, txn_type="issue",
                       qty=qty, balance_after=it.on_hand, ref=req.ref_no,
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
