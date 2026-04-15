import json
import math
from collections import Counter
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from models import Trade, TradeReview


def _split_csv_values(value: Optional[str]) -> List[str]:
    return [x.strip() for x in str(value or "").split(",") if x and x.strip()]


def _sample_std(values: List[float]) -> float:
    n = len(values)
    if n <= 1:
        return 0.0
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / (n - 1)
    return math.sqrt(variance)


def _max_drawdown_from_pnl_series(values: List[float]) -> float:
    peak = 0.0
    cumulative = 0.0
    max_drawdown = 0.0
    for pnl in values:
        cumulative += pnl
        if cumulative > peak:
            peak = cumulative
        drawdown = peak - cumulative
        if drawdown > max_drawdown:
            max_drawdown = drawdown
    return max_drawdown


def _aggregate_time_series(rows: List[Trade], bucket_fn: Callable[[Any], str]) -> List[Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}
    for t in rows:
        if t.status != "closed":
            continue
        bucket = bucket_fn(t.trade_date)
        if bucket not in grouped:
            grouped[bucket] = {
                "bucket": bucket,
                "trade_count": 0,
                "win_count": 0,
                "loss_count": 0,
                "total_pnl": 0.0,
            }
        g = grouped[bucket]
        g["trade_count"] += 1
        pnl = float(t.pnl or 0.0)
        g["total_pnl"] += pnl
        if pnl > 0:
            g["win_count"] += 1
        elif pnl < 0:
            g["loss_count"] += 1
    items = []
    for bucket in sorted(grouped.keys()):
        g = grouped[bucket]
        trade_count = g["trade_count"]
        win_rate = (g["win_count"] / trade_count * 100.0) if trade_count else 0.0
        items.append(
            {
                "bucket": bucket,
                "trade_count": trade_count,
                "win_count": g["win_count"],
                "loss_count": g["loss_count"],
                "win_rate": round(win_rate, 2),
                "total_pnl": round(g["total_pnl"], 2),
            }
        )
    return items


def _group_trade_metrics(rows: List[Trade], key_fn: Callable[[Trade], Optional[str]]) -> List[Dict[str, Any]]:
    groups: Dict[str, Dict[str, Any]] = {}
    for t in rows:
        key = str(key_fn(t) or "").strip() or "未分类"
        if key not in groups:
            groups[key] = {
                "key": key,
                "trade_count": 0,
                "closed_trade_count": 0,
                "win_count": 0,
                "loss_count": 0,
                "total_pnl": 0.0,
            }
        g = groups[key]
        g["trade_count"] += 1
        if t.status == "closed":
            g["closed_trade_count"] += 1
            pnl = float(t.pnl or 0.0)
            g["total_pnl"] += pnl
            if pnl > 0:
                g["win_count"] += 1
            elif pnl < 0:
                g["loss_count"] += 1
    out = []
    for key, g in groups.items():
        closed_n = g["closed_trade_count"]
        out.append(
            {
                "key": key,
                "trade_count": g["trade_count"],
                "closed_trade_count": closed_n,
                "win_count": g["win_count"],
                "loss_count": g["loss_count"],
                "win_rate": round((g["win_count"] / closed_n * 100.0), 2) if closed_n else 0.0,
                "total_pnl": round(g["total_pnl"], 2),
            }
        )
    out.sort(key=lambda x: (x["trade_count"], x["total_pnl"]), reverse=True)
    return out


def _counter_to_rows(counter: Counter, key_name: str = "key") -> List[Dict[str, Any]]:
    rows = [{key_name: k, "count": int(v)} for k, v in counter.items()]
    rows.sort(key=lambda x: x["count"], reverse=True)
    return rows


