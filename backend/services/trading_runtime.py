from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.db import get_db
from models import Trade, TradeReview, TradeSourceMetadata
from models.review import TradePlan, TradePlanTradeLink
from schemas import (
    TradeCreate,
    TradePositionResponse,
    TradeReviewTaxonomyResponse,
    TradeReviewUpsert,
    TradeSearchOptionItemResponse,
    TradeSearchOptionsResponse,
    TradeSourceMetadataResponse,
    TradeSourceMetadataUpsert,
    TradeUpdate,
)
from services import runtime as legacy_runtime
from services.utility_runtime import cleanup_unreferenced_uploads
from trade_review_taxonomy import trade_review_taxonomy
from trading.source_service import (
    apply_source_keyword_filter as _source_apply_source_keyword_filter,
    attach_trade_view_fields as _source_attach_trade_view_fields,
    extract_source_from_notes as _source_extract_source_from_notes,
    upsert_trade_source_metadata_for_import as _source_upsert_trade_source_metadata_for_import,
)
from trading.tag_service import (
    attach_trade_review_tags as _attach_trade_review_tags,
    normalize_tag_list as _normalize_tag_list,
    serialize_legacy_tags as _serialize_legacy_tags,
    sync_trade_review_tags as _sync_trade_review_tags,
)


def _normalize_contract_symbol(contract: str) -> str:
    value = (contract or "").strip()
    match = re.match(r"([A-Za-z]+)", value)
    if match:
        return match.group(1).upper()
    return value


def _position_side(direction: str, status: str) -> str:
    if status == "open":
        return "做多" if direction == "做多" else "做空"
    return "做空" if direction == "做多" else "做多"


def _state_key(symbol: str, side: str) -> str:
    return f"{symbol}::{side}"


def _state_key_contract(symbol: str, contract: Optional[str], side: str) -> str:
    contract_value = re.sub(r"\s+", "", (contract or "").strip()).upper()
    return f"{symbol}::{contract_value}::{side}"


def _ensure_symbol_state(
    state: Dict[str, Dict[str, Any]],
    symbol: str,
    side: str,
    contract: Optional[str],
    trade_day,
):
    key = _state_key(symbol, side)
    if key not in state:
        state[key] = {
            "symbol": symbol,
            "side": side,
            "contract": contract,
            "quantity": 0.0,
            "avg_open_price": 0.0,
            "open_since": None,
            "last_trade_date": trade_day,
            "commission": 0.0,
            "leverage": None,
        }
    current = state[key]
    if contract:
        current["contract"] = contract
    current["last_trade_date"] = trade_day
    return current


