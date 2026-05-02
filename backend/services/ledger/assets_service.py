from __future__ import annotations

import json
import math
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.errors import AppError
from models import LedgerAsset, LedgerAssetEvent
from services.ledger import apply_owner_scope, owner_role_for_create

ACTIVE_ASSET_STATUSES = {"in_use"}


def _safe_json_load(raw: Any, fallback: Any):
    try:
        parsed = json.loads(raw or "")
        return parsed if isinstance(parsed, type(fallback)) else fallback
    except Exception:
        return fallback


def decode_string_list(raw: Any) -> list[str]:
    source = _safe_json_load(raw, []) if isinstance(raw, str) else raw
    if not isinstance(source, list):
        return []
    out: list[str] = []
    for item in source:
        text = str(item or "").strip()
        if text:
            out.append(text)
    return out


def encode_string_list(value: Any) -> str:
    source = value if isinstance(value, list) else []
    normalized = [str(item or "").strip() for item in source if str(item or "").strip()]
    return json.dumps(normalized, ensure_ascii=False)


def decode_json_dict(raw: Any) -> dict[str, Any]:
    source = _safe_json_load(raw, {}) if isinstance(raw, str) else raw
    return source if isinstance(source, dict) else {}


def encode_json_dict(value: Any) -> str:
    source = value if isinstance(value, dict) else {}
    return json.dumps(source, ensure_ascii=False)


def _normalize_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _round_money(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), 2)


def _coerce_money(value: Any) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def _visible_asset_query(db: Session, role: str, include_deleted: bool = False):
    q = db.query(LedgerAsset)
    q = apply_owner_scope(q, LedgerAsset, role)
    if not include_deleted:
        q = q.filter(LedgerAsset.is_deleted == False)  # noqa: E712
    return q


def _get_asset_or_404(db: Session, role: str, asset_id: int, include_deleted: bool = False) -> LedgerAsset:
    row = _visible_asset_query(db, role, include_deleted=include_deleted).filter(LedgerAsset.id == asset_id).first()
    if not row:
        raise AppError("not_found", "资产不存在", status_code=404)
    return row


def _get_asset_event_or_404(db: Session, asset: LedgerAsset, event_id: int) -> LedgerAssetEvent:
    row = (
        db.query(LedgerAssetEvent)
        .filter(
            LedgerAssetEvent.id == event_id,
            LedgerAssetEvent.asset_id == asset.id,
            LedgerAssetEvent.owner_role == asset.owner_role,
        )
        .first()
    )
    if not row:
        raise AppError("not_found", "资产事件不存在", status_code=404)
    return row


def _date_diff_inclusive(start: Optional[date], end: Optional[date]) -> Optional[int]:
    if not start or not end:
        return None
    if end < start:
        return 0
    return (end - start).days + 1


def calculate_asset_metrics(asset: LedgerAsset) -> dict[str, Any]:
    today = date.today()
    purchase_price = float(asset.purchase_price or 0)
    extra_cost = float(asset.extra_cost or 0)
    total_cost = round(purchase_price + extra_cost, 2)

    holding_end = asset.end_date or today
    holding_days = _date_diff_inclusive(asset.purchase_date, holding_end)

    use_start = asset.start_use_date or asset.purchase_date
    use_end = asset.end_date or today
    use_days = _date_diff_inclusive(use_start, use_end)

    sale_price = _coerce_money(asset.sale_price)
    target_daily_cost = _coerce_money(asset.target_daily_cost)

    realized_consumption_cost = None
    profit_loss = None
    if asset.status == "sold" and sale_price is not None:
        realized_consumption_cost = round(total_cost - sale_price, 2)
        profit_loss = round(sale_price - total_cost, 2)

    cash_daily_cost = round(total_cost / use_days, 2) if use_days and use_days > 0 else None
    realized_daily_cost = (
        round(realized_consumption_cost / use_days, 2)
        if use_days and use_days > 0 and realized_consumption_cost is not None
        else None
    )

    target_progress = None
    days_to_target = None
    if target_daily_cost and target_daily_cost > 0 and use_days is not None:
        required_days = int(math.ceil(total_cost / target_daily_cost)) if total_cost > 0 else 0
        if required_days > 0:
            target_progress = round(use_days / required_days, 4)
            days_to_target = max(required_days - use_days, 0)
        else:
            target_progress = 1.0
            days_to_target = 0

    return {
        "holding_days": holding_days,
        "use_days": use_days,
        "total_cost": total_cost,
        "realized_consumption_cost": realized_consumption_cost,
        "cash_daily_cost": cash_daily_cost,
        "realized_daily_cost": realized_daily_cost,
        "profit_loss": profit_loss,
        "target_progress": target_progress,
        "days_to_target": days_to_target,
    }


