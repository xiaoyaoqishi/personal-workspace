from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.db import get_db
from models import Trade
from schemas import TradePasteImportError, TradePasteImportRequest, TradePasteImportResponse
from services import runtime as legacy_runtime
from services import trading_runtime
from trading.import_service import import_paste_trades_staged


PASTE_TRADE_HEADERS = [
    "交易日期",
    "合约",
    "买/卖",
    "投机（一般）/套保/套利",
    "成交价",
    "手数",
    "成交额",
    "开/平",
    "手续费",
    "平仓盈亏",
]


def _parse_cn_date(value: str) -> date:
    text = str(value or "").strip()
    if not text:
        raise ValueError("交易日期为空")
    if text.replace(".", "", 1).isdigit():
        excel_value = float(text)
        if excel_value > 20000:
            return date(1899, 12, 30) + timedelta(days=int(excel_value))
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"无法识别交易日期: {text}")


def _parse_float(value: str, field: str) -> float:
    text = str(value or "").replace("\xa0", " ").strip().replace(",", "")
    if text in {"", "-", "--", "—", "——", "null", "None"}:
        return 0.0
    try:
        return float(text)
    except Exception as exc:
        raise ValueError(f"{field}格式错误: {value}") from exc


def _map_direction(value: str) -> str:
    text = str(value or "").replace("\xa0", " ").strip()
    if text in {"买", "买入", "多", "做多"}:
        return "做多"
    if text in {"卖", "卖出", "空", "做空"}:
        return "做空"
    raise ValueError(f"买/卖无法识别: {value}")


def _map_open_close(value: str) -> str:
    text = str(value or "").replace("\xa0", " ").strip()
    if "平" in text:
        return "closed"
    if "开" in text:
        return "open"
    raise ValueError(f"开/平无法识别: {value}")


def _parse_paste_row(cells: List[str], broker: Optional[str]) -> Trade:
    normalized_cells = list(cells or [])
    if len(normalized_cells) == 9:
        normalized_cells = [date.today().isoformat(), *normalized_cells]
    if len(normalized_cells) < 10:
        raise ValueError("列数不足，期望10列；若无交易日期可录入9列自动补当天")

    trade_day = _parse_cn_date(normalized_cells[0])
    contract = str(normalized_cells[1] or "").strip()
    if not contract:
        raise ValueError("合约为空")

    direction = _map_direction(normalized_cells[2])
    category = str(normalized_cells[3] or "").strip() or None
    open_price = _parse_float(normalized_cells[4], "成交价")
    quantity = _parse_float(normalized_cells[5], "手数")
    if quantity <= 0:
        raise ValueError("手数必须大于0")
    _parse_float(normalized_cells[6], "成交额")
    status = _map_open_close(normalized_cells[7])
    commission = _parse_float(normalized_cells[8], "手续费")
    pnl = _parse_float(normalized_cells[9], "平仓盈亏")

    open_time = datetime.combine(trade_day, datetime.min.time()).replace(hour=9, minute=0, second=0)
    close_time = None
    close_price = None
    if status == "closed":
        close_time = datetime.combine(trade_day, datetime.min.time()).replace(hour=15, minute=0, second=0)
        close_price = open_price

    notes = []
    if broker:
        notes.append(f"来源券商: {broker}")
    notes.append("来源: 日结单粘贴导入")
    return Trade(
        trade_date=trade_day,
        instrument_type="期货",
        symbol=trading_runtime._normalize_contract_symbol(contract),
        contract=contract,
        category=category,
        direction=direction,
        open_time=open_time,
        close_time=close_time,
        open_price=open_price,
        close_price=close_price,
        quantity=quantity,
        commission=commission,
        pnl=pnl,
        status=status,
        notes=" | ".join(notes),
        owner_role=legacy_runtime._owner_role_value_for_create(),
    )


def _copy_trade_for_closed_part(
    source: Trade,
    close_qty: float,
    close_price: float,
    close_time: datetime,
    close_commission: float,
    close_pnl: float,
) -> Trade:
    open_commission_part = float(source.commission or 0) * close_qty / float(source.quantity or 1)
    return Trade(
        trade_date=source.trade_date,
        instrument_type=source.instrument_type,
        symbol=source.symbol,
        contract=source.contract,
        category=source.category,
        direction=source.direction,
        open_time=source.open_time,
        close_time=close_time,
        open_price=source.open_price,
        close_price=close_price,
        quantity=close_qty,
        margin=source.margin,
        commission=round(open_commission_part + close_commission, 6),
        slippage=source.slippage,
        pnl=round(close_pnl, 6),
        pnl_points=source.pnl_points,
        holding_duration=source.holding_duration,
        is_overnight=source.is_overnight,
        trading_session=source.trading_session,
        status="closed",
        is_main_contract=source.is_main_contract,
        is_near_delivery=source.is_near_delivery,
        is_contract_switch=source.is_contract_switch,
        is_high_volatility=source.is_high_volatility,
        is_near_data_release=source.is_near_data_release,
        entry_logic=source.entry_logic,
        exit_logic=source.exit_logic,
        strategy_type=source.strategy_type,
        market_condition=source.market_condition,
        timeframe=source.timeframe,
        core_signal=source.core_signal,
        stop_loss_plan=source.stop_loss_plan,
        target_plan=source.target_plan,
        followed_plan=source.followed_plan,
        is_planned=source.is_planned,
        is_impulsive=source.is_impulsive,
        is_chasing=source.is_chasing,
        is_holding_loss=source.is_holding_loss,
        is_early_profit=source.is_early_profit,
        is_extended_stop=source.is_extended_stop,
        is_overweight=source.is_overweight,
        is_revenge=source.is_revenge,
        is_emotional=source.is_emotional,
        mental_state=source.mental_state,
        physical_state=source.physical_state,
        pre_opportunity=source.pre_opportunity,
        pre_win_reason=source.pre_win_reason,
        pre_risk=source.pre_risk,
        during_match_expectation=source.during_match_expectation,
        during_plan_changed=source.during_plan_changed,
        post_quality=source.post_quality,
        post_repeat=source.post_repeat,
        post_root_cause=source.post_root_cause,
        post_replicable=source.post_replicable,
        error_tags=source.error_tags,
        review_note=source.review_note,
        notes=trading_runtime._append_note(source.notes, "来源: 自动平仓拆分"),
        owner_role=source.owner_role or legacy_runtime._owner_role_value_for_create(),
    )


