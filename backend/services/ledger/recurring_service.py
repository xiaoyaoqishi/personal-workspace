import math
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from statistics import median
from typing import Any, Optional

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from core.errors import AppError
from models import LedgerAccount, LedgerCategory, LedgerRecurringRule, LedgerTransaction
from services.ledger import apply_owner_scope, ensure_row_visible, owner_role_for_create

VALID_RULE_TYPES = {"expense", "income", "transfer", "repayment", "subscription"}
VALID_FREQUENCIES = {"monthly", "weekly", "yearly"}
VALID_TX_TYPES = {"income", "expense", "transfer", "refund", "repayment", "fee", "interest", "adjustment"}
VALID_DIRECTIONS = {"income", "expense", "neutral"}


def _norm_str(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "value"):
        value = value.value
    return str(value).strip()


def _norm_lower(value: Any) -> str:
    return _norm_str(value).lower()


def _merchant_norm(value: Any) -> str:
    return "".join(ch for ch in _norm_lower(value) if ch.isalnum())


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _days_in_month(year: int, month: int) -> int:
    if month == 2:
        is_leap = (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)
        return 29 if is_leap else 28
    if month in {4, 6, 9, 11}:
        return 30
    return 31


def _clamp_day(year: int, month: int, day_of_month: int) -> int:
    return min(max(1, int(day_of_month)), _days_in_month(year, month))


def _add_months(anchor: date, months: int, day_of_month: int) -> date:
    total_months = (anchor.year * 12 + (anchor.month - 1)) + months
    year = total_months // 12
    month = (total_months % 12) + 1
    day = _clamp_day(year, month, day_of_month)
    return date(year, month, day)


def _next_due_monthly(start_date: date, day_of_month: int, interval_count: int, from_date: date) -> date:
    if from_date <= start_date:
        first_day = _clamp_day(start_date.year, start_date.month, day_of_month)
        first = date(start_date.year, start_date.month, first_day)
        if first >= from_date and first >= start_date:
            return first

    months_since_start = (from_date.year - start_date.year) * 12 + (from_date.month - start_date.month)
    if months_since_start < 0:
        months_since_start = 0
    cycles = months_since_start // interval_count
    candidate = _add_months(start_date, cycles * interval_count, day_of_month)
    if candidate < start_date:
        candidate = start_date
    if candidate < from_date:
        candidate = _add_months(start_date, (cycles + 1) * interval_count, day_of_month)
    return candidate


def _next_due_weekly(start_date: date, weekday: int, interval_count: int, from_date: date) -> date:
    shift = (weekday - start_date.weekday()) % 7
    first_due = start_date + timedelta(days=shift)
    if first_due < start_date:
        first_due = start_date
    if first_due >= from_date:
        return first_due
    period_days = interval_count * 7
    delta_days = (from_date - first_due).days
    cycles = delta_days // period_days
    candidate = first_due + timedelta(days=cycles * period_days)
    if candidate < from_date:
        candidate += timedelta(days=period_days)
    return candidate


def _next_due_yearly(start_date: date, day_of_month: int, interval_count: int, from_date: date) -> date:
    month = start_date.month

    def at_year(y: int) -> date:
        return date(y, month, _clamp_day(y, month, day_of_month))

    first = at_year(start_date.year)
    if first < start_date:
        first = at_year(start_date.year + 1)

    if first >= from_date:
        return first

    years_gap = max(0, from_date.year - first.year)
    cycles = years_gap // interval_count
    candidate = at_year(first.year + cycles * interval_count)
    if candidate < from_date:
        candidate = at_year(first.year + (cycles + 1) * interval_count)
    return candidate


