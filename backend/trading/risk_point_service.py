from typing import List, Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from core.db import get_db
from models import Trade, TradeRiskPointHistory
from schemas import TradeRiskPointHistoryResponse


def add_risk_point_snapshot(db: Session, trade: Trade) -> TradeRiskPointHistory:
    snapshot = TradeRiskPointHistory(
        trade_id=trade.id,
        stop_loss_point=trade.stop_loss_point,
        target_point=trade.target_point,
        capital_percentage=trade.capital_percentage,
    )
    db.add(snapshot)
    return snapshot


def tracked_trade_values_changed(
    trade: Trade,
    *,
    stop_loss_point: Optional[float],
    target_point: Optional[float],
    capital_percentage: Optional[float],
) -> bool:
    return (
        trade.stop_loss_point != stop_loss_point
        or trade.target_point != target_point
        or trade.capital_percentage != capital_percentage
    )


def list_trade_risk_point_history(
    trade_id: int,
    db: Session = Depends(get_db),
) -> List[TradeRiskPointHistoryResponse]:
    trade = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == False).first()  # noqa: E712
    if not trade:
        raise HTTPException(404, "Trade not found")
    return (
        db.query(TradeRiskPointHistory)
        .filter(TradeRiskPointHistory.trade_id == trade_id)
        .order_by(TradeRiskPointHistory.recorded_at.desc(), TradeRiskPointHistory.id.desc())
        .all()
    )
