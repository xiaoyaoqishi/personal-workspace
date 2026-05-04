from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from models import LedgerImportRow, LedgerMerchant, LedgerRule
from services.ledger import apply_owner_scope, owner_role_for_create
from services.ledger.rules.matchers import text_match


def _rule_match_dry(rule_params: dict, row: LedgerImportRow) -> bool:
    """用规则参数（dict）对 LedgerImportRow 做匹配，不持久化"""
    match_mode = rule_params.get("match_mode", "contains")
    pattern = rule_params.get("pattern", "")

    source_cond = rule_params.get("source_channel_condition")
    platform_cond = rule_params.get("platform_condition")
    direction_cond = rule_params.get("direction_condition")
    amount_min = rule_params.get("amount_min")
    amount_max = rule_params.get("amount_max")

    if source_cond and (row.source_channel or "") != source_cond:
        return False
    if platform_cond and (row.platform or "") != platform_cond:
        return False
    if direction_cond and (row.direction or "") != direction_cond:
        return False
    if amount_min is not None and (row.amount is None or row.amount < float(amount_min)):
        return False
    if amount_max is not None and (row.amount is None or row.amount > float(amount_max)):
        return False

    text = (row.normalized_text or row.raw_text or "").strip()
    return text_match(match_mode, pattern, text)


def dry_run_rule(db: Session, role: str, payload, limit: int = 50) -> dict[str, Any]:
    """试跑规则：不持久化，返回命中行样本"""
    owner_role = owner_role_for_create(role)

    rule_params = {
        "match_mode": getattr(payload, "match_mode", "contains"),
        "pattern": getattr(payload, "pattern", ""),
        "source_channel_condition": getattr(payload, "source_channel_condition", None),
        "platform_condition": getattr(payload, "platform_condition", None),
        "direction_condition": getattr(payload, "direction_condition", None),
        "amount_min": getattr(payload, "amount_min", None),
        "amount_max": getattr(payload, "amount_max", None),
    }

    # 拉取全部导入行（非软删除）
    q = db.query(LedgerImportRow).filter(LedgerImportRow.is_deleted == False)  # noqa: E712
    q = apply_owner_scope(q, LedgerImportRow, role, owner_role=owner_role)
    all_rows = q.order_by(LedgerImportRow.id.desc()).all()

    matched: list[LedgerImportRow] = []
    for row in all_rows:
        if _rule_match_dry(rule_params, row):
            matched.append(row)

    total_matched_count = len(matched)
    sample = matched[:limit]

    matched_rows = [
        {
            "id": int(r.id),
            "batch_id": int(r.batch_id) if r.batch_id else None,
            "occurred_at": r.occurred_at,
            "amount": float(r.amount or 0),
            "direction": r.direction,
            "raw_text": r.raw_text,
            "merchant_raw": r.merchant_raw,
            "merchant_normalized": r.merchant_normalized,
            "source_channel": r.source_channel,
            "platform": r.platform,
            "category_id": r.category_id,
        }
        for r in sample
    ]

    return {
        "matched_rows": matched_rows,
        "total_matched_count": total_matched_count,
    }
