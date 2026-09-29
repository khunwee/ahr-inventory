from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy import select
import hashlib
import hmac as _hmac
import os
from .config import settings
from .db import get_session, Session
from .models import User

oauth2 = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# role hierarchy — higher number = more power
ROLE_RANK = {"viewer": 0, "engineer": 1, "leader": 2, "admin": 3}

_ITER = 200_000


def hash_pw(p: str) -> str:
    """Salted PBKDF2-HMAC-SHA256 via stdlib — no native deps, no passlib."""
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", p.encode(), salt, _ITER)
    return f"pbkdf2_sha256${_ITER}${salt.hex()}${dk.hex()}"


def verify_pw(p: str, h: str) -> bool:
    try:
        _, iters, salt_hex, dk_hex = h.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", p.encode(), bytes.fromhex(salt_hex), int(iters))
        return _hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def make_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "name": user.full_name,
        "exp": datetime.utcnow() + timedelta(hours=settings.TOKEN_HOURS),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def current_user(token: str = Depends(oauth2), session: Session = Depends(get_session)) -> User:
    cred_err = HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired — please sign in again")
    try:
        data = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        uid = int(data["sub"])
    except (JWTError, KeyError, ValueError):
        raise cred_err
    user = session.get(User, uid)
    if not user or not user.active:
        raise cred_err
    return user


def require(min_role: str):
    """Dependency factory: gate an endpoint behind a minimum role."""
    def checker(user: User = Depends(current_user)) -> User:
        if ROLE_RANK.get(user.role, 0) < ROLE_RANK[min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                "You don't have permission for this action")
        return user
    return checker