def _asset_to_payload(asset: LedgerAsset, include_metrics: bool = True) -> dict[str, Any]:
    payload = {
        "id": asset.id,
        "name": asset.name,
        "asset_type": asset.asset_type,
        "category": asset.category,
        "status": asset.status,
        "brand": asset.brand,
        "model": asset.model,
        "serial_number": asset.serial_number,
        "location": asset.location,
        "purchase_channel": asset.purchase_channel,
        "purchase_date": asset.purchase_date,
        "start_use_date": asset.start_use_date,
        "end_date": asset.end_date,
        "purchase_price": _round_money(_coerce_money(asset.purchase_price)),
        "extra_cost": _round_money(_coerce_money(asset.extra_cost)),
        "sale_price": _round_money(_coerce_money(asset.sale_price)),
        "target_daily_cost": _round_money(_coerce_money(asset.target_daily_cost)),
        "expected_use_days": asset.expected_use_days,
        "usage_count": int(asset.usage_count or 0),
        "warranty_until": asset.warranty_until,
        "include_in_net_worth": bool(asset.include_in_net_worth),
        "tags": decode_string_list(asset.tags_json),
        "images": decode_string_list(asset.images_json),
        "note": asset.note,
        "owner_role": asset.owner_role,
        "is_deleted": bool(asset.is_deleted),
        "deleted_at": asset.deleted_at,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
    }
    if include_metrics:
        payload["metrics"] = calculate_asset_metrics(asset)
    return payload


def _asset_summary_payload(asset: LedgerAsset) -> dict[str, Any]:
    payload = _asset_to_payload(asset, include_metrics=True)
    return {
        "id": payload["id"],
        "name": payload["name"],
        "asset_type": payload["asset_type"],
        "category": payload["category"],
        "status": payload["status"],
        "brand": payload["brand"],
        "model": payload["model"],
        "location": payload["location"],
        "purchase_date": payload["purchase_date"],
        "start_use_date": payload["start_use_date"],
        "end_date": payload["end_date"],
        "purchase_price": payload["purchase_price"],
        "extra_cost": payload["extra_cost"],
        "sale_price": payload["sale_price"],
        "target_daily_cost": payload["target_daily_cost"],
        "usage_count": payload["usage_count"],
        "include_in_net_worth": payload["include_in_net_worth"],
        "tags": payload["tags"],
        "images": payload["images"],
        "owner_role": payload["owner_role"],
        "created_at": payload["created_at"],
        "updated_at": payload["updated_at"],
        "metrics": payload["metrics"],
    }


def _asset_event_to_payload(row: LedgerAssetEvent) -> dict[str, Any]:
    return {
        "id": row.id,
        "asset_id": row.asset_id,
        "event_type": row.event_type,
        "event_date": row.event_date,
        "title": row.title,
        "amount": _round_money(_coerce_money(row.amount)),
        "note": row.note,
        "metadata": decode_json_dict(row.metadata_json),
        "owner_role": row.owner_role,
        "created_at": row.created_at,
    }


