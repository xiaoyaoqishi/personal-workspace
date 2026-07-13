from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.db import get_db
from models import Trade, TradeSourceMetadata
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
        commission=commission,
        pnl=pnl,
        status=status,
        owner_role=legacy_runtime._owner_role_value_for_create(),
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
        query = query.join(TradeSourceMetadata, TradeSourceMetadata.trade_id == Trade.id).filter(
            TradeSourceMetadata.broker_name == broker
        )

    row = query.order_by(Trade.open_time.asc(), Trade.id.asc()).first()
    if not row:
        raise ValueError(f"{symbol} {close_side} 平仓失败：未找到对应开仓")

    row.status = "closed"
    row.close_price = float(fill.open_price or 0)
    row.close_time = close_time
    row.pnl = round(float(fill.pnl or 0), 6)
    row.commission = round(float(row.commission or 0) + float(fill.commission or 0), 6)
    return [row]


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
