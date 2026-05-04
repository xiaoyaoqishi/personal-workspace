from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.errors import AppError
from models import LedgerCategory, LedgerImportRow, LedgerMerchant, LedgerTransaction
from services.ledger import apply_owner_scope, ensure_row_visible, owner_role_for_create


def _parse_aliases(row: LedgerMerchant) -> list[str]:
    try:
        return json.loads(row.aliases_json or "[]")
    except Exception:
        return []


def _parse_tags(row: LedgerMerchant) -> list[str]:
    try:
        return json.loads(row.tags_json or "[]")
    except Exception:
        return []


def _category_name(db: Session, cat_id: int | None) -> str | None:
    if not cat_id:
        return None
    row = db.query(LedgerCategory).filter(LedgerCategory.id == cat_id, LedgerCategory.is_deleted == False).first()  # noqa: E712
    return row.name if row else None


def _merchant_stats(db: Session, merchant: LedgerMerchant) -> dict[str, Any]:
    """近 30 天命中数、金额、最近活跃时间"""
    cutoff = datetime.utcnow() - timedelta(days=30)
    base_q = db.query(LedgerTransaction).filter(
        LedgerTransaction.merchant_id == merchant.id,
        LedgerTransaction.is_deleted == False,  # noqa: E712
    )
    count_30d = base_q.filter(LedgerTransaction.occurred_at >= cutoff).count()
    amount_30d_row = base_q.filter(
        LedgerTransaction.occurred_at >= cutoff,
        LedgerTransaction.direction == "expense",
    ).with_entities(func.sum(LedgerTransaction.amount)).scalar()
    amount_30d = float(amount_30d_row or 0)

    last_seen_row = base_q.order_by(LedgerTransaction.occurred_at.desc()).with_entities(
        LedgerTransaction.occurred_at
    ).first()
    last_seen_at = last_seen_row[0] if last_seen_row else None

    return {
        "recent_30d_count": count_30d,
        "recent_30d_amount": amount_30d,
        "last_seen_at": last_seen_at,
    }


