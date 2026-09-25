"""Data model — classic SQLAlchemy declarative (Column-based, no type
annotations) so it works identically on Python 3.10 through 3.14 without
depending on annotation evaluation (PEP 649/749) the way SQLModel/pydantic do.

Stock is driven by an append-only StockTxn ledger; Item.on_hand is the running
balance, so every figure can be audited back to a transaction.
"""
from datetime import datetime
from sqlalchemy import (Column, Integer, String, Float, Boolean, DateTime,
                        ForeignKey, LargeBinary, UniqueConstraint)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True)
    full_name = Column(String, default="")
    password_hash = Column(String, default="")
    role = Column(String, default="engineer")          # admin|leader|engineer|viewer
    line_user_id = Column(String, default="")
    active = Column(Boolean, default=True)
    must_change_pw = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Machine(Base):
    __tablename__ = "machine"
    id = Column(Integer, primary_key=True)
    name = Column(String, index=True)
    active = Column(Boolean, default=True)


class Item(Base):
    __tablename__ = "item"
    id = Column(Integer, primary_key=True)
    item_code = Column(String, unique=True, index=True)
    category = Column(String, default="")
    description = Column(String, default="")
    part_name = Column(String, default="")
    part_number = Column(String, default="")
    brand = Column(String, default="")
    machine_group = Column(String, default="")
    uom = Column(String, default="Pcs")
    box = Column(String, default="")
    level = Column(String, default="")
    unit_price = Column(Float, default=0.0)
    on_hand = Column(Float, default=0.0)
    min_level = Column(Float, default=0.0)
    max_level = Column(Float, default=0.0)
    reorder_point = Column(Float, default=0.0)
    lead_time_months = Column(Float, default=2.0)
    source_sheet = Column(String, default="")
    last_receipt = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
    image_ver = Column(Integer, default=0)               # 0 = no photo; bumps on each upload


class Requisition(Base):
    __tablename__ = "requisition"
    id = Column(Integer, primary_key=True)
    ref_no = Column(String, unique=True, index=True)
    requester_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    requester_name = Column(String, default="")
    machine_id = Column(Integer, ForeignKey("machine.id"), nullable=True)
    machine_name = Column(String, default="")
    problem = Column(String, default="")
    note = Column(String, default="")
    photo_path = Column(String, default="")
    status = Column(String, default="draft")           # draft|confirmed|reconciled|cancelled
    source = Column(String, default="web")             # web|line
    created_at = Column(DateTime, default=datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)


class ReqLine(Base):
    __tablename__ = "reqline"
    id = Column(Integer, primary_key=True)
    requisition_id = Column(Integer, ForeignKey("requisition.id"), index=True)
    item_id = Column(Integer, ForeignKey("item.id"))
    item_code = Column(String, default="")
    description = Column(String, default="")
    qty = Column(Float, default=0.0)
    counted_qty = Column(Float, nullable=True)
    system_after = Column(Float, nullable=True)
    returned_qty = Column(Float, default=0.0)          # total returned to stock


class StockTxn(Base):
    __tablename__ = "stocktxn"
    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("item.id"), index=True)
    item_code = Column(String, default="")
    txn_type = Column(String, default="issue")         # receive|issue|adjust
    qty = Column(Float, default=0.0)
    balance_after = Column(Float, default=0.0)
    ref = Column(String, default="")
    user_id = Column(Integer, nullable=True)
    machine_name = Column(String, default="")
    note = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class Setting(Base):
    """Key/value app settings editable from the admin UI (notification config etc.)."""
    __tablename__ = "setting"
    key = Column(String, primary_key=True)
    value = Column(String, default="")


class PurchaseOrder(Base):
    __tablename__ = "purchase_order"
    id = Column(Integer, primary_key=True)
    po_no = Column(String, unique=True, index=True)
    status = Column(String, default="ordered")     # ordered | received | cancelled
    created_by = Column(String, default="")
    note = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    received_at = Column(DateTime, nullable=True)


class POLine(Base):
    __tablename__ = "po_line"
    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("purchase_order.id"), index=True)
    item_id = Column(Integer, ForeignKey("item.id"))
    item_code = Column(String, default="")
    description = Column(String, default="")
    qty = Column(Float, default=0.0)
    received_qty = Column(Float, nullable=True)
    unit_price = Column(Float, default=0.0)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, default=datetime.utcnow, index=True)
    username = Column(String, default="")
    role = Column(String, default="")
    action = Column(String, default="")            # login | issue | receive | user | setting | po ...
    detail = Column(String, default="")
    ip = Column(String, default="")


class ReturnLog(Base):
    """A part returned to stock after being withdrawn (e.g. wrong part taken)."""
    __tablename__ = "return_log"
    id = Column(Integer, primary_key=True)
    requisition_id = Column(Integer, ForeignKey("requisition.id"), index=True)
    reqline_id = Column(Integer, ForeignKey("reqline.id"), index=True)
    item_id = Column(Integer, ForeignKey("item.id"), index=True)
    item_code = Column(String, default="")
    qty = Column(Float, default=0.0)
    reason = Column(String, default="")
    returned_by = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class ImageBlob(Base):
    """Pictures stored IN the database (part photos, requisition photos) so they
    survive restarts on hosts with temporary disks (e.g. Render free plan)."""
    __tablename__ = "image_blob"
    __table_args__ = (UniqueConstraint("owner_type", "owner_id", "variant", name="uq_image_owner"),)
    id = Column(Integer, primary_key=True)
    owner_type = Column(String, index=True)              # item | req
    owner_id = Column(Integer, index=True)
    variant = Column(String, default="full")             # full | thumb
    mime = Column(String, default="image/jpeg")
    data = Column(LargeBinary)
    size = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
