from typing import Any, Callable, Dict, List, Optional, Tuple, Type

from sqlalchemy.orm import Session

from models import Trade


def _parse_rows_and_dedup(
    db: Session,
    *,
    lines: List[str],
    start_idx: int,
    broker: Optional[str],
    parse_paste_row: Callable[[List[str], Optional[str]], Trade],
    error_cls: Type[Any],
) -> Tuple[List[Dict[str, Any]], int, List[Any]]:
    parsed_rows: List[Dict[str, Any]] = []
    skipped = 0
    errors: List[Any] = []

    for idx, raw in enumerate(lines[start_idx:], start=start_idx + 1):
        try:
            cells = [c.replace("\xa0", " ").strip() for c in raw.split("\t")]
            trade_obj = parse_paste_row(cells, broker)
            # 开仓行做去重；平仓行必须参与冲销，不能因历史“独立平仓记录”被跳过
            if trade_obj.status == "open":
                q_exist = db.query(Trade).filter(
                    Trade.is_deleted == False,  # noqa: E712
                    Trade.trade_date == trade_obj.trade_date,
                    Trade.contract == trade_obj.contract,
                    Trade.direction == trade_obj.direction,
                    Trade.open_price == trade_obj.open_price,
                    Trade.quantity == trade_obj.quantity,
                    Trade.status == trade_obj.status,
                    Trade.commission == trade_obj.commission,
                    Trade.pnl == trade_obj.pnl,
                )
                if broker:
                    q_exist = q_exist.filter(Trade.notes.contains(f"来源券商: {broker}"))
                existed = q_exist.first()
                if existed:
                    skipped += 1
                    continue
            parsed_rows.append({"row": idx, "raw": raw, "trade": trade_obj})
        except Exception as exc:
            errors.append(error_cls(row=idx, reason=str(exc), raw=raw[:300]))
    return parsed_rows, skipped, errors


def _precheck_close_rows(
    db: Session,
    *,
    parsed_rows: List[Dict[str, Any]],
    broker: Optional[str],
    normalize_contract_symbol: Callable[[str], str],
    position_side: Callable[[str, str], str],
    state_key_contract: Callable[[str, Optional[str], str], str],
    error_cls: Type[Any],
) -> Tuple[List[Dict[str, Any]], List[Any]]:
    errors: List[Any] = []
    hist_pool: Dict[str, float] = {}
    q_hist = db.query(Trade).filter(
        Trade.is_deleted == False,  # noqa: E712
        Trade.instrument_type == "期货",
        Trade.status == "open",
    )
    if broker:
        q_hist = q_hist.filter(Trade.notes.contains(f"来源券商: {broker}"))
    for t in q_hist.all():
        k = state_key_contract(t.symbol, t.contract, t.direction)
        hist_pool[k] = hist_pool.get(k, 0.0) + float(t.quantity or 0)

    batch_open_pool: Dict[str, float] = {}
    for item in parsed_rows:
        t: Trade = item["trade"]
        if t.status != "open":
            continue
        k = state_key_contract(t.symbol, t.contract, t.direction)
        batch_open_pool[k] = batch_open_pool.get(k, 0.0) + float(t.quantity or 0)

    valid_rows: List[Dict[str, Any]] = []
    for item in parsed_rows:
        t: Trade = item["trade"]
        if t.status == "open":
            valid_rows.append(item)
            continue
        symbol = normalize_contract_symbol(t.contract or t.symbol or "")
        side = position_side(t.direction, "closed")
        k = state_key_contract(symbol, t.contract, side)
        need = float(t.quantity or 0)
        if need <= 0:
            errors.append(error_cls(row=item["row"], reason="平仓手数必须大于0", raw=item["raw"][:300]))
            continue
        hist_avail = hist_pool.get(k, 0.0)
        use_hist = min(hist_avail, need)
        hist_pool[k] = hist_avail - use_hist
        remain = need - use_hist
        if remain > 1e-9:
            batch_avail = batch_open_pool.get(k, 0.0)
            use_batch = min(batch_avail, remain)
            batch_open_pool[k] = batch_avail - use_batch
            remain -= use_batch
        if remain > 1e-9:
            errors.append(
                error_cls(
                    row=item["row"],
                    reason=f"{symbol} {side} 平仓失败：历史与本次粘贴均无足够对应开仓",
                    raw=item["raw"][:300],
                )
            )
            continue
        valid_rows.append(item)
    return valid_rows, errors