def _compute_next_due_from_parts(
    frequency: str,
    interval_count: int,
    day_of_month: Optional[int],
    weekday: Optional[int],
    start_date: date,
    end_date: Optional[date],
    from_date: Optional[date] = None,
) -> Optional[date]:
    base = from_date or date.today()
    anchor = max(base, start_date)

    if frequency == "monthly":
        if day_of_month is None:
            raise AppError("invalid_payload", "monthly 规则必须提供 day_of_month", status_code=400)
        next_due = _next_due_monthly(start_date, int(day_of_month), int(interval_count), anchor)
    elif frequency == "weekly":
        if weekday is None:
            raise AppError("invalid_payload", "weekly 规则必须提供 weekday", status_code=400)
        next_due = _next_due_weekly(start_date, int(weekday), int(interval_count), anchor)
    elif frequency == "yearly":
        if day_of_month is None:
            raise AppError("invalid_payload", "yearly 规则必须提供 day_of_month", status_code=400)
        next_due = _next_due_yearly(start_date, int(day_of_month), int(interval_count), anchor)
    else:
        raise AppError("invalid_payload", "frequency 非法", status_code=400)

    if end_date and next_due > end_date:
        return None
    return next_due


def _window_days(frequency: str) -> int:
    if frequency == "weekly":
        return 2
    if frequency == "monthly":
        return 5
    return 7


def _expected_range(expected_amount: Optional[float], amount_tolerance: Optional[float]) -> tuple[Optional[float], Optional[float]]:
    if expected_amount is None:
        return (None, None)
    if amount_tolerance is None:
        return (expected_amount, expected_amount)
    return (expected_amount - amount_tolerance, expected_amount + amount_tolerance)


def _is_amount_in_range(amount: float, expected_amount: Optional[float], amount_tolerance: Optional[float]) -> bool:
    if expected_amount is None:
        return True
    if amount_tolerance is None:
        return math.isclose(float(amount), float(expected_amount), rel_tol=0.0, abs_tol=1e-6)
    return abs(float(amount) - float(expected_amount)) <= float(amount_tolerance)


def _get_rule_or_404(db: Session, role: str, rule_id: int) -> LedgerRecurringRule:
    row = db.query(LedgerRecurringRule).filter(
        LedgerRecurringRule.id == rule_id,
        LedgerRecurringRule.is_deleted == False,  # noqa: E712
    ).first()
    if not row:
        raise AppError("not_found", "周期规则不存在", status_code=404)
    ensure_row_visible(row.owner_role, role)
    return row


def _ensure_account_visible(db: Session, account_id: int, role: str) -> LedgerAccount:
    row = db.query(LedgerAccount).filter(LedgerAccount.id == account_id, LedgerAccount.is_deleted == False).first()  # noqa: E712
    if not row:
        raise AppError("invalid_account", "账户不存在", status_code=400)
    ensure_row_visible(row.owner_role, role)
    return row


def _ensure_category_visible(db: Session, category_id: int, role: str) -> LedgerCategory:
    row = db.query(LedgerCategory).filter(LedgerCategory.id == category_id, LedgerCategory.is_deleted == False).first()  # noqa: E712
    if not row:
        raise AppError("invalid_category", "分类不存在", status_code=400)
    ensure_row_visible(row.owner_role, role)
    return row


