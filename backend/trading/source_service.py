import re
from typing import Any, Dict, List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import Trade, TradeBroker, TradeReview, TradeSourceMetadata


def extract_source_from_notes(note: Optional[str]) -> Dict[str, Optional[str]]:
    text = str(note or "")
    broker = None
    source = None
    m_broker = re.search(r"来源券商:\s*([^|]+)", text)
    if m_broker and m_broker.group(1).strip():
        broker = m_broker.group(1).strip()
    m_source = re.search(r"来源:\s*([^|]+)", text)
    if m_source and m_source.group(1).strip():
        source = m_source.group(1).strip()
    return {"broker_name": broker, "source_label": source}


def format_source_display(broker_name: Optional[str], source_label: Optional[str]) -> str:
    broker = (broker_name or "").strip()
    source = (source_label or "").strip()
    if broker and source:
        return f"{broker} / {source}"
    return broker or source or "-"


def resolve_trade_source_fields(trade: Trade, metadata: Optional[TradeSourceMetadata]) -> Dict[str, Any]:
    parsed = extract_source_from_notes(trade.notes)
    has_metadata = bool(
        metadata and ((metadata.broker_name and metadata.broker_name.strip()) or (metadata.source_label and metadata.source_label.strip()))
    )
    broker_name = ((metadata.broker_name if metadata else None) or parsed["broker_name"] or "").strip() or None
    source_label = ((metadata.source_label if metadata else None) or parsed["source_label"] or "").strip() or None
    return {
        "source_broker_name": broker_name,
        "source_label": source_label,
        "source_display": format_source_display(broker_name, source_label),
        "source_is_metadata": has_metadata,
    }


def apply_source_keyword_filter(q, source_keyword: Optional[str]):
    kw = (source_keyword or "").strip()
    if not kw:
        return q
    q = q.outerjoin(TradeSourceMetadata, TradeSourceMetadata.trade_id == Trade.id)
    return q.filter(
        or_(
            Trade.notes.contains(kw),
            TradeSourceMetadata.broker_name.contains(kw),
            TradeSourceMetadata.source_label.contains(kw),
        )
    )


def attach_trade_view_fields(db: Session, rows: List[Trade]) -> List[Trade]:
    if not rows:
        return rows
    trade_ids = [t.id for t in rows if t.id]
    if not trade_ids:
        return rows
    metadata_rows = db.query(TradeSourceMetadata).filter(TradeSourceMetadata.trade_id.in_(trade_ids)).all()
    metadata_by_trade_id = {row.trade_id: row for row in metadata_rows}
    review_trade_ids = {
        trade_id for (trade_id,) in db.query(TradeReview.trade_id).filter(TradeReview.trade_id.in_(trade_ids)).all()
    }
    for trade in rows:
        source_fields = resolve_trade_source_fields(trade, metadata_by_trade_id.get(trade.id))
        for key, value in source_fields.items():
            setattr(trade, key, value)
        setattr(trade, "has_trade_review", trade.id in review_trade_ids)
    return rows


def list_trade_sources(db: Session) -> List[str]:
    values = set()
    broker_rows = db.query(TradeBroker).order_by(TradeBroker.name.asc()).all()
    for b in broker_rows:
        if b.name and b.name.strip():
            values.add(b.name.strip())
    metadata_rows = db.query(TradeSourceMetadata).all()
    for row in metadata_rows:
        if row.broker_name and row.broker_name.strip():
            values.add(row.broker_name.strip())
        if row.source_label and row.source_label.strip():
            values.add(row.source_label.strip())
    note_rows = db.query(Trade.notes).filter(Trade.notes.isnot(None)).all()
    for (note,) in note_rows:
        parsed = extract_source_from_notes(note)
        if parsed["broker_name"]:
            values.add(parsed["broker_name"])
        if parsed["source_label"]:
            values.add(parsed["source_label"])
    return sorted(values)


def upsert_trade_source_metadata_for_import(
    db: Session,
    trade: Trade,
    broker: Optional[str],
    source_label: Optional[str] = "日结单粘贴导入",
) -> None:
    if not trade.id:
        return
    row = db.query(TradeSourceMetadata).filter(TradeSourceMetadata.trade_id == trade.id).first()
    if not row:
        row = TradeSourceMetadata(trade_id=trade.id)
        db.add(row)
    parsed = extract_source_from_notes(trade.notes)
    broker_name = (broker or parsed.get("broker_name") or "").strip() or None
    source_name = (source_label or parsed.get("source_label") or "").strip() or None
    if not row.broker_name and broker_name:
        row.broker_name = broker_name
    if not row.source_label and source_name:
        row.source_label = source_name
    if not row.import_channel:
        row.import_channel = "paste_import"
    if not row.parser_version:
        row.parser_version = "paste_v1"
    row.source_note_snapshot = trade.notes
    if row.derived_from_notes in {None, True}:
        row.derived_from_notes = False
