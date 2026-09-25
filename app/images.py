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
from .models import User, Item, Requisition, ImageBlob

router = APIRouter(tags=["images"])
COOKIE = "ahr_session"
OK_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_FULL, MAX_THUMB = 1_500_000, 250_000


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


# ------------------------------------------------------ requisition photos --
@router.post("/api/requisitions/{req_id}/photo")
async def upload_req_photo(req_id: int, file: UploadFile = File(...),
                           s: Session = Depends(get_session), u: User = Depends(current_user)):
    req = s.get(Requisition, req_id)
    if not req:
        raise HTTPException(404, "Requisition not found")
    data, mime = await _read_image(file, MAX_FULL)
    put_blob(s, "req", req_id, "full", data, mime)
    req.photo_path = "db"
    s.commit()
    return {"photo": "db"}


def save_req_photo_bytes(s, req_id, data, mime="image/jpeg"):
    """Used by the LINE bot for photos sent in chat."""
    put_blob(s, "req", req_id, "full", data, mime)
    req = s.get(Requisition, req_id)
    if req:
        req.photo_path = "db"


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