def _validate_rule_data(db: Session, role: str, owner_role: str, data: dict[str, Any]) -> None:
    if _norm_lower(data.get("rule_type")) not in VALID_RULE_TYPES:
        raise AppError("invalid_payload", "rule_type 非法", status_code=400)

    frequency = _norm_lower(data.get("frequency"))
    if frequency not in VALID_FREQUENCIES:
        raise AppError("invalid_payload", "frequency 非法", status_code=400)

    interval_count = int(data.get("interval_count") or 0)
    if interval_count < 1:
        raise AppError("invalid_payload", "interval_count 必须 >= 1", status_code=400)

    if frequency == "monthly" and data.get("day_of_month") is None:
        raise AppError("invalid_payload", "monthly 规则必须提供 day_of_month", status_code=400)
    if frequency == "weekly" and data.get("weekday") is None:
        raise AppError("invalid_payload", "weekly 规则必须提供 weekday", status_code=400)
    if frequency == "yearly" and data.get("day_of_month") is None:
        raise AppError("invalid_payload", "yearly 规则必须提供 day_of_month", status_code=400)

    if data.get("weekday") is not None and int(data["weekday"]) not in range(0, 7):
        raise AppError("invalid_payload", "weekday 必须在 0-6", status_code=400)

    start_date = data.get("start_date")
    end_date = data.get("end_date")
    if not isinstance(start_date, date):
        raise AppError("invalid_payload", "start_date 必填", status_code=400)
    if end_date and end_date < start_date:
        raise AppError("invalid_payload", "end_date 不能早于 start_date", status_code=400)

    tx_type = _norm_lower(data.get("transaction_type"))
    if tx_type not in VALID_TX_TYPES:
        raise AppError("invalid_payload", "transaction_type 非法", status_code=400)

    direction = _norm_lower(data.get("direction"))
    if direction not in VALID_DIRECTIONS:
        raise AppError("invalid_payload", "direction 非法", status_code=400)
    if tx_type == "transfer" and direction != "neutral":
        raise AppError("invalid_payload", "transfer 的 direction 必须是 neutral", status_code=400)
    if tx_type == "refund" and direction != "income":
        raise AppError("invalid_payload", "refund 的 direction 必须是 income", status_code=400)

    expected_amount = _to_float(data.get("expected_amount"))
    if expected_amount is not None and expected_amount <= 0:
        raise AppError("invalid_payload", "expected_amount 必须 > 0", status_code=400)

    amount_tolerance = _to_float(data.get("amount_tolerance"))
    if amount_tolerance is not None and amount_tolerance < 0:
        raise AppError("invalid_payload", "amount_tolerance 必须 >= 0", status_code=400)

    account = _ensure_account_visible(db, int(data["account_id"]), role)
    if account.owner_role != owner_role:
        raise AppError("invalid_account", "account owner_role 不匹配", status_code=400)

    counterparty_id = data.get("counterparty_account_id")
    if counterparty_id:
        counterparty = _ensure_account_visible(db, int(counterparty_id), role)
        if counterparty.owner_role != owner_role:
            raise AppError("invalid_account", "counterparty_account owner_role 不匹配", status_code=400)

    category_id = data.get("category_id")
    if category_id:
        category = _ensure_category_visible(db, int(category_id), role)
        if category.owner_role != owner_role:
            raise AppError("invalid_category", "category owner_role 不匹配", status_code=400)


def _rule_to_item(row: LedgerRecurringRule) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "is_active": bool(row.is_active),
        "rule_type": row.rule_type,
        "frequency": row.frequency,
        "interval_count": int(row.interval_count or 1),
        "day_of_month": row.day_of_month,
        "weekday": row.weekday,
        "start_date": row.start_date,
        "end_date": row.end_date,
        "expected_amount": float(row.expected_amount) if row.expected_amount is not None else None,
        "amount_tolerance": float(row.amount_tolerance) if row.amount_tolerance is not None else None,
        "currency": row.currency,
        "account_id": row.account_id,
        "account_name": row.account.name if row.account else None,
        "counterparty_account_id": row.counterparty_account_id,
        "counterparty_account_name": row.counterparty_account.name if row.counterparty_account else None,
        "category_id": row.category_id,
        "category_name": row.category.name if row.category else None,
        "transaction_type": row.transaction_type,
        "direction": row.direction,
        "merchant": row.merchant,
        "description": row.description,
        "note": row.note,
        "source_hint": row.source_hint,
        "last_matched_transaction_id": row.last_matched_transaction_id,
        "last_matched_at": row.last_matched_at,
        "next_due_date": row.next_due_date,
        "owner_role": row.owner_role,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _rule_base_query(db: Session, role: str, active_only: Optional[bool] = None):
    owner_role = owner_role_for_create(role)
    q = db.query(LedgerRecurringRule).filter(LedgerRecurringRule.is_deleted == False)  # noqa: E712
    q = apply_owner_scope(q, LedgerRecurringRule, role, owner_role=owner_role)
    if active_only is True:
        q = q.filter(LedgerRecurringRule.is_active == True)  # noqa: E712
    if active_only is False:
        q = q.filter(LedgerRecurringRule.is_active == False)  # noqa: E712
    return q