def _apply_close_fill_to_db(db: Session, fill: Trade, broker: Optional[str] = None):
    db.flush()
    symbol = trading_runtime._normalize_contract_symbol(fill.contract or fill.symbol or "")
    contract_norm = trading_runtime._state_key_contract(symbol, fill.contract, fill.direction).split("::")[1]
    close_side = trading_runtime._position_side(fill.direction, "closed")
    close_time = fill.close_time or datetime.combine(fill.trade_date, datetime.min.time()).replace(hour=15)

    query = db.query(Trade).filter(
        Trade.is_deleted == False,  # noqa: E712
        Trade.instrument_type == "期货",
        Trade.symbol == symbol,
        Trade.direction == close_side,
        Trade.status == "open",
        Trade.owner_role == (fill.owner_role or legacy_runtime._owner_role_value_for_create()),
        Trade.trade_date <= fill.trade_date,
        or_(Trade.open_time.is_(None), Trade.open_time <= close_time),
    )
    if contract_norm:
        query = query.filter(func.upper(func.replace(func.trim(Trade.contract), " ", "")) == contract_norm)
    if broker:
        query = query.filter(Trade.notes.contains(f"来源券商: {broker}"))

    open_rows = query.order_by(Trade.open_time.asc(), Trade.id.asc()).all()
    remaining = float(fill.quantity or 0)
    if remaining <= 0:
        raise ValueError("平仓手数必须大于0")

    total_open = sum(float(row.quantity or 0) for row in open_rows)
    if total_open + 1e-9 < remaining:
        raise ValueError(f"{symbol} {close_side} 平仓失败：可匹配持仓不足（平仓时间早于对应开仓时间）")

    close_price = float(fill.open_price or 0)
    close_commission_total = float(fill.commission or 0)
    close_pnl_total = float(fill.pnl or 0)
    close_qty_total = float(fill.quantity or 1)
    affected_rows: List[Trade] = []

    for row in open_rows:
        if remaining <= 1e-9:
            break
        row_qty = float(row.quantity or 0)
        if row_qty <= 0:
            continue
        take = min(row_qty, remaining)
        ratio = take / close_qty_total
        close_commission_part = close_commission_total * ratio
        close_pnl_part = close_pnl_total * ratio

        if abs(take - row_qty) <= 1e-9:
            row.status = "closed"
            row.close_price = close_price
            row.close_time = close_time
            row.pnl = round(close_pnl_part, 6)
            row.commission = round(float(row.commission or 0) + close_commission_part, 6)
            row.notes = trading_runtime._append_note(row.notes, "来源: 自动平仓匹配")
            affected_rows.append(row)
        else:
            remaining_qty = row_qty - take
            closed_row = _copy_trade_for_closed_part(
                row,
                close_qty=take,
                close_price=close_price,
                close_time=close_time,
                close_commission=close_commission_part,
                close_pnl=close_pnl_part,
            )
            db.add(closed_row)
            affected_rows.append(closed_row)
            open_commission_total = float(row.commission or 0)
            row.quantity = round(remaining_qty, 6)
            row.commission = round(open_commission_total * (remaining_qty / row_qty), 6)
            row.notes = trading_runtime._append_note(row.notes, "部分平仓后自动拆分")
            affected_rows.append(row)
        remaining -= take
    return affected_rows


def import_trades_from_paste(payload: TradePasteImportRequest, db: Session = Depends(get_db)):
    try:
        return import_paste_trades_staged(
            db,
            raw_text=payload.raw_text,
            broker=payload.broker,
            paste_headers=PASTE_TRADE_HEADERS,
            parse_paste_row=_parse_paste_row,
            normalize_contract_symbol=trading_runtime._normalize_contract_symbol,
            position_side=trading_runtime._position_side,
            state_key_contract=trading_runtime._state_key_contract,
            apply_close_fill_to_db=_apply_close_fill_to_db,
            upsert_trade_source_metadata_for_import=trading_runtime._upsert_trade_source_metadata_for_import,
            error_cls=TradePasteImportError,
            response_cls=TradePasteImportResponse,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
