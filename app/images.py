"""Part photos and requisition photos, stored in the database.

Browsers load pictures with <img src>, which cannot send the Bearer header, so
image endpoints also accept an HttpOnly session cookie set at login."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Response
from jose import jwt, JWTError
from sqlalchemy import select, delete as sa_delete

from .auth import require, current_user
from .audit import log as audit_log
from .config import settings, UPLOAD_DIR
from .db import get_session, Session
from .models import User, Item, Requisition, ImageBlob, Setting
from datetime import timedelta
from sqlalchemy import func, text
from pydantic import BaseModel
from .db import SessionLocal, _is_sqlite

router = APIRouter(tags=["images"])
COOKIE = "ahr_session"
OK_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_FULL, MAX_THUMB = 1_500_000, 250_000
MAX_REQ = 600_000                 # requisition photos are resized in the browser to ~100 KB


# ------------------------------------------------------------- auth cookie --
def set_session_cookie(resp: Response, request: Request, token: str):
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    resp.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=secure,
                    max_age=settings.TOKEN_HOURS * 3600, path="/")


def viewer(request: Request, s: Session = Depends(get_session)) -> User:
    """Authenticated user from the Bearer header OR the session cookie."""
    tok = ""
    h = request.headers.get("authorization", "")
    if h.lower().startswith("bearer "):
        tok = h[7:]
    tok = tok or request.cookies.get(COOKIE, "")
    try:
        uid = int(jwt.decode(tok, settings.SECRET_KEY, algorithms=["HS256"])["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(401, "Not authenticated")
    u = s.get(User, uid)
    if not u or not u.active:
        raise HTTPException(401, "Not authenticated")
    return u


@router.post("/api/auth/session")
def open_session(request: Request, response: Response, u: User = Depends(current_user)):
    """Called after sign-in (or page reload) to place the image cookie."""
    tok = request.headers.get("authorization", "")[7:]
    set_session_cookie(response, request, tok)
    return {"ok": True}


@router.post("/api/auth/logout")
def close_session(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


# --------------------------------------------------------------- helpers ----
async def _read_image(f: UploadFile, limit: int) -> tuple:
    data = await f.read()
    mime = (f.content_type or "").lower()
    if mime not in OK_MIME:
        raise HTTPException(400, "รองรับเฉพาะไฟล์รูป JPG / PNG / WEBP")
    if len(data) > limit:
        raise HTTPException(400, f"ไฟล์รูปใหญ่เกินไป (สูงสุด {limit // 1000} KB หลังย่อขนาด)")
    return data, mime


def put_blob(s, owner_type, owner_id, variant, data, mime):
    s.execute(sa_delete(ImageBlob).where(ImageBlob.owner_type == owner_type,
                                         ImageBlob.owner_id == owner_id, ImageBlob.variant == variant))
    s.add(ImageBlob(owner_type=owner_type, owner_id=owner_id, variant=variant,
                    mime=mime, data=data, size=len(data)))


def drop_blobs(s, owner_type, owner_id=None):
    q = sa_delete(ImageBlob).where(ImageBlob.owner_type == owner_type)
    if owner_id is not None:
        q = q.where(ImageBlob.owner_id == owner_id)
    s.execute(q)


def _serve(b):
    return Response(content=b.data, media_type=b.mime,
                    headers={"Cache-Control": "private, max-age=31536000, immutable"})


def _get(s, owner_type, owner_id, variant):
    return s.execute(select(ImageBlob).where(ImageBlob.owner_type == owner_type,
                                             ImageBlob.owner_id == owner_id,
                                             ImageBlob.variant == variant)).scalars().first()


# ------------------------------------------------------------ part photos ---
@router.put("/api/items/{item_id}/image")
async def upload_item_image(item_id: int, full: UploadFile = File(...), thumb: UploadFile = File(None),
                            s: Session = Depends(get_session), u: User = Depends(require("admin"))):
    it = s.get(Item, item_id)
    if not it:
        raise HTTPException(404, "ไม่พบอะไหล่")
    data, mime = await _read_image(full, MAX_FULL)
    put_blob(s, "item", item_id, "full", data, mime)
    if thumb is not None:
        tdata, tmime = await _read_image(thumb, MAX_THUMB)
        put_blob(s, "item", item_id, "thumb", tdata, tmime)
    it.image_ver = (it.image_ver or 0) + 1
    it.updated_at = datetime.utcnow()
    s.commit()
    audit_log("item", f"photo uploaded for {it.item_code} ({len(data) // 1000} KB)", user=u)
    return {"ok": True, "image_ver": it.image_ver}


@router.delete("/api/items/{item_id}/image")
def delete_item_image(item_id: int, s: Session = Depends(get_session), u: User = Depends(require("admin"))):
    it = s.get(Item, item_id)
    if not it:
        raise HTTPException(404, "ไม่พบอะไหล่")
    drop_blobs(s, "item", item_id)
    it.image_ver = 0
    s.commit()
    audit_log("item", f"photo removed from {it.item_code}", user=u)
    return {"ok": True}


@router.get("/api/items/{item_id}/image")
def item_image(item_id: int, thumb: bool = False, s: Session = Depends(get_session), u: User = Depends(viewer)):
    b = (_get(s, "item", item_id, "thumb") if thumb else None) or _get(s, "item", item_id, "full")
    if not b:
        raise HTTPException(404, "ไม่มีรูป")
    return _serve(b)


# ------------------------------------------------------------ photo policy --
# Admin-controlled. Part photos (reference pictures) are always allowed.
PHOTO_DEFAULTS = {"REQ_PHOTO_ENABLED": "1", "REQ_PHOTO_DAYS": "30", "DB_LIMIT_MB": "512"}


def get_policy(s):
    out = {}
    for k, d in PHOTO_DEFAULTS.items():
        row = s.get(Setting, k)
        out[k] = row.value if row and row.value not in (None, "") else d
    return {"req_photo_enabled": out["REQ_PHOTO_ENABLED"] == "1",
            "req_photo_days": max(0, int(float(out["REQ_PHOTO_DAYS"] or 0))),
            "db_limit_mb": max(0.01, float(out["DB_LIMIT_MB"] or 512))}   # the admin form enforces >= 50


def db_size_bytes(s):
    try:
        if _is_sqlite:
            from .config import settings as _st
            from pathlib import Path
            p = Path(_st.DB_URL.replace("sqlite:///", ""))
            return p.stat().st_size if p.exists() else 0
        return s.execute(text("select pg_database_size(current_database())")).scalar_one()
    except Exception:
        return 0


def storage_report(s):
    pol = get_policy(s)
    def agg(owner):
        n, b = s.execute(select(func.count(), func.coalesce(func.sum(ImageBlob.size), 0))
                         .where(ImageBlob.owner_type == owner)).one()
        return int(n or 0), int(b or 0)
    pn, pb = agg("item"); rn, rb = agg("req")
    oldest = s.execute(select(func.min(ImageBlob.created_at)).where(ImageBlob.owner_type == "req")).scalar()
    used = db_size_bytes(s); limit = int(pol["db_limit_mb"] * 1024 * 1024)
    return {**pol, "db_bytes": used, "db_limit_bytes": limit, "used_pct": round(used * 100 / limit, 1) if limit else 0,
            "part_photos": pn, "part_photo_bytes": pb, "req_photos": rn, "req_photo_bytes": rb,
            "oldest_req_photo": oldest,
            "items_with_photo": s.execute(select(func.count()).select_from(Item).where(Item.image_ver > 0)).scalar_one()}


def purge_req_photos(s, older_than_days=None):
    """Delete requisition photos (all, or older than N days). Part photos are never touched."""
    q = select(ImageBlob.owner_id).where(ImageBlob.owner_type == "req")
    if older_than_days:
        q = q.where(ImageBlob.created_at < datetime.utcnow() - timedelta(days=older_than_days))
    ids = [r for r in s.execute(q).scalars()]
    if not ids:
        return 0
    s.execute(sa_delete(ImageBlob).where(ImageBlob.owner_type == "req", ImageBlob.owner_id.in_(ids)))
    for req in s.execute(select(Requisition).where(Requisition.id.in_(ids))).scalars():
        req.photo_path = ""
    s.commit()
    return len(ids)


def auto_purge():
    """Apply the retention rule (run at startup, before each upload, and nightly)."""
    try:
        with SessionLocal() as s:
            pol = get_policy(s)
            if pol["req_photo_days"] > 0:
                return purge_req_photos(s, pol["req_photo_days"])
    except Exception as e:
        print("[photos] auto purge skipped:", e)
    return 0


@router.get("/api/photo-settings")
def photo_settings(s: Session = Depends(get_session), u: User = Depends(current_user)):
    p = get_policy(s)
    return {"req_photo_enabled": p["req_photo_enabled"], "req_photo_days": p["req_photo_days"]}


class PhotoPolicyIn(BaseModel):
    req_photo_enabled: bool
    req_photo_days: int = 30
    db_limit_mb: int = 512


@router.put("/api/admin/photo-settings")
def save_photo_settings(p: PhotoPolicyIn, s: Session = Depends(get_session), u: User = Depends(require("admin"))):
    vals = {"REQ_PHOTO_ENABLED": "1" if p.req_photo_enabled else "0",
            "REQ_PHOTO_DAYS": str(max(0, min(p.req_photo_days, 3650))),
            "DB_LIMIT_MB": str(max(50, min(p.db_limit_mb, 1_000_000)))}
    for k, v in vals.items():
        row = s.get(Setting, k)
        if row:
            row.value = v
        else:
            s.add(Setting(key=k, value=v))
    s.commit()
    removed = auto_purge()
    audit_log("setting", f"photo policy {vals}; purged {removed} old requisition photo(s)", user=u)
    return {"ok": True, "purged": removed, **get_policy(s)}


@router.get("/api/admin/storage")
def storage(s: Session = Depends(get_session), u: User = Depends(require("admin"))):
    return storage_report(s)


class PurgeIn(BaseModel):
    older_than_days: int = 0          # 0 = all requisition photos
    confirm_text: str = ""


@router.post("/api/admin/purge-req-photos")
def purge(p: PurgeIn, s: Session = Depends(get_session), u: User = Depends(require("admin"))):
    if p.confirm_text.strip() != "ยืนยันล้างข้อมูล":
        raise HTTPException(400, "พิมพ์ 'ยืนยันล้างข้อมูล' เพื่อยืนยัน")
    n = purge_req_photos(s, p.older_than_days or None)
    audit_log("cleanup", f"deleted {n} requisition photo(s) (older than {p.older_than_days or 'ALL'} days)", user=u)
    return {"ok": True, "deleted": n, **storage_report(s)}


# ------------------------------------------------------ requisition photos --
@router.post("/api/requisitions/{req_id}/photo")
async def upload_req_photo(req_id: int, file: UploadFile = File(...),
                           s: Session = Depends(get_session), u: User = Depends(current_user)):
    req = s.get(Requisition, req_id)
    if not req:
        raise HTTPException(404, "Requisition not found")
    pol = get_policy(s)
    if not pol["req_photo_enabled"]:
        raise HTTPException(403, "แอดมินปิดการแนบรูปในใบเบิกไว้")
    if db_size_bytes(s) >= 0.9 * pol["db_limit_mb"] * 1024 * 1024:
        raise HTTPException(507, "พื้นที่ฐานข้อมูลใกล้เต็ม (90%) — ระบบงดรับรูปใบเบิกชั่วคราว กรุณาแจ้งแอดมิน")
    data, mime = await _read_image(file, MAX_REQ)
    auto_purge()
    put_blob(s, "req", req_id, "full", data, mime)
    req.photo_path = "db"
    s.commit()
    return {"photo": "db"}


def save_req_photo_bytes(s, req_id, data, mime="image/jpeg"):
    """Used by the LINE bot for photos sent in chat (same policy as the web)."""
    if not get_policy(s)["req_photo_enabled"] or len(data) > MAX_REQ * 4:
        return False
    put_blob(s, "req", req_id, "full", data, mime)
    req = s.get(Requisition, req_id)
    if req:
        req.photo_path = "db"
    return True


@router.get("/api/requisitions/{req_id}/photo")
def req_photo(req_id: int, s: Session = Depends(get_session), u: User = Depends(viewer)):
    b = _get(s, "req", req_id, "full")
    if b:
        return _serve(b)
    req = s.get(Requisition, req_id)                   # photos saved by older versions (files)
    if req and req.photo_path and req.photo_path != "db":
        p = UPLOAD_DIR / req.photo_path
        if p.exists():
            return Response(content=p.read_bytes(), media_type="image/jpeg")
    raise HTTPException(404, "ไม่พบรูป")