def list_assets(
    db: Session,
    role: str,
    keyword: Optional[str] = None,
    status: Optional[str] = None,
    asset_type: Optional[str] = None,
    category: Optional[str] = None,
    tag: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    q = _visible_asset_query(db, role, include_deleted=include_deleted)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        q = q.filter(
            or_(
                LedgerAsset.name.ilike(pattern),
                LedgerAsset.brand.ilike(pattern),
                LedgerAsset.model.ilike(pattern),
                LedgerAsset.serial_number.ilike(pattern),
                LedgerAsset.location.ilike(pattern),
                LedgerAsset.note.ilike(pattern),
            )
        )
    if status:
        q = q.filter(LedgerAsset.status == str(status).strip())
    if asset_type:
        q = q.filter(LedgerAsset.asset_type == str(asset_type).strip())
    if category:
        q = q.filter(LedgerAsset.category == str(category).strip())
    if tag:
        q = q.filter(LedgerAsset.tags_json.like(f'%"{str(tag).strip()}"%'))

    total = q.count()
    rows = q.order_by(LedgerAsset.updated_at.desc(), LedgerAsset.id.desc()).offset(int(offset)).limit(int(limit)).all()
    return {
        "items": [_asset_summary_payload(row) for row in rows],
        "total": total,
        "limit": int(limit),
        "offset": int(offset),
    }


def get_asset(db: Session, role: str, asset_id: int) -> dict[str, Any]:
    row = _get_asset_or_404(db, role, asset_id)
    return _asset_to_payload(row, include_metrics=True)


def create_asset(db: Session, role: str, payload) -> dict[str, Any]:
    data = payload.model_dump()
    row = LedgerAsset(
        name=str(data["name"]).strip(),
        asset_type=str(data["asset_type"]).strip(),
        category=_normalize_text(data.get("category")),
        status=str(data.get("status") or "draft").strip(),
        brand=_normalize_text(data.get("brand")),
        model=_normalize_text(data.get("model")),
        serial_number=_normalize_text(data.get("serial_number")),
        location=_normalize_text(data.get("location")),
        purchase_channel=_normalize_text(data.get("purchase_channel")),
        purchase_date=data.get("purchase_date"),
        start_use_date=data.get("start_use_date"),
        end_date=data.get("end_date"),
        purchase_price=_coerce_money(data.get("purchase_price")),
        extra_cost=_coerce_money(data.get("extra_cost")),
        sale_price=_coerce_money(data.get("sale_price")),
        target_daily_cost=_coerce_money(data.get("target_daily_cost")),
        expected_use_days=data.get("expected_use_days"),
        usage_count=int(data.get("usage_count") or 0),
        warranty_until=data.get("warranty_until"),
        include_in_net_worth=bool(data.get("include_in_net_worth", True)),
        tags_json=encode_string_list(data.get("tags")),
        images_json=encode_string_list(data.get("images")),
        note=data.get("note"),
        owner_role=owner_role_for_create(role),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _asset_to_payload(row, include_metrics=True)


def update_asset(db: Session, role: str, asset_id: int, payload) -> dict[str, Any]:
    row = _get_asset_or_404(db, role, asset_id)
    data = payload.model_dump(exclude_unset=True)

    text_fields = {"name", "asset_type", "category", "brand", "model", "serial_number", "location", "purchase_channel"}
    json_list_fields = {"tags", "images"}
    money_fields = {"purchase_price", "extra_cost", "sale_price", "target_daily_cost"}

    for key, value in data.items():
        if key in {"name", "asset_type"}:
            setattr(row, key, str(value).strip())
        elif key in text_fields:
            setattr(row, key, _normalize_text(value))
        elif key in json_list_fields:
            setattr(row, f"{key}_json", encode_string_list(value))
        elif key in money_fields:
            setattr(row, key, _coerce_money(value))
        else:
            setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return _asset_to_payload(row, include_metrics=True)


def soft_delete_asset(db: Session, role: str, asset_id: int) -> dict[str, Any]:
    row = _get_asset_or_404(db, role, asset_id)
    row.is_deleted = True
    row.deleted_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "id": row.id}


def list_asset_events(db: Session, role: str, asset_id: int) -> dict[str, Any]:
    asset = _get_asset_or_404(db, role, asset_id)
    rows = (
        db.query(LedgerAssetEvent)
        .filter(LedgerAssetEvent.asset_id == asset.id, LedgerAssetEvent.owner_role == asset.owner_role)
        .order_by(LedgerAssetEvent.event_date.desc(), LedgerAssetEvent.id.desc())
        .all()
    )
    return {"items": [_asset_event_to_payload(row) for row in rows], "total": len(rows)}


def add_asset_event(db: Session, role: str, asset_id: int, payload) -> dict[str, Any]:
    asset = _get_asset_or_404(db, role, asset_id)
    data = payload.model_dump()
    row = LedgerAssetEvent(
        asset_id=asset.id,
        event_type=data["event_type"],
        event_date=data["event_date"],
        title=str(data["title"]).strip(),
        amount=_coerce_money(data.get("amount")),
        note=data.get("note"),
        metadata_json=encode_json_dict(data.get("metadata")),
        owner_role=asset.owner_role,
    )
    db.add(row)

    event_type = row.event_type
    if event_type == "start_use":
        asset.start_use_date = row.event_date
        asset.status = "in_use"
    elif event_type in {"repair", "maintenance", "accessory"}:
        if row.amount is not None:
            asset.extra_cost = float(asset.extra_cost or 0) + float(row.amount)
    elif event_type == "usage":
        asset.usage_count = int(asset.usage_count or 0) + 1
    elif event_type == "idle":
        asset.status = "idle"
    elif event_type == "resume":
        asset.status = "in_use"
        if asset.start_use_date is None:
            asset.start_use_date = row.event_date
    elif event_type == "on_sale":
        asset.status = "on_sale"
    elif event_type == "sell":
        asset.status = "sold"
        asset.end_date = row.event_date
        if row.amount is not None:
            asset.sale_price = float(row.amount)
    elif event_type == "retire":
        asset.status = "retired"
        asset.end_date = row.event_date
    elif event_type == "dispose":
        asset.status = "disposed"
        asset.end_date = row.event_date
    elif event_type == "lost":
        asset.status = "lost"
        asset.end_date = row.event_date
    # purchase / note 事件仅记录轨迹，不回写资产主表。

    db.commit()
    db.refresh(row)
    return _asset_event_to_payload(row)


def delete_asset_event(db: Session, role: str, asset_id: int, event_id: int) -> dict[str, Any]:
    asset = _get_asset_or_404(db, role, asset_id)
    row = _get_asset_event_or_404(db, asset, event_id)
    # 删除事件只移除时间线记录，不自动回滚主表状态或成本。
    db.delete(row)
    db.commit()
    return {"ok": True, "id": event_id}


def get_asset_summary(db: Session, role: str) -> dict[str, Any]:
    rows = _visible_asset_query(db, role, include_deleted=False).order_by(LedgerAsset.updated_at.desc(), LedgerAsset.id.desc()).all()

    status_breakdown_map: dict[str, int] = {}
    category_breakdown_map: dict[str, dict[str, Any]] = {}
    top_daily_cost_assets: list[tuple[float, dict[str, Any]]] = []
    top_idle_assets: list[tuple[int, dict[str, Any]]] = []
    top_extra_cost_assets: list[tuple[float, dict[str, Any]]] = []

    total_purchase_cost = 0.0
    total_extra_cost = 0.0
    total_cost = 0.0
    total_realized_profit_loss = 0.0
    active_assets = 0
    idle_assets = 0
    sold_assets = 0

    for row in rows:
        metrics = calculate_asset_metrics(row)
        summary_payload = _asset_summary_payload(row)

        purchase_price = float(row.purchase_price or 0.0)
        extra_cost = float(row.extra_cost or 0.0)
        row_total_cost = float(metrics.get("total_cost") or 0.0)
        profit_loss = float(metrics.get("profit_loss") or 0.0)

        total_purchase_cost += purchase_price
        total_extra_cost += extra_cost
        total_cost += row_total_cost
        total_realized_profit_loss += profit_loss

        if row.status in ACTIVE_ASSET_STATUSES:
            active_assets += 1
        if row.status == "idle":
            idle_assets += 1
        if row.status == "sold":
            sold_assets += 1

        status_breakdown_map[row.status] = int(status_breakdown_map.get(row.status, 0)) + 1

        category_key = row.category or "未分类"
        bucket = category_breakdown_map.setdefault(
            category_key,
            {
                "category": category_key,
                "count": 0,
                "total_purchase_cost": 0.0,
                "total_extra_cost": 0.0,
                "total_cost": 0.0,
            },
        )
        bucket["count"] += 1
        bucket["total_purchase_cost"] += purchase_price
        bucket["total_extra_cost"] += extra_cost
        bucket["total_cost"] += row_total_cost

        cash_daily_cost = metrics.get("cash_daily_cost")
        if cash_daily_cost is not None:
            top_daily_cost_assets.append((float(cash_daily_cost), summary_payload))

        if row.status == "idle":
            idle_score = int(metrics.get("holding_days") or 0)
            top_idle_assets.append((idle_score, summary_payload))

        if extra_cost > 0:
            top_extra_cost_assets.append((extra_cost, summary_payload))

    status_breakdown = [
        {"status": status, "count": count}
        for status, count in sorted(status_breakdown_map.items(), key=lambda item: (-item[1], item[0]))
    ]
    category_breakdown = [
        {
            "category": key,
            "count": int(value["count"]),
            "total_purchase_cost": round(float(value["total_purchase_cost"]), 2),
            "total_extra_cost": round(float(value["total_extra_cost"]), 2),
            "total_cost": round(float(value["total_cost"]), 2),
        }
        for key, value in sorted(category_breakdown_map.items(), key=lambda item: (-float(item[1]["total_cost"]), item[0]))
    ]

    return {
        "total_assets": len(rows),
        "active_assets": active_assets,
        "idle_assets": idle_assets,
        "sold_assets": sold_assets,
        "total_purchase_cost": round(total_purchase_cost, 2),
        "total_extra_cost": round(total_extra_cost, 2),
        "total_cost": round(total_cost, 2),
        "total_realized_profit_loss": round(total_realized_profit_loss, 2),
        "status_breakdown": status_breakdown,
        "category_breakdown": category_breakdown,
        "top_daily_cost_assets": [payload for _, payload in sorted(top_daily_cost_assets, key=lambda item: item[0], reverse=True)[:5]],
        "top_idle_assets": [payload for _, payload in sorted(top_idle_assets, key=lambda item: item[0], reverse=True)[:5]],
        "top_extra_cost_assets": [payload for _, payload in sorted(top_extra_cost_assets, key=lambda item: item[0], reverse=True)[:5]],
    }