def _apply_rows(
    db: Session,
    *,
    valid_rows: List[Dict[str, Any]],
    broker: Optional[str],
    apply_close_fill_to_db: Callable[[Session, Trade, Optional[str]], List[Trade]],
    upsert_trade_source_metadata_for_import: Callable[[Session, Trade, Optional[str]], None],
    error_cls: Type[Any],
) -> Tuple[int, List[Any]]:
    inserted = 0
    errors: List[Any] = []

    open_rows = [x for x in valid_rows if x["trade"].status == "open"]
    close_rows = [x for x in valid_rows if x["trade"].status == "closed"]
    open_rows.sort(key=lambda x: (x["trade"].trade_date, x["row"]))
    close_rows.sort(key=lambda x: (x["trade"].trade_date, x["row"]))

    for item in open_rows:
        db.add(item["trade"])
        inserted += 1
    db.flush()
    for item in open_rows:
        upsert_trade_source_metadata_for_import(db, item["trade"], broker=broker)

    for item in close_rows:
        try:
            affected_close_rows = apply_close_fill_to_db(db, item["trade"], broker=broker)
            db.flush()
            for row in affected_close_rows:
                upsert_trade_source_metadata_for_import(db, row, broker=broker)
            inserted += 1
        except Exception as exc:
            errors.append(error_cls(row=item["row"], reason=str(exc), raw=item["raw"][:300]))
    return inserted, errors


def import_paste_trades_staged(
    db: Session,
    *,
    raw_text: str,
    broker: Optional[str],
    paste_headers: List[str],
    parse_paste_row: Callable[[List[str], Optional[str]], Trade],
    normalize_contract_symbol: Callable[[str], str],
    position_side: Callable[[str, str], str],
    state_key_contract: Callable[[str, Optional[str], str], str],
    apply_close_fill_to_db: Callable[[Session, Trade, Optional[str]], List[Trade]],
    upsert_trade_source_metadata_for_import: Callable[[Session, Trade, Optional[str]], None],
    error_cls: Type[Any],
    response_cls: Type[Any],
) -> Any:
    text = (raw_text or "").strip()
    if not text:
        raise ValueError("请粘贴交易数据")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        raise ValueError("粘贴内容为空")

    first_cells = [c.strip() for c in lines[0].split("\t")]
    start_idx = 1 if all(h in first_cells for h in paste_headers) else 0

    parsed_rows, skipped, parse_errors = _parse_rows_and_dedup(
        db,
        lines=lines,
        start_idx=start_idx,
        broker=broker,
        parse_paste_row=parse_paste_row,
        error_cls=error_cls,
    )

    valid_rows, precheck_errors = _precheck_close_rows(
        db,
        parsed_rows=parsed_rows,
        broker=broker,
        normalize_contract_symbol=normalize_contract_symbol,
        position_side=position_side,
        state_key_contract=state_key_contract,
        error_cls=error_cls,
    )

    inserted, apply_errors = _apply_rows(
        db,
        valid_rows=valid_rows,
        broker=broker,
        apply_close_fill_to_db=apply_close_fill_to_db,
        upsert_trade_source_metadata_for_import=upsert_trade_source_metadata_for_import,
        error_cls=error_cls,
    )

    errors = [*parse_errors, *precheck_errors, *apply_errors]
    db.commit()
    return response_cls(inserted=inserted, skipped=skipped, errors=errors[:100])