def merchant_to_item(db: Session, row: LedgerMerchant) -> dict[str, Any]:
    aliases = _parse_aliases(row)
    samples = (
        db.query(LedgerImportRow)
        .filter(
            LedgerImportRow.owner_role == row.owner_role,
            LedgerImportRow.merchant_normalized == row.canonical_name,
        )
        .order_by(LedgerImportRow.id.desc())
        .limit(3)
        .all()
    )
    recent_rows = [
        {
            "id": int(x.id),
            "batch_id": int(x.batch_id) if x.batch_id else None,
            "occurred_at": x.occurred_at,
            "amount": float(x.amount or 0),
            "raw_text": x.raw_text,
            "merchant_raw": x.merchant_raw,
            "category_id": x.category_id,
        }
        for x in samples
    ]
    tags = _parse_tags(row)
    stats = _merchant_stats(db, row)
    return {
        "id": row.id,
        "canonical_name": row.canonical_name,
        "aliases": aliases,
        "recent_rows": recent_rows,
        "default_category_id": row.default_category_id,
        "default_subcategory_id": row.default_subcategory_id,
        "default_category_name": _category_name(db, row.default_category_id),
        "default_subcategory_name": _category_name(db, row.default_subcategory_id),
        "tags": tags,
        "hit_count": int(row.hit_count or 0),
        "recent_30d_count": stats["recent_30d_count"],
        "recent_30d_amount": stats["recent_30d_amount"],
        "last_seen_at": stats["last_seen_at"],
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def list_merchants(db: Session, role: str) -> dict[str, Any]:
    owner_role = owner_role_for_create(role)
    q = db.query(LedgerMerchant).filter(LedgerMerchant.is_deleted == False)  # noqa: E712
    q = apply_owner_scope(q, LedgerMerchant, role, owner_role=owner_role)
    rows = q.order_by(LedgerMerchant.hit_count.desc(), LedgerMerchant.id.asc()).all()
    items = [merchant_to_item(db, row) for row in rows]
    return {"items": items, "total": len(items)}


def create_merchant(db: Session, role: str, payload) -> dict[str, Any]:
    owner_role = owner_role_for_create(role)
    canonical_name = payload.canonical_name.strip()
    exists = db.query(LedgerMerchant).filter(
        LedgerMerchant.owner_role == owner_role,
        LedgerMerchant.is_deleted == False,  # noqa: E712
        func.lower(LedgerMerchant.canonical_name) == canonical_name.lower(),
    ).first()
    if exists:
        raise AppError("duplicated_merchant", "商户规范名已存在", status_code=400)
    aliases = list(payload.aliases or [])
    tags = list(payload.tags or [])
    row = LedgerMerchant(
        canonical_name=canonical_name,
        aliases_json=json.dumps(aliases, ensure_ascii=False),
        tags_json=json.dumps(tags, ensure_ascii=False),
        default_category_id=payload.default_category_id,
        default_subcategory_id=payload.default_subcategory_id,
        owner_role=owner_role,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return merchant_to_item(db, row)


def update_merchant(db: Session, role: str, merchant_id: int, payload) -> dict[str, Any]:
    owner_role = owner_role_for_create(role)
    row = db.query(LedgerMerchant).filter(
        LedgerMerchant.id == merchant_id,
        LedgerMerchant.is_deleted == False,  # noqa: E712
    ).first()
    if not row:
        raise AppError("not_found", "商户不存在", status_code=404)
    ensure_row_visible(row.owner_role, role)

    if payload.canonical_name is not None:
        canonical_name = payload.canonical_name.strip()
        conflict = db.query(LedgerMerchant).filter(
            LedgerMerchant.owner_role == row.owner_role,
            LedgerMerchant.id != row.id,
            LedgerMerchant.is_deleted == False,  # noqa: E712
            func.lower(LedgerMerchant.canonical_name) == canonical_name.lower(),
        ).first()
        if conflict:
            raise AppError("duplicated_merchant", "商户规范名已存在", status_code=400)
        row.canonical_name = canonical_name
    if payload.aliases is not None:
        row.aliases_json = json.dumps(list(payload.aliases), ensure_ascii=False)
    if payload.default_category_id is not None:
        row.default_category_id = payload.default_category_id
    elif hasattr(payload, "default_category_id"):
        row.default_category_id = None
    if payload.default_subcategory_id is not None:
        row.default_subcategory_id = payload.default_subcategory_id
    elif hasattr(payload, "default_subcategory_id"):
        row.default_subcategory_id = None
    if payload.tags is not None:
        row.tags_json = json.dumps(list(payload.tags), ensure_ascii=False)

    db.commit()
    db.refresh(row)
    return merchant_to_item(db, row)


def delete_merchant(db: Session, role: str, merchant_id: int) -> dict[str, Any]:
    row = db.query(LedgerMerchant).filter(
        LedgerMerchant.id == merchant_id,
        LedgerMerchant.is_deleted == False,  # noqa: E712
    ).first()
    if not row:
        raise AppError("not_found", "商户不存在", status_code=404)
    ensure_row_visible(row.owner_role, role)

    # 检查是否有关联交易
    txn_count = db.query(LedgerTransaction).filter(
        LedgerTransaction.merchant_id == merchant_id,
        LedgerTransaction.is_deleted == False,  # noqa: E712
    ).count()
    if txn_count > 0:
        raise AppError(
            "has_transactions",
            f"该商户有 {txn_count} 条关联交易，无法直接删除；请先合并至其他商户或手动解除关联。",
            status_code=409,
        )

    row.is_deleted = True
    row.deleted_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "id": merchant_id}


def merge_merchants(db: Session, role: str, source_ids: list[int], target_id: int) -> dict[str, Any]:
    """把 source_ids 商户的别名并入 target，把所有相关交易/导入行指向 target，软删除 source"""
    owner_role = owner_role_for_create(role)

    target = db.query(LedgerMerchant).filter(
        LedgerMerchant.id == target_id,
        LedgerMerchant.is_deleted == False,  # noqa: E712
    ).first()
    if not target:
        raise AppError("not_found", "目标商户不存在", status_code=404)
    ensure_row_visible(target.owner_role, role)

    if target_id in source_ids:
        raise AppError("invalid_merge", "目标商户不能包含在源商户列表中", status_code=400)

    target_aliases = set(_parse_aliases(target))

    merged_count = 0
    for src_id in source_ids:
        src = db.query(LedgerMerchant).filter(
            LedgerMerchant.id == src_id,
            LedgerMerchant.is_deleted == False,  # noqa: E712
        ).first()
        if not src:
            continue
        ensure_row_visible(src.owner_role, role)

        # 合并别名
        src_aliases = _parse_aliases(src)
        target_aliases.add(src.canonical_name)
        target_aliases.update(src_aliases)

        # LedgerTransaction.merchant_id 改指 target
        db.query(LedgerTransaction).filter(
            LedgerTransaction.merchant_id == src_id,
        ).update({"merchant_id": target_id}, synchronize_session=False)

        # LedgerImportRow.merchant_id 改指 target（merchant_normalized 保留原值不强改）
        db.query(LedgerImportRow).filter(
            LedgerImportRow.merchant_id == src_id,
        ).update({"merchant_id": target_id}, synchronize_session=False)

        # 软删除 source
        src.is_deleted = True
        src.deleted_at = datetime.utcnow()
        merged_count += 1

    # 去掉 target 自身的 canonical_name
    target_aliases.discard(target.canonical_name)
    target.aliases_json = json.dumps(sorted(target_aliases), ensure_ascii=False)
    db.commit()
    db.refresh(target)

    return {
        "ok": True,
        "merged_count": merged_count,
        "target": merchant_to_item(db, target),
    }
