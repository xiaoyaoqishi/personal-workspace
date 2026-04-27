from __future__ import annotations

import json
from typing import Optional

from fastapi import Depends, Query
from sqlalchemy.orm import Session

from core.db import get_db
from models import Trade
from services import trading_runtime
from trading.analytics_service import build_trade_analytics


def count_trades(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    instrument_type: Optional[str] = None,
    symbol: Optional[str] = None,
    direction: Optional[str] = None,
    status: Optional[str] = None,
    strategy_type: Optional[str] = None,
    source_keyword: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    min_star_rating: Optional[int] = Query(None, ge=1, le=5),
    max_star_rating: Optional[int] = Query(None, ge=1, le=5),
    owner_role: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Trade).filter(Trade.is_deleted == False)  # noqa: E712
    query = trading_runtime._apply_trade_filters(
        query,
        date_from=date_from,
        date_to=date_to,
        instrument_type=instrument_type,
        symbol=symbol,
        direction=direction,
        status=status,
        strategy_type=strategy_type,
        source_keyword=source_keyword,
        is_favorite=is_favorite,
        min_star_rating=min_star_rating,
        max_star_rating=max_star_rating,
        owner_role=owner_role,
    )
    return {"total": query.count()}


def get_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    instrument_type: Optional[str] = None,
    symbol: Optional[str] = None,
    source_keyword: Optional[str] = None,
    owner_role: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Trade).filter(Trade.is_deleted == False, Trade.status == "closed")  # noqa: E712
    query = trading_runtime._apply_trade_filters(
        query,
        date_from=date_from,
        date_to=date_to,
        instrument_type=instrument_type,
        symbol=symbol,
        status="closed",
        source_keyword=source_keyword,
        owner_role=owner_role,
    )

    trades = query.all()
    empty = {
        "total": 0,
        "win_count": 0,
        "loss_count": 0,
        "win_rate": 0,
        "total_pnl": 0,
        "avg_pnl": 0,
        "max_pnl": 0,
        "min_pnl": 0,
        "avg_win": 0,
        "avg_loss": 0,
        "profit_loss_ratio": 0,
        "max_consecutive_wins": 0,
        "max_consecutive_losses": 0,
        "pnl_by_symbol": [],
        "pnl_by_strategy": [],
        "pnl_over_time": [],
        "error_tag_counts": [],
    }
    if not trades:
        return empty

    pnls = [trade.pnl or 0 for trade in trades]
    wins = [pnl for pnl in pnls if pnl > 0]
    losses = [pnl for pnl in pnls if pnl < 0]

    max_consecutive_wins = max_consecutive_losses = current_wins = current_losses = 0
    for pnl in pnls:
        if pnl > 0:
            current_wins += 1
            current_losses = 0
            max_consecutive_wins = max(max_consecutive_wins, current_wins)
        elif pnl < 0:
            current_losses += 1
            current_wins = 0
            max_consecutive_losses = max(max_consecutive_losses, current_losses)
        else:
            current_wins = 0
            current_losses = 0

    symbol_pnl = {}
    for trade in trades:
        symbol_pnl[trade.symbol] = symbol_pnl.get(trade.symbol, 0) + (trade.pnl or 0)

    strategy_stats = {}
    for trade in trades:
        if not trade.strategy_type:
            continue
        stats = strategy_stats.setdefault(trade.strategy_type, {"pnl": 0, "count": 0, "wins": 0})
        stats["pnl"] += trade.pnl or 0
        stats["count"] += 1
        if (trade.pnl or 0) > 0:
            stats["wins"] += 1

    daily_pnl = {}
    for trade in trades:
        key = str(trade.trade_date)
        daily_pnl[key] = daily_pnl.get(key, 0) + (trade.pnl or 0)

    cumulative = 0
    pnl_over_time = []
    for key in sorted(daily_pnl):
        cumulative += daily_pnl[key]
        pnl_over_time.append(
            {
                "date": key,
                "daily_pnl": round(daily_pnl[key], 2),
                "cumulative_pnl": round(cumulative, 2),
            }
        )

    error_counts = {}
    for trade in trades:
        if not trade.error_tags:
            continue
        try:
            for tag in json.loads(trade.error_tags):
                error_counts[tag] = error_counts.get(tag, 0) + 1
        except Exception:
            pass

    avg_win = round(sum(wins) / len(wins), 2) if wins else 0
    avg_loss = round(sum(losses) / len(losses), 2) if losses else 0
    return {
        "total": len(trades),
        "win_count": len(wins),
        "loss_count": len(losses),
        "win_rate": round(len(wins) / len(trades) * 100, 2),
        "total_pnl": round(sum(pnls), 2),
        "avg_pnl": round(sum(pnls) / len(pnls), 2),
        "max_pnl": round(max(pnls), 2),
        "min_pnl": round(min(pnls), 2),
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "profit_loss_ratio": round(abs(avg_win / avg_loss), 2) if avg_loss else 0,
        "max_consecutive_wins": max_consecutive_wins,
        "max_consecutive_losses": max_consecutive_losses,
        "pnl_by_symbol": [
            {"symbol": key, "pnl": round(value, 2)}
            for key, value in sorted(symbol_pnl.items(), key=lambda item: item[1], reverse=True)
        ],
        "pnl_by_strategy": [
            {
                "strategy": key,
                "pnl": round(value["pnl"], 2),
                "count": value["count"],
                "win_rate": round(value["wins"] / value["count"] * 100, 2),
            }
            for key, value in strategy_stats.items()
        ],
        "pnl_over_time": pnl_over_time,
        "error_tag_counts": [
            {"tag": key, "count": value}
            for key, value in sorted(error_counts.items(), key=lambda item: item[1], reverse=True)
        ],
    }


def get_trade_analytics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    instrument_type: Optional[str] = None,
    symbol: Optional[str] = None,
    source_keyword: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return build_trade_analytics(
        db,
        date_from=date_from,
        date_to=date_to,
        instrument_type=instrument_type,
        symbol=symbol,
        source_keyword=source_keyword,
        apply_source_keyword_filter=trading_runtime._apply_source_keyword_filter,
        attach_trade_view_fields=trading_runtime._attach_trade_view_fields,
        build_position_state_from_db=trading_runtime._build_position_state_from_db,
        extract_source_from_notes=trading_runtime._extract_source_from_notes,
    )
