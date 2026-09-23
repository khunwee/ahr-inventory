"""Engine, session, and reorder logic — plain SQLAlchemy 2.0.

A small Session.exec() shim mirrors the old SQLModel API so the rest of the
codebase (session.exec(select(...)).all()/.first()/.one()) is unchanged.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session as _SASession
from .config import settings
from .models import Base

_is_sqlite = settings.DB_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if _is_sqlite else {}
engine = create_engine(settings.DB_URL, echo=False, future=True,
                       pool_pre_ping=not _is_sqlite, connect_args=connect_args)


class Session(_SASession):
    """SQLModel-compatible: .exec(stmt) returns scalar model instances."""
    def exec(self, statement):
        return self.execute(statement).scalars()


SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False,
                            future=True)


def _migrate():
    """Add columns introduced after first release to an existing SQLite DB
    (create_all only creates missing tables, not missing columns).
    Only needed for SQLite; on Postgres, create_all already includes them."""
    if not _is_sqlite:
        return
    from sqlalchemy import text, inspect
    insp = inspect(engine)
    if "user" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("user")}
        if "must_change_pw" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE user ADD COLUMN must_change_pw BOOLEAN DEFAULT 0"))


def init_db():
    Base.metadata.create_all(engine)
    _migrate()


def get_session():
    with SessionLocal() as session:
        yield session


def urgency_of(item) -> str:
    """Return '', 'watch', 'high', or 'critical' for reorder priority."""
    rop = item.reorder_point or 0
    oh = item.on_hand or 0
    if oh <= 0:
        return "critical"
    if rop > 0 and oh <= rop * 0.5:
        return "critical"
    if rop > 0 and oh <= rop:
        return "high"
    if rop > 0 and oh <= rop + settings.REORDER_BUFFER:
        return "watch"
    return ""
