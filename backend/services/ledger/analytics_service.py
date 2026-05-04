from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, aliased

from models import LedgerCategory, LedgerMerchant, LedgerTransaction
from services.ledger import apply_owner_scope, owner_role_for_create

_PLATFORM_LABELS = ["微信", "支付宝", "美团", "银行卡", "其他"]


def _parse_month_key(value: str) -> Optional[date]:
    try:
        return datetime.strptime(value, "%Y-%m").date().replace(day=1)
    except Exception:
        return None


def _month_iter(start: date, end: date) -> list[str]:
    start_month = date(start.year, start.month, 1)
    end_month = date(end.year, end.month, 1)
    out: list[str] = []
    cur = start_month
    while cur <= end_month:
        out.append(cur.strftime("%Y-%m"))
        if cur.month == 12:
            cur = date(cur.year + 1, 1, 1)
        else:
            cur = date(cur.year, cur.month + 1, 1)
    return out


def _day_iter(start: date, end: date) -> list[str]:
    from datetime import timedelta
    out: list[str] = []
    cur = start
    while cur <= end:
        out.append(cur.strftime("%Y-%m-%d"))
        cur += timedelta(days=1)
    return out


def _tx_query(db: Session, role: str, date_from: Optional[date], date_to: Optional[date]):
    owner_role = owner_role_for_create(role)
    q = db.query(LedgerTransaction).filter(LedgerTransaction.is_deleted == False)  # noqa: E712
    q = apply_owner_scope(q, LedgerTransaction, role, owner_role=owner_role)
    futures_merchant_condition = or_(
        func.coalesce(LedgerTransaction.merchant_normalized, "").contains("期货"),
        func.coalesce(LedgerTransaction.merchant_raw, "").contains("期货"),
    )
    q = q.filter(~futures_merchant_condition)
    futures_merchant_ids = db.query(LedgerMerchant.id).filter(
        LedgerMerchant.is_deleted == False,  # noqa: E712
        func.coalesce(LedgerMerchant.canonical_name, "").contains("期货"),
    )
    q = q.filter(or_(LedgerTransaction.merchant_id.is_(None), ~LedgerTransaction.merchant_id.in_(futures_merchant_ids)))
    if date_from:
        q = q.filter(func.date(LedgerTransaction.occurred_at) >= date_from)
    if date_to:
        q = q.filter(func.date(LedgerTransaction.occurred_at) <= date_to)
    return q


def _expense_query(db: Session, role: str, date_from: Optional[date], date_to: Optional[date]):
    return _tx_query(db, role, date_from, date_to).filter(LedgerTransaction.direction == "expense")


def _unrecognized_condition():
    return or_(
        LedgerTransaction.category_id.is_(None),
        LedgerTransaction.source_channel.is_(None),
        LedgerTransaction.source_channel == "",
        LedgerTransaction.merchant_normalized.is_(None),
        LedgerTransaction.merchant_normalized == "",
    )


def _platform_label_expr():
    raw = func.lower(func.coalesce(LedgerTransaction.platform, LedgerTransaction.source_channel, ""))
    return case(
        (raw.in_(["wechat", "wechat_pay"]), "微信"),
        (raw.in_(["alipay", "alipay_pay"]), "支付宝"),
        (raw.in_(["meituan", "meituan_pay"]), "美团"),
        (raw.in_(["bank_card", "bank"]), "银行卡"),
        else_="其他",
    )


