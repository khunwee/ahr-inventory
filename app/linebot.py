"""Full LINE requisition bot: account linking + a Quick-Reply driven withdraw
flow (search → pick part → qty → machine → problem → confirm → optional photo).

The webhook (in main.py) calls `handle_events`, which returns a list of
(reply_token, messages) to send back. Bot logic is kept independent of the web
layer and testable without a live LINE account.
"""
import time
from sqlalchemy import select, or_
from .db import SessionLocal
from .models import User, Item, Machine, Requisition
from .services import issue_requisition, confirm_message, reorder_message

# in-memory per-user conversation state and one-time link codes
_sessions: dict = {}          # line_user_id -> dict(state, cart, results, machine, problem)
_link_codes: dict = {}        # code -> (user_id, expiry_ts)


def new_link_code(user_id: int, code: str, ttl=600):
    _link_codes[code] = (user_id, time.time() + ttl)


def _consume_code(code: str):
    rec = _link_codes.get(code)
    if not rec:
        return None
    uid, exp = rec
    _link_codes.pop(code, None)
    if time.time() > exp:
        return None
    return uid


# ---- message builders ----
def _text(t):
    return {"type": "text", "text": t}


def _quick(t, items):
    """items = list of (label, text). LINE allows max 13 quick-reply items."""
    qr = [{"type": "action", "action": {"type": "message", "label": lbl[:20], "text": txt}}
          for lbl, txt in items[:13]]
    return {"type": "text", "text": t, "quickReply": {"items": qr}}


def _sess(uid):
    return _sessions.setdefault(uid, {"state": "idle", "cart": [], "results": [],
                                      "machine_id": None, "machine": "", "problem": ""})


def _find_user(s, line_uid):
    return s.execute(select(User).where(User.line_user_id == line_uid)).scalars().first()