def _rule_full_payload(row: LedgerRecurringRule) -> dict[str, Any]:
    return {
        "name": row.name,
        "is_active": bool(row.is_active),
        "rule_type": row.rule_type,
        "frequency": row.frequency,
        "interval_count": int(row.interval_count or 1),
        "day_of_month": row.day_of_month,
        "weekday": row.weekday,
        "start_date": row.start_date,
        "end_date": row.end_date,
        "expected_amount": float(row.expected_amount) if row.expected_amount is not None else None,
        "amount_tolerance": float(row.amount_tolerance) if row.amount_tolerance is not None else None,
        "currency": row.currency,
        "account_id": row.account_id,
        "counterparty_account_id": row.counterparty_account_id,
        "category_id": row.category_id,
        "transaction_type": row.transaction_type,
        "direction": row.direction,
        "merchant": row.merchant,
        "description": row.description,
        "note": row.note,
        "source_hint": row.source_hint,
    }


def _find_transaction_match(
    db: Session,
    rule: LedgerRecurringRule,
    due_date: date,
    include_amount_check: bool,
) -> Optional[LedgerTransaction]:
    window = _window_days(rule.frequency)
    start_dt = datetime.combine(due_date - timedelta(days=window), time.min)
    end_dt = datetime.combine(due_date + timedelta(days=window), time.max)

    q = db.query(LedgerTransaction).filter(
        LedgerTransaction.is_deleted == False,  # noqa: E712
        LedgerTransaction.owner_role == rule.owner_role,
        LedgerTransaction.account_id == rule.account_id,
        LedgerTransaction.transaction_type == rule.transaction_type,
        LedgerTransaction.direction == rule.direction,
        LedgerTransaction.occurred_at >= start_dt,
        LedgerTransaction.occurred_at <= end_dt,
    )

    if rule.counterparty_account_id:
        q = q.filter(LedgerTransaction.counterparty_account_id == rule.counterparty_account_id)
    if rule.category_id:
        q = q.filter(LedgerTransaction.category_id == rule.category_id)
    if _norm_str(rule.merchant):
        merchant = _norm_lower(rule.merchant)
        q = q.filter(func.lower(func.coalesce(LedgerTransaction.merchant, "")).contains(merchant))

    rows = q.order_by(LedgerTransaction.occurred_at.desc(), LedgerTransaction.id.desc()).all()
    if not rows:
        return None

    if not include_amount_check:
        return rows[0]

    for row in rows:
        if _is_amount_in_range(float(row.amount or 0), _to_float(rule.expected_amount), _to_float(rule.amount_tolerance)):
            return row
    return None


def _advance_rule_after_match(rule: LedgerRecurringRule, tx: LedgerTransaction) -> None:
    rule.last_matched_transaction_id = tx.id
    rule.last_matched_at = tx.occurred_at
    tx.recurring_rule_id = rule.id
    next_from = max((rule.next_due_date or rule.start_date), tx.occurred_at.date()) + timedelta(days=1)
    rule.next_due_date = _compute_next_due_from_parts(
        frequency=rule.frequency,
        interval_count=int(rule.interval_count or 1),
        day_of_month=rule.day_of_month,
        weekday=rule.weekday,
        start_date=rule.start_date,
        end_date=rule.end_date,
        from_date=next_from,
    )


def list_recurring_rules(db: Session, role: str, active_only: Optional[bool] = None) -> dict[str, Any]:
    rows = _rule_base_query(db, role, active_only=active_only).order_by(
        LedgerRecurringRule.next_due_date.asc().nullslast(),
        LedgerRecurringRule.id.desc(),
    ).all()
    return {"items": [_rule_to_item(row) for row in rows]}