def build_trade_analytics(
    db: Session,
    *,
    date_from: Optional[str],
    date_to: Optional[str],
    instrument_type: Optional[str],
    symbol: Optional[str],
    source_keyword: Optional[str],
    apply_source_keyword_filter: Callable[[Any, Optional[str]], Any],
    attach_trade_view_fields: Callable[[Session, List[Trade]], List[Trade]],
    build_position_state_from_db: Callable[[Session, Optional[str]], Dict[str, Dict[str, Any]]],
    extract_source_from_notes: Callable[[Optional[str]], Dict[str, Optional[str]]],
) -> Dict[str, Any]:
    symbols = _split_csv_values(symbol)

    q = db.query(Trade).filter(Trade.is_deleted == False)  # noqa: E712
    if date_from:
        q = q.filter(Trade.trade_date >= date_from)
    if date_to:
        q = q.filter(Trade.trade_date <= date_to)
    if instrument_type:
        q = q.filter(Trade.instrument_type == instrument_type)
    if symbols:
        q = q.filter(Trade.symbol.in_(symbols))
    q = apply_source_keyword_filter(q, source_keyword)

    trades = attach_trade_view_fields(db, q.order_by(Trade.trade_date.asc(), Trade.id.asc()).all())
    total = len(trades)
    closed_trades = [t for t in trades if t.status == "closed"]
    open_trades = [t for t in trades if t.status == "open"]

    closed_pnls = [float(t.pnl or 0.0) for t in closed_trades]
    wins = [p for p in closed_pnls if p > 0]
    losses = [p for p in closed_pnls if p < 0]
    gross_profit = sum(wins)
    gross_loss = sum(losses)
    gross_loss_abs = abs(gross_loss)
    total_commission = sum(float(t.commission or 0.0) for t in closed_trades)
    net_profit = sum(closed_pnls)
    closed_count = len(closed_trades)
    win_rate = (len(wins) / closed_count * 100.0) if closed_count else 0.0
    profit_factor = (gross_profit / gross_loss_abs) if gross_loss_abs > 1e-9 else 0.0
    avg_win = (sum(wins) / len(wins)) if wins else 0.0
    avg_loss = (sum(losses) / len(losses)) if losses else 0.0
    avg_win_loss_ratio = (avg_win / abs(avg_loss)) if avg_loss < -1e-9 else 0.0
    profit_share_denominator = gross_profit + gross_loss_abs
    profit_share_rate = (gross_profit / profit_share_denominator * 100.0) if profit_share_denominator > 1e-9 else 0.0
    commission_to_net_profit_ratio = (total_commission / net_profit) if net_profit > 1e-9 else None
    pnl_std_dev = _sample_std(closed_pnls)
    max_drawdown = _max_drawdown_from_pnl_series(closed_pnls)

    daily_pnl_map: Dict[str, float] = {}
    for t in closed_trades:
        key = t.trade_date.strftime("%Y-%m-%d")
        daily_pnl_map[key] = daily_pnl_map.get(key, 0.0) + float(t.pnl or 0.0)
    daily_pnls = [daily_pnl_map[k] for k in sorted(daily_pnl_map.keys())]
    sharpe_ratio = 0.0
    daily_std = _sample_std(daily_pnls)
    if len(daily_pnls) > 1 and daily_std > 1e-9:
        sharpe_ratio = (sum(daily_pnls) / len(daily_pnls)) / daily_std * math.sqrt(252.0)

    time_daily = _aggregate_time_series(closed_trades, lambda d: d.strftime("%Y-%m-%d"))
    time_weekly = _aggregate_time_series(closed_trades, lambda d: f"{d.isocalendar().year}-W{d.isocalendar().week:02d}")
    time_monthly = _aggregate_time_series(closed_trades, lambda d: d.strftime("%Y-%m"))

    by_symbol = _group_trade_metrics(trades, lambda t: t.symbol)
    by_source = _group_trade_metrics(trades, lambda t: getattr(t, "source_display", None) or "未知来源")

    trade_ids = [t.id for t in trades if t.id]
    review_by_trade_id: Dict[int, TradeReview] = {}
    if trade_ids:
        review_rows = db.query(TradeReview).filter(TradeReview.trade_id.in_(trade_ids)).all()
        review_by_trade_id = {r.trade_id: r for r in review_rows}

    taxonomy_fields = ["opportunity_structure", "edge_source", "failure_type", "review_conclusion"]
    review_dimensions: Dict[str, List[Dict[str, Any]]] = {}
    for field in taxonomy_fields:
        grouped: Dict[str, Dict[str, Any]] = {}
        for t in trades:
            review = review_by_trade_id.get(t.id)
            key = str(getattr(review, field, "") or "").strip()
            if not key:
                continue
            if key not in grouped:
                grouped[key] = {
                    "key": key,
                    "trade_count": 0,
                    "closed_trade_count": 0,
                    "win_count": 0,
                    "loss_count": 0,
                    "total_pnl": 0.0,
                }
            g = grouped[key]
            g["trade_count"] += 1
            if t.status == "closed":
                g["closed_trade_count"] += 1
                pnl = float(t.pnl or 0.0)
                g["total_pnl"] += pnl
                if pnl > 0:
                    g["win_count"] += 1
                elif pnl < 0:
                    g["loss_count"] += 1
        rows = []
        for key, g in grouped.items():
            closed_n = g["closed_trade_count"]
            rows.append(
                {
                    "key": key,
                    "trade_count": g["trade_count"],
                    "closed_trade_count": closed_n,
                    "win_count": g["win_count"],
                    "loss_count": g["loss_count"],
                    "win_rate": round((g["win_count"] / closed_n * 100.0), 2) if closed_n else 0.0,
                    "total_pnl": round(g["total_pnl"], 2),
                }
            )
        rows.sort(key=lambda x: (x["trade_count"], x["total_pnl"]), reverse=True)
        review_dimensions[field] = rows

    error_tags_counter: Counter = Counter()
    strategy_counter: Counter = Counter()
    market_condition_counter: Counter = Counter()
    timeframe_counter: Counter = Counter()
    planned_counter: Counter = Counter()
    overnight_counter: Counter = Counter()

    for t in trades:
        if t.error_tags:
            try:
                tags = json.loads(t.error_tags)
                if isinstance(tags, list):
                    for tag in tags:
                        if str(tag or "").strip():
                            error_tags_counter[str(tag).strip()] += 1
            except Exception:
                pass
        if t.strategy_type and str(t.strategy_type).strip():
            strategy_counter[str(t.strategy_type).strip()] += 1
        if t.market_condition and str(t.market_condition).strip():
            market_condition_counter[str(t.market_condition).strip()] += 1
        if t.timeframe and str(t.timeframe).strip():
            timeframe_counter[str(t.timeframe).strip()] += 1
        if t.is_planned is True:
            planned_counter["planned"] += 1
        elif t.is_planned is False:
            planned_counter["unplanned"] += 1
        else:
            planned_counter["unknown"] += 1
        if t.is_overnight is True:
            overnight_counter["overnight"] += 1
        else:
            overnight_counter["intraday_or_unknown"] += 1

    position_state = build_position_state_from_db(db, source_keyword=source_keyword)
    open_position_rows = []
    for _, st in position_state.items():
        qty = float(st.get("quantity") or 0.0)
        if qty < 1e-9:
            continue
        if symbols and st["symbol"] not in symbols:
            continue
        open_position_rows.append(
            {
                "symbol": st["symbol"],
                "contract": st.get("contract"),
                "side": st.get("side") or "做多",
                "net_quantity": round(qty, 6),
                "avg_open_price": round(float(st.get("avg_open_price") or 0.0), 4),
                "open_since": st.get("open_since"),
                "last_trade_date": st.get("last_trade_date"),
            }
        )
    open_position_rows.sort(key=lambda x: (x["symbol"], x["side"]))

    source_metadata_count = sum(1 for t in trades if bool(getattr(t, "source_is_metadata", False)))
    legacy_source_only_count = 0
    source_missing_count = 0
    for t in trades:
        if bool(getattr(t, "source_is_metadata", False)):
            continue
        parsed = extract_source_from_notes(t.notes)
        if parsed["broker_name"] or parsed["source_label"]:
            legacy_source_only_count += 1
        else:
            source_missing_count += 1
    trade_review_count = len(review_by_trade_id)

    return {
        "overview": {
            "total_trades": total,
            "closed_trades": closed_count,
            "open_trades": len(open_trades),
            "win_count": len(wins),
            "loss_count": len(losses),
            "win_rate": round(win_rate, 2),
            "total_pnl": round(net_profit, 2),
            "avg_pnl_per_closed_trade": round((net_profit / closed_count), 2) if closed_count else 0.0,
            "expectancy_per_trade": round((net_profit / closed_count), 2) if closed_count else 0.0,
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2),
            "avg_win_loss_ratio": round(avg_win_loss_ratio, 4),
            "profit_factor": round(profit_factor, 4),
            "sharpe_ratio": round(sharpe_ratio, 4),
            "commission_to_net_profit_ratio": round(commission_to_net_profit_ratio, 4) if commission_to_net_profit_ratio is not None else None,
            "profit_share_rate": round(profit_share_rate, 2),
            "total_commission": round(total_commission, 2),
            "gross_profit": round(gross_profit, 2),
            "gross_loss": round(gross_loss, 2),
            "gross_loss_abs": round(gross_loss_abs, 2),
            "pnl_std_dev": round(pnl_std_dev, 4),
            "max_drawdown": round(max_drawdown, 2),
            "open_position_count": len(open_position_rows),
        },
        "time_series": {
            "daily": time_daily,
            "weekly": time_weekly,
            "monthly": time_monthly,
        },
        "dimensions": {
            "by_symbol": by_symbol,
            "by_source": by_source,
            "by_review_field": review_dimensions,
        },
        "behavior": {
            "error_tags": _counter_to_rows(error_tags_counter, "tag"),
            "planned_vs_unplanned": _counter_to_rows(planned_counter, "key"),
            "strategy_type": _counter_to_rows(strategy_counter, "key"),
            "market_condition": _counter_to_rows(market_condition_counter, "key"),
            "timeframe": _counter_to_rows(timeframe_counter, "key"),
            "overnight_split": _counter_to_rows(overnight_counter, "key"),
        },
        "positions": {
            "open_positions": open_position_rows,
            "open_position_count": len(open_position_rows),
        },
        "coverage": {
            "trade_review_count": trade_review_count,
            "trade_review_rate": round((trade_review_count / total * 100.0), 2) if total else 0.0,
            "source_metadata_count": source_metadata_count,
            "source_metadata_rate": round((source_metadata_count / total * 100.0), 2) if total else 0.0,
            "legacy_source_only_count": legacy_source_only_count,
            "source_missing_count": source_missing_count,
        },
    }
