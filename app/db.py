"""Engine, session, and reorder logic — plain SQLAlchemy 2.0.

A small Session.exec() shim mirrors the old SQLModel API so the rest of the
codebase (session.exec(select(...)).all()/.first()/.one()) is unchanged.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session as _SASession
from .config import settings
from .models import Base

_is_sqlite = settings.DB_URL.startswith("sqlite")
connect_args = {"check_same_thread": False, "timeout": 30} if _is_sqlite else {}
engine = create_engine(settings.DB_URL, echo=False, future=True,
                       pool_pre_ping=not _is_sqlite, connect_args=connect_args)


class Session(_SASession):
    """SQLModel-compatible: .exec(stmt) returns scalar model instances."""
    def exec(self, statement):
        return self.execute(statement).scalars()


SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False,
                            future=True)


def _migrate():
    """Add any columns defined in the models but missing from an existing
    database (create_all creates missing TABLES, not missing COLUMNS).
    Works for both SQLite and PostgreSQL, so databases created by older
    versions (local file or Neon) upgrade in place without losing data."""
    from sqlalchemy import text, inspect
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    prep = engine.dialect.identifier_preparer
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        have = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in have or col.primary_key:
                continue
            coltype = col.type.compile(dialect=engine.dialect)
            default = ""
            if col.default is not None and getattr(col.default, "is_scalar", False):
                v = col.default.arg
                if isinstance(v, bool):
                    v = ("TRUE" if v else "FALSE") if not _is_sqlite else int(v)
                    default = f" DEFAULT {v}"
                elif isinstance(v, (int, float)):
                    default = f" DEFAULT {v}"
                elif isinstance(v, str):
                    default = " DEFAULT '" + v.replace("'", "''") + "'"
            sql = (f"ALTER TABLE {prep.quote(table.name)} "
                   f"ADD COLUMN {prep.quote(col.name)} {coltype}{default}")
            with engine.begin() as conn:
                conn.execute(text(sql))


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