def create_recurring_rule(db: Session, role: str, payload) -> dict[str, Any]:
    owner_role = owner_role_for_create(role)
    data = payload.model_dump()
    data["name"] = _norm_str(data.get("name"))
    data["rule_type"] = _norm_lower(data.get("rule_type"))
    data["frequency"] = _norm_lower(data.get("frequency"))
    data["transaction_type"] = _norm_lower(data.get("transaction_type"))
    data["direction"] = _norm_lower(data.get("direction"))

    _validate_rule_data(db, role, owner_role, data)

    next_due_date = _compute_next_due_from_parts(
        frequency=data["frequency"],
        interval_count=int(data["interval_count"]),
        day_of_month=data.get("day_of_month"),
        weekday=data.get("weekday"),
        start_date=data["start_date"],
        end_date=data.get("end_date"),
        from_date=date.today(),
    )

    row = LedgerRecurringRule(
        **data,
        owner_role=owner_role,
        next_due_date=next_due_date,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _rule_to_item(row)


def update_recurring_rule(db: Session, role: str, rule_id: int, payload) -> dict[str, Any]:
    row = _get_rule_or_404(db, role, rule_id)
    patch = payload.model_dump(exclude_unset=True)

    merged = _rule_full_payload(row)
    merged.update(patch)
    merged["name"] = _norm_str(merged.get("name"))
    merged["rule_type"] = _norm_lower(merged.get("rule_type"))
    merged["frequency"] = _norm_lower(merged.get("frequency"))
    merged["transaction_type"] = _norm_lower(merged.get("transaction_type"))
    merged["direction"] = _norm_lower(merged.get("direction"))

    _validate_rule_data(db, role, row.owner_role, merged)

    row.name = merged["name"]
    row.is_active = bool(merged.get("is_active", True))
    row.rule_type = merged["rule_type"]
    row.frequency = merged["frequency"]
    row.interval_count = int(merged["interval_count"])
    row.day_of_month = merged.get("day_of_month")
    row.weekday = merged.get("weekday")
    row.start_date = merged["start_date"]
    row.end_date = merged.get("end_date")
    row.expected_amount = _to_float(merged.get("expected_amount"))
    row.amount_tolerance = _to_float(merged.get("amount_tolerance"))
    row.currency = _norm_str(merged.get("currency") or row.currency or "CNY")
    row.account_id = int(merged["account_id"])
    row.counterparty_account_id = int(merged["counterparty_account_id"]) if merged.get("counterparty_account_id") else None
    row.category_id = int(merged["category_id"]) if merged.get("category_id") else None
    row.transaction_type = merged["transaction_type"]
    row.direction = merged["direction"]
    row.merchant = _norm_str(merged.get("merchant")) or None
    row.description = _norm_str(merged.get("description")) or None
    row.note = _norm_str(merged.get("note")) or None
    row.source_hint = _norm_str(merged.get("source_hint")) or None

    row.next_due_date = _compute_next_due_from_parts(
        frequency=row.frequency,
        interval_count=int(row.interval_count or 1),
        day_of_month=row.day_of_month,
        weekday=row.weekday,
        start_date=row.start_date,
        end_date=row.end_date,
        from_date=date.today(),
    )

    db.commit()
    db.refresh(row)
    return _rule_to_item(row)


def delete_recurring_rule(db: Session, role: str, rule_id: int) -> dict[str, Any]:
    row = _get_rule_or_404(db, role, rule_id)
    row.is_deleted = True
    row.deleted_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


def _detect_frequency(interval_days: list[int]) -> Optional[str]:
    if not interval_days:
        return None
    mid = float(median(interval_days))
    weekly_hits = sum(1 for x in interval_days if abs(x - 7) <= 2)
    monthly_hits = sum(1 for x in interval_days if abs(x - 30) <= 5)
    yearly_hits = sum(1 for x in interval_days if abs(x - 365) <= 20)
    n = len(interval_days)

    candidates = []
    if weekly_hits / n >= 0.6:
        candidates.append((abs(mid - 7), "weekly"))
    if monthly_hits / n >= 0.6:
        candidates.append((abs(mid - 30), "monthly"))
    if yearly_hits / n >= 0.6:
        candidates.append((abs(mid - 365), "yearly"))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0])
    return candidates[0][1]


