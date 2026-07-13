from __future__ import annotations

from typing import List

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.db import get_db
from models import (
    ReviewSessionTradeLink,
    ReviewTradeLink,
    Trade,
    TradeBroker,
    TradePlan,
    TradePlanTradeLink,
)
from services import notes_runtime
from trading.source_service import attach_trade_view_fields as _attach_trade_view_fields


def list_recycle_trades(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Trade)
        .filter(Trade.is_deleted == True)  # noqa: E712
        .order_by(Trade.deleted_at.desc(), Trade.id.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )
    return _attach_trade_view_fields(db, rows)


def restore_recycle_trade(trade_id: int, db: Session = Depends(get_db)):
    row = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == True).first()  # noqa: E712
    if not row:
        raise HTTPException(404, "Trade not found in recycle bin")
    row.is_deleted = False
    row.deleted_at = None
    db.commit()
    db.refresh(row)
    return _attach_trade_view_fields(db, [row])[0]


def purge_recycle_trade(trade_id: int, db: Session = Depends(get_db)):
    row = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == True).first()  # noqa: E712
    if not row:
        raise HTTPException(404, "Trade not found in recycle bin")
    db.query(ReviewSessionTradeLink).filter(ReviewSessionTradeLink.trade_id == trade_id).delete(synchronize_session=False)
    db.query(TradePlanTradeLink).filter(TradePlanTradeLink.trade_id == trade_id).delete(synchronize_session=False)
    db.query(ReviewTradeLink).filter(ReviewTradeLink.trade_id == trade_id).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
    return {"ok": True}


def list_recycle_trade_brokers(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return (
        db.query(TradeBroker)
        .filter(TradeBroker.is_deleted == True)  # noqa: E712
        .order_by(TradeBroker.deleted_at.desc(), TradeBroker.id.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )


def restore_recycle_trade_broker(broker_id: int, db: Session = Depends(get_db)):
    row = db.query(TradeBroker).filter(TradeBroker.id == broker_id, TradeBroker.is_deleted == True).first()  # noqa: E712
    if not row:
        raise HTTPException(404, "Trade broker not found in recycle bin")
    row.is_deleted = False
    row.deleted_at = None
    db.commit()
    db.refresh(row)
    return row


def purge_recycle_trade_broker(broker_id: int, db: Session = Depends(get_db)):
    row = db.query(TradeBroker).filter(TradeBroker.id == broker_id, TradeBroker.is_deleted == True).first()  # noqa: E712
    if not row:
        raise HTTPException(404, "Trade broker not found in recycle bin")
    db.delete(row)
    db.commit()
    return {"ok": True}
def _attach_trade_plan_fields(db: Session, rows: List[TradePlan]) -> List[TradePlan]:
    from services import trade_plan_runtime

    return trade_plan_runtime._attach_trade_plan_fields(db, rows)


def list_recycle_trade_plans(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(TradePlan)
        .filter(TradePlan.is_deleted == True)  # noqa: E712
        .order_by(TradePlan.deleted_at.desc(), TradePlan.id.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )
    return _attach_trade_plan_fields(db, rows)


def restore_recycle_trade_plan(trade_plan_id: int, db: Session = Depends(get_db)):
    row = db.query(TradePlan).filter(TradePlan.id == trade_plan_id, TradePlan.is_deleted == True).first()  # noqa: E712
    if not row:
        raise HTTPException(404, "Trade plan not found in recycle bin")
    row.is_deleted = False
    row.deleted_at = None
    db.commit()
    db.refresh(row)
    return _attach_trade_plan_fields(db, [row])[0]


def purge_recycle_trade_plan(trade_plan_id: int, db: Session = Depends(get_db)):
    row = db.query(TradePlan).filter(TradePlan.id == trade_plan_id, TradePlan.is_deleted == True).first()  # noqa: E712
    if not row:
        raise HTTPException(404, "Trade plan not found in recycle bin")
    db.delete(row)
    db.commit()
    return {"ok": True}


def clear_recycle_trades(db: Session = Depends(get_db)):
    rows = db.query(Trade).filter(Trade.is_deleted == True).all()
    if not rows:
        return {"ok": True, "cleared": 0}
    trade_ids = [r.id for r in rows]
    db.query(ReviewSessionTradeLink).filter(ReviewSessionTradeLink.trade_id.in_(trade_ids)).delete(synchronize_session=False)
    db.query(TradePlanTradeLink).filter(TradePlanTradeLink.trade_id.in_(trade_ids)).delete(synchronize_session=False)
    db.query(ReviewTradeLink).filter(ReviewTradeLink.trade_id.in_(trade_ids)).delete(synchronize_session=False)
    for row in rows:
        db.delete(row)
    db.commit()
    return {"ok": True, "cleared": len(rows)}


def clear_recycle_trade_brokers(db: Session = Depends(get_db)):
    rows = db.query(TradeBroker).filter(TradeBroker.is_deleted == True).all()
    if not rows:
        return {"ok": True, "cleared": 0}
    for row in rows:
        db.delete(row)
    db.commit()
    return {"ok": True, "cleared": len(rows)}


def clear_recycle_trade_plans(db: Session = Depends(get_db)):
    rows = db.query(TradePlan).filter(TradePlan.is_deleted == True).all()
    if not rows:
        return {"ok": True, "cleared": 0}
    for row in rows:
        db.delete(row)
    db.commit()
    return {"ok": True, "cleared": len(rows)}


list_recycle_notes = notes_runtime.list_recycle_notes
restore_note = notes_runtime.restore_note
purge_note = notes_runtime.purge_note
clear_recycle_notes = notes_runtime.clear_recycle_notes