def handle_text(line_uid, text):
    """Return a list of message dicts to reply. Pure of network I/O."""
    text = (text or "").strip()
    with SessionLocal() as s:
        user = _find_user(s, line_uid)

        # ---- account linking ----
        if text.startswith("ผูก"):
            parts = text.split()
            if len(parts) >= 2:
                uid = _consume_code(parts[1].strip())
                if uid:
                    u = s.get(User, uid)
                    if u:
                        u.line_user_id = line_uid
                        s.add(u); s.commit()
                        return [_text(f"✅ ผูกบัญชีสำเร็จ — สวัสดีคุณ {u.full_name or u.username}\nพิมพ์ 'เบิก' เพื่อเริ่มเบิกอะไหล่")]
                return [_text("❌ รหัสผูกบัญชีไม่ถูกต้องหรือหมดอายุ ขอรหัสใหม่จากหน้าเว็บ (โปรไฟล์ > ผูกบัญชี LINE)")]
            return [_text("พิมพ์: ผูก <รหัส 6 หลักจากหน้าเว็บ>")]

        if not user:
            return [_text("บัญชี LINE นี้ยังไม่ได้ผูกกับระบบ\nเข้าหน้าเว็บ > กด 'ผูกบัญชี LINE' เพื่อรับรหัส แล้วพิมพ์: ผูก <รหัส>")]

        sess = _sess(line_uid)
        low = text.lower()

        # ---- global commands ----
        if low in ("ยกเลิก", "cancel", "เริ่มใหม่"):
            _sessions[line_uid] = {"state": "idle", "cart": [], "results": [],
                                   "machine_id": None, "machine": "", "problem": ""}
            return [_text("ยกเลิกแล้ว พิมพ์ 'เบิก' เพื่อเริ่มใหม่")]

        if low in ("เบิก", "เบิกของ", "เบิกอะไหล่") or sess["state"] == "idle" and low in ("เมนู", "menu"):
            sess.update(state="searching", cart=[], results=[], machine_id=None, machine="", problem="")
            return [_text("🔧 เบิกอะไหล่\nพิมพ์คำค้นหา (บางส่วนก็ได้) เช่น 'valve komatsu' หรือ 'MSP0005'")]

        # ---- pick from quick reply ----
        if text.startswith("PICK:"):
            try:
                item_id = int(text.split(":", 1)[1])
            except ValueError:
                return [_text("เลือกไม่ถูกต้อง ลองค้นหาใหม่")]
            it = s.get(Item, item_id)
            if not it:
                return [_text("ไม่พบอะไหล่นี้ ลองค้นหาใหม่")]
            sess["pending"] = {"id": it.id, "code": it.item_code,
                               "name": it.part_name or it.description[:40], "oh": it.on_hand}
            sess["state"] = "qty"
            return [_quick(f"เลือก: {it.item_code}\n{it.part_name or it.description[:40]}\nคงเหลือ {it.on_hand:g}\nจำนวนที่เบิก?",
                           [("1", "QTY:1"), ("2", "QTY:2"), ("3", "QTY:3"), ("5", "QTY:5"), ("10", "QTY:10")])]

        if text.startswith("QTY:") or (sess["state"] == "qty" and text.replace(".", "").isdigit()):
            raw = text.split(":", 1)[1] if text.startswith("QTY:") else text
            try:
                qty = float(raw)
            except ValueError:
                return [_text("กรุณาพิมพ์จำนวนเป็นตัวเลข")]
            p = sess.get("pending")
            if not p:
                return [_text("ยังไม่ได้เลือกอะไหล่ พิมพ์ 'เบิก' เพื่อเริ่ม")]
            warn = "  ⚠️ เกินสต็อก!" if qty > (p["oh"] or 0) else ""
            sess["cart"].append({"id": p["id"], "code": p["code"], "name": p["name"], "qty": qty})
            sess["pending"] = None
            sess["state"] = "more"
            cart_txt = "\n".join(f"• {c['code']} x{c['qty']:g}" for c in sess["cart"])
            return [_quick(f"เพิ่มลงรายการแล้ว{warn}\n\nรายการปัจจุบัน:\n{cart_txt}\n\nต่อไป?",
                           [("➕ เพิ่มอีก", "เพิ่มอีก"), ("✅ เลือกเครื่อง", "ไปต่อ"), ("❌ ยกเลิก", "ยกเลิก")])]

        if low == "เพิ่มอีก":
            sess["state"] = "searching"
            return [_text("พิมพ์คำค้นหาอะไหล่ชิ้นต่อไป")]

        if low == "ไปต่อ" and sess["cart"]:
            sess["state"] = "machine"
            return [_text("🏭 ใช้กับเครื่องอะไร? พิมพ์ชื่อเครื่อง (บางส่วนก็ได้) เช่น 'komatsu 800'")]

        # ---- machine selection ----
        if sess["state"] == "machine":
            if text.startswith("MC:"):
                try:
                    mid = int(text.split(":", 1)[1])
                except ValueError:
                    mid = None
                m = s.get(Machine, mid) if mid else None
                sess["machine_id"] = m.id if m else None
                sess["machine"] = m.name if m else text
                sess["state"] = "problem"
                return [_text(f"เครื่อง: {sess['machine']}\n\n📝 ปัญหาที่พบ? (พิมพ์ หรือ พิมพ์ - เพื่อข้าม)")]
            matches = s.execute(select(Machine).where(Machine.name.ilike(f"%{text}%"))
                                .limit(12)).scalars().all()
            if len(matches) == 1:
                sess["machine_id"] = matches[0].id
                sess["machine"] = matches[0].name
                sess["state"] = "problem"
                return [_text(f"เครื่อง: {matches[0].name}\n\n📝 ปัญหาที่พบ? (พิมพ์ หรือ พิมพ์ - เพื่อข้าม)")]
            if matches:
                return [_quick("เลือกเครื่องที่ตรง:",
                               [(m.name, f"MC:{m.id}") for m in matches])]
            # no match -> accept free text
            sess["machine"] = text
            sess["machine_id"] = None
            sess["state"] = "problem"
            return [_text(f"เครื่อง: {text} (ไม่พบในรายการ ใช้ตามที่พิมพ์)\n\n📝 ปัญหาที่พบ? (พิมพ์ หรือ - เพื่อข้าม)")]

        # ---- problem ----
        if sess["state"] == "problem":
            sess["problem"] = "" if text == "-" else text
            sess["state"] = "confirm"
            cart_txt = "\n".join(f"• {c['code']} x{c['qty']:g} ({c['name'][:24]})" for c in sess["cart"])
            return [_quick(f"ยืนยันการเบิก?\n\n{cart_txt}\nเครื่อง: {sess['machine'] or '-'}\nปัญหา: {sess['problem'] or '-'}",
                           [("✅ ยืนยันเบิก", "ยืนยันเบิก"), ("❌ ยกเลิก", "ยกเลิก")])]

        # ---- confirm ----
        if low == "ยืนยันเบิก" and sess["state"] == "confirm" and sess["cart"]:
            cart = [(c["id"], c["qty"]) for c in sess["cart"]]
            req, lines, triggered = issue_requisition(
                s, user.id, user.full_name or user.username, sess.get("machine_id"),
                sess.get("machine", ""), sess.get("problem", ""), cart, source="line")
            sess.update(state="idle", cart=[], last_req_id=req.id)
            msgs = [_text(f"✅ เบิกสำเร็จ {req.ref_no} — ตัดสต็อกแล้ว\nส่งรูปแนบได้เลย (ถ้ามี) หรือพิมพ์ 'เบิก' เพื่อเบิกใหม่")]
            return msgs, (req, lines, triggered)

        # ---- searching (default when in searching state) ----
        if sess["state"] == "searching" or low not in ("ไปต่อ",):
            rows = _search(s, text)
            if not rows:
                return [_text(f"ไม่พบ '{text}' ลองพิมพ์คำอื่น")]
            sess["state"] = "picking"
            return [_quick(f"พบ {len(rows)} รายการ เลือกอะไหล่ที่จะเบิก:",
                           [(f"{r.item_code} ({r.on_hand:g})", f"PICK:{r.id}") for r in rows])]

    return [_text("พิมพ์ 'เบิก' เพื่อเริ่มเบิกอะไหล่ หรือ 'ยกเลิก' เพื่อเริ่มใหม่")]


def _search(s, q):
    stmt = select(Item)
    for term in q.split():
        like = f"%{term}%"
        stmt = stmt.where(or_(Item.item_code.ilike(like), Item.description.ilike(like),
                              Item.part_name.ilike(like), Item.part_number.ilike(like),
                              Item.brand.ilike(like), Item.machine_group.ilike(like)))
    return s.execute(stmt.order_by(Item.item_code).limit(12)).scalars().all()


def attach_photo(line_uid, photo_name):
    """Link an uploaded image to the user's most recent requisition."""
    sess = _sessions.get(line_uid, {})
    rid = sess.get("last_req_id")
    if not rid:
        return False
    with SessionLocal() as s:
        req = s.get(Requisition, rid)
        if req:
            req.photo_path = photo_name
            s.add(req); s.commit()
            return True
    return False
