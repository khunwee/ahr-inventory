"""Lightweight access/action audit log."""
from datetime import datetime
from .db import SessionLocal
from .models import AuditLog


def log(action: str, detail: str = "", user=None, ip: str = ""):
    try:
        with SessionLocal() as s:
            s.add(AuditLog(action=action, detail=detail, ip=ip,
                           username=(user.username if user else ""),
                           role=(user.role if user else ""),
                           ts=datetime.utcnow()))
            s.commit()
    except Exception:
        pass  # auditing must never break the request