def detect_recurring_candidates(db: Session, role: str, payload) -> dict[str, Any]:
    owner_role = owner_role_for_create(role)
    now = datetime.utcnow()
    start_dt = now - timedelta(days=int(payload.lookback_days))

    q = db.query(LedgerTransaction).filter(
        LedgerTransaction.is_deleted == False,  # noqa: E712
        LedgerTransaction.occurred_at >= start_dt,
    )
    q = apply_owner_scope(q, LedgerTransaction, role, owner_role=owner_role)

    if payload.account_id:
        q = q.filter(LedgerTransaction.account_id == payload.account_id)
    if payload.direction:
        q = q.filter(LedgerTransaction.direction == payload.direction.value)
    if payload.transaction_type:
        q = q.filter(LedgerTransaction.transaction_type == payload.transaction_type.value)

    rows = q.order_by(LedgerTransaction.occurred_at.asc(), LedgerTransaction.id.asc()).all()

    groups: dict[tuple, list[LedgerTransaction]] = defaultdict(list)
    for row in rows:
        merchant_norm = _merchant_norm(row.merchant)
        if not merchant_norm:
            continue
        amount_value = round(float(row.amount or 0), 2)
        key = (merchant_norm, amount_value, row.account_id, row.transaction_type, row.direction)
        groups[key].append(row)

    items: list[dict[str, Any]] = []
    for key, txs in groups.items():
        if len(txs) < int(payload.min_occurrences):
            continue

        dates = [tx.occurred_at.date() for tx in txs]
        intervals = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
        freq = _detect_frequency(intervals)
        if not freq:
            continue

        weekday_counter = Counter(dt.weekday() for dt in dates)
        dom_counter = Counter(dt.day for dt in dates)
        category_counter = Counter(tx.category_id for tx in txs if tx.category_id)
        merchant_name = Counter(_norm_str(tx.merchant) for tx in txs if _norm_str(tx.merchant)).most_common(1)

        suggested_category_id = None
        if category_counter:
            cid, count = category_counter.most_common(1)[0]
            if count >= math.ceil(len(txs) * 0.5):
                suggested_category_id = int(cid)

        item = {
            "merchant": merchant_name[0][0] if merchant_name else "",
            "amount": float(key[1]),
            "account_id": int(key[2]),
            "transaction_type": key[3],
            "direction": key[4],
            "estimated_frequency": freq,
            "occurrences": len(txs),
            "last_seen_at": txs[-1].occurred_at,
            "suggested_day_of_month": None,
            "suggested_weekday": None,
            "suggested_category_id": suggested_category_id,
        }
        if freq in {"monthly", "yearly"}:
            item["suggested_day_of_month"] = int(dom_counter.most_common(1)[0][0])
        if freq == "weekly":
            item["suggested_weekday"] = int(weekday_counter.most_common(1)[0][0])

        items.append(item)

    items.sort(key=lambda x: (x["occurrences"], x["last_seen_at"]), reverse=True)
    return {"candidates": items[:100]}