def _build_position_state_from_db(db: Session, source_keyword: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    state: Dict[str, Dict[str, Any]] = {}
    query = db.query(Trade).filter(Trade.is_deleted == False, Trade.status == "open")  # noqa: E712
    query = _apply_source_keyword_filter(query, source_keyword)
    rows = query.order_by(Trade.open_time.asc(), Trade.id.asc()).all()
    for row in rows:
        symbol = _normalize_contract_symbol(row.contract or row.symbol or "")
        side = row.direction
        is_futures = (row.instrument_type or "") == "期货"
        current = _ensure_symbol_state(state, symbol, side, row.contract, row.trade_date)
        previous_qty = float(current["quantity"])
        added_qty = float(row.quantity or 0)
        if is_futures and added_qty <= 0:
            continue
        if not is_futures and added_qty <= 0:
            added_qty = 1.0
        total_qty = previous_qty + added_qty
        previous_cost = float(current["avg_open_price"]) * previous_qty
        current["avg_open_price"] = (previous_cost + float(row.open_price or 0) * added_qty) / total_qty
        current["quantity"] = total_qty
        current["commission"] = float(current.get("commission") or 0) + float(row.commission or 0)
        if current.get("leverage") is None and getattr(row, "leverage", None) is not None:
            current["leverage"] = row.leverage
        if current["open_since"] is None:
            current["open_since"] = row.trade_date
        if row.open_time and (current["last_trade_date"] is None or row.trade_date >= current["last_trade_date"]):
            current["last_trade_date"] = row.trade_date
    return state


def _build_position_state_from_db_with_owner_role(
    db: Session,
    source_keyword: Optional[str] = None,
    owner_role: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    state: Dict[str, Dict[str, Any]] = {}
    query = db.query(Trade).filter(Trade.is_deleted == False, Trade.status == "open")  # noqa: E712
    role_filter = legacy_runtime._owner_role_filter_for_admin(Trade, owner_role)
    if role_filter is not None:
        query = query.filter(role_filter)
    query = _apply_source_keyword_filter(query, source_keyword)
    rows = query.order_by(Trade.open_time.asc(), Trade.id.asc()).all()
    for row in rows:
        symbol = _normalize_contract_symbol(row.contract or row.symbol or "")
        side = row.direction
        is_futures = (row.instrument_type or "") == "期货"
        current = _ensure_symbol_state(state, symbol, side, row.contract, row.trade_date)
        previous_qty = float(current["quantity"])
        added_qty = float(row.quantity or 0)
        if is_futures and added_qty <= 0:
            continue
        if not is_futures and added_qty <= 0:
            added_qty = 1.0
        total_qty = previous_qty + added_qty
        previous_cost = float(current["avg_open_price"]) * previous_qty
        current["avg_open_price"] = (previous_cost + float(row.open_price or 0) * added_qty) / total_qty
        current["quantity"] = total_qty
        current["commission"] = float(current.get("commission") or 0) + float(row.commission or 0)
        if current.get("leverage") is None and getattr(row, "leverage", None) is not None:
            current["leverage"] = row.leverage
        if current["open_since"] is None:
            current["open_since"] = row.trade_date
        if row.open_time and (current["last_trade_date"] is None or row.trade_date >= current["last_trade_date"]):
            current["last_trade_date"] = row.trade_date
    return state


def _append_note(base: Optional[str], extra: str) -> str:
    value = (base or "").strip()
    if not value:
        return extra
    return f"{value} | {extra}"


def _extract_source_from_notes(note: Optional[str]) -> Dict[str, Optional[str]]:
    return _source_extract_source_from_notes(note)


def _attach_trade_view_fields(db: Session, rows: List[Trade]) -> List[Trade]:
    return _source_attach_trade_view_fields(db, rows)


def _apply_source_keyword_filter(query, source_keyword: Optional[str]):
    return _source_apply_source_keyword_filter(query, source_keyword)


def _upsert_trade_source_metadata_for_import(
    db: Session,
    trade: Trade,
    broker: Optional[str],
    source_label: Optional[str] = None,
):
    _source_upsert_trade_source_metadata_for_import(
        db,
        trade,
        broker=broker,
        source_label=source_label,
    )


def _apply_trade_filters(
    query,
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    instrument_type: Optional[str] = None,
    symbol: Optional[str] = None,
    direction: Optional[str] = None,
    status: Optional[str] = None,
    strategy_type: Optional[str] = None,
    source_keyword: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    min_star_rating: Optional[int] = None,
    max_star_rating: Optional[int] = None,
    owner_role: Optional[str] = None,
):
    role_filter = legacy_runtime._owner_role_filter_for_admin(Trade, owner_role)
    if role_filter is not None:
        query = query.filter(role_filter)
    if date_from:
        query = query.filter(Trade.trade_date >= date_from)
    if date_to:
        query = query.filter(Trade.trade_date <= date_to)
    if instrument_type:
        query = query.filter(Trade.instrument_type == instrument_type)
    if symbol:
        query = query.filter(Trade.symbol == symbol)
    if direction:
        query = query.filter(Trade.direction == direction)
    if status:
        query = query.filter(Trade.status == status)
    if strategy_type:
        query = query.filter(Trade.strategy_type == strategy_type)
    if is_favorite is not None:
        query = query.filter(Trade.is_favorite == is_favorite)
    if min_star_rating is not None:
        query = query.filter(Trade.star_rating >= min_star_rating)
    if max_star_rating is not None:
        query = query.filter(Trade.star_rating <= max_star_rating)
    return _apply_source_keyword_filter(query, source_keyword)


def _parse_include_ids(include_ids: Optional[str]) -> List[int]:
    if not include_ids:
        return []
    items: List[int] = []
    seen = set()
    for part in str(include_ids).split(","):
        raw = part.strip()
        if not raw or not raw.isdigit():
            continue
        value = int(raw)
        if value <= 0 or value in seen:
            continue
        seen.add(value)
        items.append(value)
    return items


def list_trade_positions(
    symbol: Optional[str] = None,
    source_keyword: Optional[str] = None,
    owner_role: Optional[str] = None,
    db: Session = Depends(get_db),
):
    state = _build_position_state_from_db_with_owner_role(db, source_keyword=source_keyword, owner_role=owner_role)
    items = []
    for current in state.values():
        quantity = float(current.get("quantity") or 0)
        if quantity < 1e-9:
            continue
        if symbol and current["symbol"] != symbol:
            continue
        items.append(
            TradePositionResponse(
                symbol=current["symbol"],
                contract=current.get("contract"),
                net_quantity=round(quantity, 6),
                side=current.get("side") or "做多",
                avg_open_price=round(float(current.get("avg_open_price") or 0), 4),
                open_since=current.get("open_since"),
                commission=round(float(current.get("commission") or 0), 2),
                leverage=current.get("leverage"),
            )
        )
    items.sort(key=lambda item: (item.symbol, item.side))
    return items


def list_trades(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
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
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "desc",
    owner_role: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Trade).filter(Trade.is_deleted == False)  # noqa: E712
    query = _apply_trade_filters(
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
    if sort_by not in {None, "updated_at", "star_rating"}:
        raise HTTPException(400, "sort_by must be one of: updated_at, star_rating")
    if sort_order not in {"asc", "desc"}:
        raise HTTPException(400, "sort_order must be one of: asc, desc")
    order_desc = sort_order != "asc"
    if sort_by == "updated_at":
        order_expr = Trade.updated_at.desc() if order_desc else Trade.updated_at.asc()
        query = query.order_by(order_expr, Trade.id.desc())
    elif sort_by == "star_rating":
        order_expr = Trade.star_rating.desc() if order_desc else Trade.star_rating.asc()
        query = query.order_by(order_expr, Trade.updated_at.desc(), Trade.id.desc())
    else:
        query = query.order_by(Trade.open_time.desc())
    rows = query.offset((page - 1) * size).limit(size).all()
    return _attach_trade_view_fields(db, rows)


def list_trade_search_options(
    q: Optional[str] = None,
    symbol: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    include_ids: Optional[str] = None,
    owner_role: Optional[str] = None,
    limit: int = Query(30, ge=1, le=50),
    db: Session = Depends(get_db),
):
    include_trade_ids = _parse_include_ids(include_ids)
    query = (
        db.query(Trade)
        .filter(Trade.is_deleted == False)  # noqa: E712
        .outerjoin(TradeSourceMetadata, TradeSourceMetadata.trade_id == Trade.id)
    )
    role_filter = legacy_runtime._owner_role_filter_for_admin(Trade, owner_role)
    if role_filter is not None:
        query = query.filter(role_filter)
    if symbol:
        query = query.filter(Trade.symbol == symbol)
    if date_from:
        query = query.filter(Trade.trade_date >= date_from)
    if date_to:
        query = query.filter(Trade.trade_date <= date_to)
    if status:
        query = query.filter(Trade.status == status)

    keyword = (q or "").strip()
    if keyword:
        conditions = [
            Trade.symbol.contains(keyword.upper()),
            Trade.contract.contains(keyword),
            Trade.notes.contains(keyword),
            TradeSourceMetadata.broker_name.contains(keyword),
            TradeSourceMetadata.source_label.contains(keyword),
        ]
        if keyword.isdigit():
            conditions.append(Trade.id == int(keyword))
        query = query.filter(or_(*conditions))

    rows = query.order_by(Trade.open_time.desc(), Trade.id.desc()).limit(limit).all()
    ordered_rows = _attach_trade_view_fields(db, rows)
    collected_ids = {row.id for row in ordered_rows if row.id}

    missing_ids = [trade_id for trade_id in include_trade_ids if trade_id not in collected_ids]
    if missing_ids:
        include_query = db.query(Trade).filter(Trade.id.in_(missing_ids), Trade.is_deleted == False)  # noqa: E712
        include_role_filter = legacy_runtime._owner_role_filter_for_admin(Trade, owner_role)
        if include_role_filter is not None:
            include_query = include_query.filter(include_role_filter)
        include_rows = _attach_trade_view_fields(
            db,
            include_query.order_by(Trade.open_time.desc(), Trade.id.desc()).all(),
        )
        include_map = {row.id: row for row in include_rows if row.id}
        for trade_id in missing_ids:
            row = include_map.get(trade_id)
            if row:
                ordered_rows.append(row)

    trade_ids = [row.id for row in ordered_rows if row.id]
    review_conclusion_by_trade_id: Dict[int, Optional[str]] = {}
    if trade_ids:
        review_rows = db.query(TradeReview).filter(TradeReview.trade_id.in_(trade_ids)).all()
        for row in review_rows:
            review_conclusion_by_trade_id[row.trade_id] = row.review_conclusion

    items = [
        TradeSearchOptionItemResponse(
            trade_id=row.id,
            trade_date=row.trade_date,
            symbol=row.symbol,
            contract=row.contract,
            direction=row.direction,
            quantity=row.quantity,
            open_price=row.open_price,
            close_price=row.close_price,
            status=row.status,
            pnl=row.pnl,
            source_display=getattr(row, "source_display", None),
            has_trade_review=bool(getattr(row, "has_trade_review", False)),
            review_conclusion=review_conclusion_by_trade_id.get(row.id),
        )
        for row in ordered_rows
    ]
    return TradeSearchOptionsResponse(items=items)


def create_trade(trade: TradeCreate, db: Session = Depends(get_db)):
    obj = Trade(**trade.model_dump(), owner_role=legacy_runtime._owner_role_value_for_create())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _attach_trade_view_fields(db, [obj])[0]


def get_trade(trade_id: int, db: Session = Depends(get_db)):
    row = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == False).first()  # noqa: E712
    if not row:
        raise HTTPException(404, "Trade not found")
    return _attach_trade_view_fields(db, [row])[0]


def update_trade(trade_id: int, data: TradeUpdate, db: Session = Depends(get_db)):
    row = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == False).first()  # noqa: E712
    if not row:
        raise HTTPException(404, "Trade not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _attach_trade_view_fields(db, [row])[0]


def delete_trade(trade_id: int, db: Session = Depends(get_db)):
    row = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == False).first()  # noqa: E712
    if not row:
        raise HTTPException(404, "Trade not found")
    row.is_deleted = True
    row.deleted_at = datetime.now()
    db.commit()
    return {"ok": True}


def list_trade_sources(owner_role: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Trade).filter(Trade.is_deleted == False)  # noqa: E712
    role_filter = legacy_runtime._owner_role_filter_for_admin(Trade, owner_role)
    if role_filter is not None:
        query = query.filter(role_filter)
    rows = query.all()
    values = {str(getattr(row, "source_display", "")).strip() for row in _attach_trade_view_fields(db, rows)}
    return {"items": sorted(value for value in values if value)}


def list_trade_symbols(owner_role: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Trade.symbol).filter(Trade.is_deleted == False, Trade.symbol.isnot(None))  # noqa: E712
    role_filter = legacy_runtime._owner_role_filter_for_admin(Trade, owner_role)
    if role_filter is not None:
        query = query.filter(role_filter)
    rows = query.distinct().order_by(Trade.symbol.asc()).all()
    items = [str(symbol).strip() for (symbol,) in rows if str(symbol or "").strip()]
    return {"items": items}


def get_trade_review_taxonomy():
    return TradeReviewTaxonomyResponse(**trade_review_taxonomy())


def get_trade_review(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == False).first()  # noqa: E712
    if not trade:
        raise HTTPException(404, "Trade not found")
    review = db.query(TradeReview).filter(TradeReview.trade_id == trade_id).first()
    if not review:
        raise HTTPException(404, "Trade review not found")
    return _attach_trade_review_tags(db, [review])[0]


def upsert_trade_review(trade_id: int, data: TradeReviewUpsert, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == False).first()  # noqa: E712
    if not trade:
        raise HTTPException(404, "Trade not found")

    review = db.query(TradeReview).filter(TradeReview.trade_id == trade_id).first()
    previous_research_notes = review.research_notes if review else None
    if not review:
        review = TradeReview(trade_id=trade_id)
        db.add(review)

    payload = data.model_dump(exclude_unset=True)
    tags_raw = payload.pop("tags", None) if "tags" in payload else None
    legacy_tags_raw = payload.get("review_tags") if "review_tags" in payload else None
    for key, value in payload.items():
        setattr(review, key, value)

    if tags_raw is not None or legacy_tags_raw is not None:
        tag_names = _normalize_tag_list(tags_raw if tags_raw is not None else legacy_tags_raw)
        review.review_tags = _serialize_legacy_tags(tag_names)
        db.flush()
        _sync_trade_review_tags(db, review.id, tag_names)

    db.commit()
    db.refresh(review)
    cleanup_unreferenced_uploads(db, previous_research_notes)
    return _attach_trade_review_tags(db, [review])[0]


def delete_trade_review(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == False).first()  # noqa: E712
    if not trade:
        raise HTTPException(404, "Trade not found")
    review = db.query(TradeReview).filter(TradeReview.trade_id == trade_id).first()
    if not review:
        return {"ok": True}
    previous_research_notes = review.research_notes
    db.delete(review)
    db.commit()
    cleanup_unreferenced_uploads(db, previous_research_notes)
    return {"ok": True}


def get_trade_source_metadata(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == False).first()  # noqa: E712
    if not trade:
        raise HTTPException(404, "Trade not found")

    row = db.query(TradeSourceMetadata).filter(TradeSourceMetadata.trade_id == trade_id).first()
    if row:
        return TradeSourceMetadataResponse(
            id=row.id,
            trade_id=row.trade_id,
            broker_name=row.broker_name,
            source_label=row.source_label,
            import_channel=row.import_channel,
            source_note_snapshot=row.source_note_snapshot,
            parser_version=row.parser_version,
            derived_from_notes=bool(row.derived_from_notes),
            created_at=row.created_at,
            updated_at=row.updated_at,
            exists_in_db=True,
        )

    parsed = _extract_source_from_notes(trade.notes)
    return TradeSourceMetadataResponse(
        trade_id=trade_id,
        broker_name=parsed["broker_name"],
        source_label=parsed["source_label"],
        import_channel=None,
        source_note_snapshot=trade.notes,
        parser_version=None,
        derived_from_notes=True,
        exists_in_db=False,
    )


def upsert_trade_source_metadata(trade_id: int, data: TradeSourceMetadataUpsert, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == False).first()  # noqa: E712
    if not trade:
        raise HTTPException(404, "Trade not found")

    row = db.query(TradeSourceMetadata).filter(TradeSourceMetadata.trade_id == trade_id).first()
    if not row:
        row = TradeSourceMetadata(trade_id=trade_id)
        db.add(row)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return TradeSourceMetadataResponse(
        id=row.id,
        trade_id=row.trade_id,
        broker_name=row.broker_name,
        source_label=row.source_label,
        import_channel=row.import_channel,
        source_note_snapshot=row.source_note_snapshot,
        parser_version=row.parser_version,
        derived_from_notes=bool(row.derived_from_notes),
        created_at=row.created_at,
        updated_at=row.updated_at,
        exists_in_db=True,
    )


def get_trade_linked_plans(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id, Trade.is_deleted == False).first()  # noqa: E712
    if not trade:
        raise HTTPException(404, "Trade not found")
    links = (
        db.query(TradePlanTradeLink)
        .filter(TradePlanTradeLink.trade_id == trade_id)
        .all()
    )
    plan_ids = [link.trade_plan_id for link in links]
    if not plan_ids:
        return []
    plans = (
        db.query(TradePlan)
        .filter(TradePlan.id.in_(plan_ids), TradePlan.is_deleted == False)  # noqa: E712
        .all()
    )
    return [
        {
            "id": p.id,
            "title": p.title,
            "plan_date": str(p.plan_date) if p.plan_date else None,
            "status": p.status,
            "symbol": p.symbol,
            "contract": p.contract,
            "direction_bias": p.direction_bias,
            "setup_type": p.setup_type,
            "entry_zone": p.entry_zone,
            "stop_loss_plan": p.stop_loss_plan,
            "target_plan": p.target_plan,
            "invalid_condition": p.invalid_condition,
            "thesis": p.thesis,
            "risk_notes": p.risk_notes,
            "execution_checklist": p.execution_checklist,
            "priority": p.priority,
        }
        for p in plans
    ]