def get_summary(db: Session, role: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
    q = _tx_query(db, role, date_from, date_to)
    total_count = q.count()

    expense_total = float(
        q.with_entities(func.coalesce(func.sum(case((LedgerTransaction.direction == "expense", LedgerTransaction.amount), else_=0.0)), 0.0)).scalar()
        or 0.0
    )
    income_total = float(
        q.with_entities(func.coalesce(func.sum(case((LedgerTransaction.direction == "income", LedgerTransaction.amount), else_=0.0)), 0.0)).scalar()
        or 0.0
    )

    expense_count = q.filter(LedgerTransaction.direction == "expense").count()

    recognized_count = q.filter(
        LedgerTransaction.category_id.is_not(None),
        LedgerTransaction.source_channel.is_not(None),
        LedgerTransaction.source_channel != "",
        LedgerTransaction.merchant_normalized.is_not(None),
        LedgerTransaction.merchant_normalized != "",
    ).count()

    unrecognized_q = q.filter(_unrecognized_condition())
    unrecognized_count = unrecognized_q.count()
    unrecognized_amount = float(
        unrecognized_q.with_entities(func.coalesce(func.sum(case((LedgerTransaction.direction == "expense", LedgerTransaction.amount), else_=0.0)), 0.0)).scalar()
        or 0.0
    )

    return {
        "total_expense": round(expense_total, 2),
        "total_income": round(income_total, 2),
        "net_balance": round(income_total - expense_total, 2),
        "transaction_count": int(total_count),
        "avg_per_transaction": round(expense_total / expense_count if expense_count else 0.0, 2),
        "recognition_rate": round((recognized_count / total_count) if total_count else 0.0, 4),
        "unrecognized_count": int(unrecognized_count),
        "unrecognized_amount": round(unrecognized_amount, 2),
    }


def get_category_breakdown(db: Session, role: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
    q = _expense_query(db, role, date_from, date_to)
    rows = (
        q.outerjoin(LedgerCategory, LedgerCategory.id == LedgerTransaction.category_id)
        .with_entities(
            func.coalesce(LedgerCategory.name, "未识别分类").label("category_name"),
            func.sum(LedgerTransaction.amount).label("amount"),
            func.count(LedgerTransaction.id).label("count"),
        )
        .group_by("category_name")
        .order_by(func.sum(LedgerTransaction.amount).desc())
        .all()
    )

    total = sum(float(x[1] or 0) for x in rows)
    items = [
        {
            "category_name": str(name),
            "amount": round(float(amount or 0), 2),
            "ratio": round(float(amount or 0) / total, 4) if total else 0.0,
            "count": int(cnt or 0),
        }
        for name, amount, cnt in rows
    ]
    return {"items": items, "total": round(total, 2)}


def get_platform_breakdown(db: Session, role: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
    q = _expense_query(db, role, date_from, date_to)
    label_expr = _platform_label_expr()
    grouped = (
        q.with_entities(
            label_expr.label("platform_name"),
            func.sum(LedgerTransaction.amount).label("amount"),
            func.count(LedgerTransaction.id).label("count"),
        )
        .group_by("platform_name")
        .all()
    )
    mapped_amount = {str(name): float(amount or 0) for name, amount, cnt in grouped}
    mapped_count = {str(name): int(cnt or 0) for name, amount, cnt in grouped}
    total = sum(mapped_amount.values())
    items = []
    for name in _PLATFORM_LABELS:
        amount = float(mapped_amount.get(name, 0.0))
        cnt = int(mapped_count.get(name, 0))
        items.append({
            "platform_name": name,
            "amount": round(amount, 2),
            "ratio": round(amount / total, 4) if total else 0.0,
            "count": cnt,
        })
    return {"items": items, "total": round(total, 2)}


def get_top_merchants(db: Session, role: str, date_from: Optional[date], date_to: Optional[date], limit: int = 10) -> dict[str, Any]:
    q = _expense_query(db, role, date_from, date_to)
    merchant_expr = func.coalesce(LedgerTransaction.merchant_normalized, LedgerTransaction.merchant_raw, "未识别商户")
    rows = (
        q.with_entities(
            merchant_expr.label("merchant_name"),
            func.count(LedgerTransaction.id).label("count"),
            func.sum(LedgerTransaction.amount).label("total_amount"),
        )
        .group_by("merchant_name")
        .order_by(func.sum(LedgerTransaction.amount).desc(), func.count(LedgerTransaction.id).desc())
        .limit(int(limit))
        .all()
    )
    items = [
        {
            "merchant_name": str(name),
            "count": int(count or 0),
            "total_amount": round(float(amount or 0), 2),
            "avg_amount": round(float(amount or 0) / int(count or 1), 2),
        }
        for name, count, amount in rows
    ]
    return {"items": items}


def get_monthly_trend(
    db: Session,
    role: str,
    date_from: Optional[date],
    date_to: Optional[date],
    granularity: str = "month",
) -> dict[str, Any]:
    end_date = date_to or date.today()
    start_date = date_from or date(end_date.year, max(1, end_date.month - 5), 1)

    # Build period expression based on granularity
    if granularity == "day":
        period_expr = func.strftime("%Y-%m-%d", LedgerTransaction.occurred_at)
    elif granularity == "week":
        # SQLite ISO week: strftime('%Y-W%W', ...) — note %W is Monday-based week 00-53
        period_expr = func.strftime("%Y-W%W", LedgerTransaction.occurred_at)
    else:
        period_expr = func.strftime("%Y-%m", LedgerTransaction.occurred_at)

    q_base = _tx_query(db, role, start_date, end_date)

    # Fetch expense totals per period
    expense_rows = (
        q_base.filter(LedgerTransaction.direction == "expense")
        .with_entities(period_expr.label("period"), func.sum(LedgerTransaction.amount).label("total"))
        .group_by("period")
        .all()
    )

    # Fetch income totals per period
    income_rows = (
        q_base.filter(LedgerTransaction.direction == "income")
        .with_entities(period_expr.label("period"), func.sum(LedgerTransaction.amount).label("total"))
        .group_by("period")
        .all()
    )

    # Fetch category breakdown per period
    cat_rows = (
        q_base.filter(LedgerTransaction.direction == "expense")
        .outerjoin(LedgerCategory, LedgerCategory.id == LedgerTransaction.category_id)
        .with_entities(
            period_expr.label("period"),
            func.coalesce(LedgerCategory.name, "未识别分类").label("category_name"),
            func.sum(LedgerTransaction.amount).label("amount"),
        )
        .group_by("period", "category_name")
        .all()
    )

    # Collect all category names (ordered by total amount desc)
    cat_totals: dict[str, float] = defaultdict(float)
    for _, cat_name, amount in cat_rows:
        cat_totals[str(cat_name)] += float(amount or 0)
    all_categories = sorted(cat_totals.keys(), key=lambda c: cat_totals[c], reverse=True)

    # Build period map
    period_map: dict[str, dict] = {}
    for period, total in expense_rows:
        if not period:
            continue
        k = str(period)
        if k not in period_map:
            period_map[k] = {"total_expense": 0.0, "total_income": 0.0, "categories": {}}
        period_map[k]["total_expense"] = float(total or 0)

    for period, total in income_rows:
        if not period:
            continue
        k = str(period)
        if k not in period_map:
            period_map[k] = {"total_expense": 0.0, "total_income": 0.0, "categories": {}}
        period_map[k]["total_income"] = float(total or 0)

    for period, cat_name, amount in cat_rows:
        if not period:
            continue
        k = str(period)
        if k not in period_map:
            period_map[k] = {"total_expense": 0.0, "total_income": 0.0, "categories": {}}
        period_map[k]["categories"][str(cat_name)] = float(amount or 0)

    # Build sorted period list
    sorted_periods = sorted(period_map.keys())

    items = []
    for period in sorted_periods:
        base = period_map[period]
        items.append({
            "period": period,
            "total_expense": round(base["total_expense"], 2),
            "total_income": round(base["total_income"], 2),
            "categories": {k: round(v, 2) for k, v in base["categories"].items()},
        })

    return {
        "items": items,
        "categories": all_categories,
    }


def get_unrecognized_breakdown(db: Session, role: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
    base_q = _tx_query(db, role, date_from, date_to)
    expense_total = float(
        base_q.with_entities(func.coalesce(func.sum(case((LedgerTransaction.direction == "expense", LedgerTransaction.amount), else_=0.0)), 0.0)).scalar()
        or 0.0
    )

    q = base_q.filter(_unrecognized_condition())
    unrecognized_count = q.count()
    unrecognized_amount = float(
        q.with_entities(func.coalesce(func.sum(case((LedgerTransaction.direction == "expense", LedgerTransaction.amount), else_=0.0)), 0.0)).scalar()
        or 0.0
    )

    merchant_expr = func.coalesce(LedgerTransaction.merchant_raw, LedgerTransaction.merchant_normalized, "未识别商户")
    merchant_top_rows = (
        q.filter(LedgerTransaction.direction == "expense")
        .with_entities(merchant_expr.label("merchant"), func.count(LedgerTransaction.id).label("count"), func.sum(LedgerTransaction.amount).label("amount"))
        .group_by("merchant")
        .order_by(func.count(LedgerTransaction.id).desc(), func.sum(LedgerTransaction.amount).desc())
        .limit(10)
        .all()
    )

    text_expr = func.coalesce(LedgerTransaction.description, LedgerTransaction.normalized_text, "无摘要")
    text_top_rows = (
        q.filter(LedgerTransaction.direction == "expense")
        .with_entities(text_expr.label("description"), func.count(LedgerTransaction.id).label("count"), func.sum(LedgerTransaction.amount).label("amount"))
        .group_by("description")
        .order_by(func.count(LedgerTransaction.id).desc(), func.sum(LedgerTransaction.amount).desc())
        .limit(10)
        .all()
    )

    return {
        "unrecognized_count": int(unrecognized_count),
        "unrecognized_amount": round(unrecognized_amount, 2),
        "unrecognized_ratio": round((unrecognized_amount / expense_total) if expense_total else 0.0, 4),
        "top_merchants": [
            {"merchant": str(name), "count": int(count or 0), "amount": round(float(amount or 0), 2)}
            for name, count, amount in merchant_top_rows
        ],
        "top_descriptions": [
            {"description": str(name), "count": int(count or 0), "amount": round(float(amount or 0), 2)}
            for name, count, amount in text_top_rows
        ],
    }


def get_daily_heatmap(db: Session, role: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
    q = _expense_query(db, role, date_from, date_to)
    rows = (
        q.with_entities(
            func.date(LedgerTransaction.occurred_at).label("date"),
            func.sum(LedgerTransaction.amount).label("expense"),
            func.count(LedgerTransaction.id).label("count"),
        )
        .group_by("date")
        .order_by("date")
        .all()
    )
    items = [
        {
            "date": str(d),
            "expense": round(float(expense or 0), 2),
            "count": int(cnt or 0),
        }
        for d, expense, cnt in rows
        if d
    ]
    max_expense = max((x["expense"] for x in items), default=0.0)
    return {"items": items, "max_expense": round(max_expense, 2)}


def get_category_detail(
    db: Session,
    role: str,
    date_from: Optional[date],
    date_to: Optional[date],
    category_name: str,
) -> dict[str, Any]:
    q = _expense_query(db, role, date_from, date_to)

    # Filter by category name (join main category)
    main_category = aliased(LedgerCategory)
    q_joined = q.outerjoin(main_category, main_category.id == LedgerTransaction.category_id)

    if category_name == "未识别分类":
        q_joined = q_joined.filter(LedgerTransaction.category_id.is_(None))
    else:
        q_joined = q_joined.filter(main_category.name == category_name)

    # Subcategory breakdown (using subcategory_id join)
    sub_category = aliased(LedgerCategory)
    subcat_rows = (
        q_joined
        .outerjoin(sub_category, sub_category.id == LedgerTransaction.subcategory_id)
        .with_entities(
            func.coalesce(sub_category.name, "其他").label("subcat_name"),
            func.sum(LedgerTransaction.amount).label("amount"),
            func.count(LedgerTransaction.id).label("count"),
        )
        .group_by("subcat_name")
        .order_by(func.sum(LedgerTransaction.amount).desc())
        .all()
    )

    subcategories = [
        {"name": str(name), "amount": round(float(amount or 0), 2), "count": int(cnt or 0)}
        for name, amount, cnt in subcat_rows
    ]

    # Recent 50 transactions
    tx_rows = (
        q_joined
        .with_entities(
            LedgerTransaction.id,
            LedgerTransaction.occurred_at,
            LedgerTransaction.amount,
            func.coalesce(LedgerTransaction.merchant_normalized, LedgerTransaction.merchant_raw, "").label("merchant"),
            func.coalesce(LedgerTransaction.description, LedgerTransaction.normalized_text, "").label("description"),
        )
        .order_by(LedgerTransaction.occurred_at.desc())
        .limit(50)
        .all()
    )

    transactions = [
        {
            "id": int(tid),
            "occurred_at": occurred_at.isoformat() if hasattr(occurred_at, "isoformat") else str(occurred_at),
            "amount": round(float(amount or 0), 2),
            "merchant": str(merchant or ""),
            "description": str(desc or ""),
        }
        for tid, occurred_at, amount, merchant, desc in tx_rows
    ]

    total_amount = sum(x["amount"] for x in transactions)
    total_count = sum(s["count"] for s in subcategories)

    return {
        "subcategories": subcategories,
        "transactions": transactions,
        "total_amount": round(total_amount, 2),
        "total_count": int(total_count),
    }