def list_recurring_reminders(
    db: Session,
    role: str,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> dict[str, Any]:
    today = date.today()
    from_day = date_from or today
    to_day = date_to or (today + timedelta(days=7))

    rows = _rule_base_query(db, role, active_only=True).order_by(LedgerRecurringRule.next_due_date.asc().nullslast()).all()

    upcoming: list[dict[str, Any]] = []
    overdue: list[dict[str, Any]] = []
    amount_anomaly: list[dict[str, Any]] = []

    changed = False
    for rule in rows:
        if not rule.next_due_date:
            continue
        if rule.end_date and rule.next_due_date > rule.end_date:
            continue

        due = rule.next_due_date
        match_any_amount = _find_transaction_match(db, rule, due, include_amount_check=False)

        if match_any_amount:
            amount_ok = _is_amount_in_range(
                float(match_any_amount.amount or 0),
                _to_float(rule.expected_amount),
                _to_float(rule.amount_tolerance),
            )
            if not amount_ok:
                amount_anomaly.append(
                    {
                        "reminder_type": "amount_anomaly",
                        "rule_id": rule.id,
                        "rule_name": rule.name,
                        "frequency": rule.frequency,
                        "due_date": due,
                        "account_id": rule.account_id,
                        "account_name": rule.account.name if rule.account else None,
                        "category_id": rule.category_id,
                        "category_name": rule.category.name if rule.category else None,
                        "expected_amount": float(rule.expected_amount) if rule.expected_amount is not None else None,
                        "actual_amount": float(match_any_amount.amount or 0),
                        "amount_deviation": (
                            float(match_any_amount.amount or 0) - float(rule.expected_amount)
                            if rule.expected_amount is not None
                            else None
                        ),
                        "currency": rule.currency,
                        "merchant": rule.merchant,
                        "last_matched_transaction_id": match_any_amount.id,
                        "last_matched_at": match_any_amount.occurred_at,
                    }
                )

            if amount_ok and (not rule.last_matched_transaction_id or rule.last_matched_transaction_id != match_any_amount.id):
                _advance_rule_after_match(rule, match_any_amount)
                changed = True
            continue

        base_item = {
            "reminder_type": "upcoming" if due >= today else "overdue",
            "rule_id": rule.id,
            "rule_name": rule.name,
            "frequency": rule.frequency,
            "due_date": due,
            "account_id": rule.account_id,
            "account_name": rule.account.name if rule.account else None,
            "category_id": rule.category_id,
            "category_name": rule.category.name if rule.category else None,
            "expected_amount": float(rule.expected_amount) if rule.expected_amount is not None else None,
            "actual_amount": None,
            "amount_deviation": None,
            "currency": rule.currency,
            "merchant": rule.merchant,
            "last_matched_transaction_id": rule.last_matched_transaction_id,
            "last_matched_at": rule.last_matched_at,
        }

        if due < today:
            overdue.append(base_item)
        elif from_day <= due <= to_day:
            upcoming.append(base_item)

    if changed:
        db.commit()

    upcoming.sort(key=lambda x: (x["due_date"], x["rule_id"]))
    overdue.sort(key=lambda x: (x["due_date"], x["rule_id"]))
    amount_anomaly.sort(key=lambda x: (x["due_date"], x["rule_id"]))

    return {
        "upcoming": upcoming,
        "overdue": overdue,
        "amount_anomaly": amount_anomaly,
    }


def mark_recurring_match(db: Session, role: str, rule_id: int, transaction_id: int) -> dict[str, Any]:
    rule = _get_rule_or_404(db, role, rule_id)
    tx = db.query(LedgerTransaction).filter(LedgerTransaction.id == transaction_id, LedgerTransaction.is_deleted == False).first()  # noqa: E712
    if not tx:
        raise AppError("not_found", "流水不存在", status_code=404)
    ensure_row_visible(tx.owner_role, role)

    if tx.owner_role != rule.owner_role:
        raise AppError("invalid_payload", "owner_role 不匹配", status_code=400)
    if tx.account_id != rule.account_id:
        raise AppError("invalid_payload", "流水账户与规则不匹配", status_code=400)

    rule.last_matched_transaction_id = tx.id
    rule.last_matched_at = tx.occurred_at
    tx.recurring_rule_id = rule.id
    rule.next_due_date = _compute_next_due_from_parts(
        frequency=rule.frequency,
        interval_count=int(rule.interval_count or 1),
        day_of_month=rule.day_of_month,
        weekday=rule.weekday,
        start_date=rule.start_date,
        end_date=rule.end_date,
        from_date=tx.occurred_at.date() + timedelta(days=1),
    )
    db.commit()
    db.refresh(rule)
    return {
        "ok": True,
        "rule": _rule_to_item(rule),
    }


def generate_recurring_draft(db: Session, role: str, rule_id: int, occurred_at: Optional[datetime] = None) -> dict[str, Any]:
    rule = _get_rule_or_404(db, role, rule_id)
    target_time = occurred_at
    if target_time is None:
        due = rule.next_due_date or date.today()
        target_time = datetime.combine(due, time(hour=9, minute=0))

    return {
        "occurred_at": target_time,
        "account_id": rule.account_id,
        "counterparty_account_id": rule.counterparty_account_id,
        "category_id": rule.category_id,
        "transaction_type": rule.transaction_type,
        "direction": rule.direction,
        "amount": float(rule.expected_amount) if rule.expected_amount is not None else None,
        "currency": rule.currency,
        "merchant": rule.merchant,
        "description": rule.description,
        "note": rule.note,
        "source": "manual",
    }


def get_recurring_overview(db: Session, role: str) -> dict[str, Any]:
    active_count = _rule_base_query(db, role, active_only=True).count()
    reminders = list_recurring_reminders(db, role=role)

    next_due_items = list_recurring_rules(db, role=role, active_only=True).get("items", [])
    next_due_items = [item for item in next_due_items if item.get("next_due_date")][:5]

    return {
        "active_rule_count": int(active_count),
        "upcoming_count": len(reminders.get("upcoming", [])),
        "overdue_count": len(reminders.get("overdue", [])),
        "anomaly_count": len(reminders.get("amount_anomaly", [])),
        "next_due_items": next_due_items,
    }
