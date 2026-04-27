from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from core.db import get_db
from models import TradeBroker
from schemas import TradeBrokerCreate, TradeBrokerUpdate
from services import runtime as legacy_runtime


def list_trade_brokers(owner_role: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(TradeBroker).filter(TradeBroker.is_deleted == False)  # noqa: E712
    role_filter = legacy_runtime._owner_role_filter_for_admin(TradeBroker, owner_role)
    if role_filter is not None:
        query = query.filter(role_filter)
    return query.order_by(TradeBroker.updated_at.desc(), TradeBroker.id.desc()).all()


def create_trade_broker(data: TradeBrokerCreate, db: Session = Depends(get_db)):
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(400, "名称不能为空")

    existed = db.query(TradeBroker).filter(TradeBroker.name == name).first()
    if existed and not existed.is_deleted:
        raise HTTPException(400, "该名称已存在")

    if existed and existed.is_deleted:
        existed.is_deleted = False
        existed.deleted_at = None
        existed.account = (data.account or "").strip() or None
        existed.password = (data.password or "").strip() or None
        existed.extra_info = (data.extra_info or "").strip() or None
        existed.notes = (data.notes or "").strip() or None
        db.commit()
        db.refresh(existed)
        return existed

    obj = TradeBroker(
        name=name,
        account=(data.account or "").strip() or None,
        password=(data.password or "").strip() or None,
        extra_info=(data.extra_info or "").strip() or None,
        notes=(data.notes or "").strip() or None,
        owner_role=legacy_runtime._owner_role_value_for_create(),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_trade_broker(broker_id: int, data: TradeBrokerUpdate, db: Session = Depends(get_db)):
    obj = db.query(TradeBroker).filter(TradeBroker.id == broker_id, TradeBroker.is_deleted == False).first()  # noqa: E712
    if not obj:
        raise HTTPException(404, "券商不存在")

    payload = data.model_dump(exclude_unset=True)
    if "name" in payload:
        new_name = (payload.get("name") or "").strip()
        if not new_name:
            raise HTTPException(400, "名称不能为空")
        existed = db.query(TradeBroker).filter(TradeBroker.name == new_name, TradeBroker.id != broker_id).first()
        if existed:
            raise HTTPException(400, "该名称已存在")
        obj.name = new_name

    if "account" in payload:
        obj.account = (payload.get("account") or "").strip() or None
    if "password" in payload:
        obj.password = (payload.get("password") or "").strip() or None
    if "extra_info" in payload:
        obj.extra_info = (payload.get("extra_info") or "").strip() or None
    if "notes" in payload:
        obj.notes = (payload.get("notes") or "").strip() or None

    db.commit()
    db.refresh(obj)
    return obj


def delete_trade_broker(broker_id: int, db: Session = Depends(get_db)):
    obj = db.query(TradeBroker).filter(TradeBroker.id == broker_id, TradeBroker.is_deleted == False).first()  # noqa: E712
    if not obj:
        raise HTTPException(404, "券商不存在")
    obj.is_deleted = True
    obj.deleted_at = datetime.now()
    db.commit()
    return {"ok": True}
