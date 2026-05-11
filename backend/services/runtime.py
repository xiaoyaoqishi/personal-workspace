from __future__ import annotations

import threading
import time as _time
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import event, text
from sqlalchemy.orm import Session, with_loader_criteria

from core import context
from core.db import Base, SessionLocal, engine
from core.security import ensure_admin, normalize_owner_role
from models import (
    BrowseLog,
    KnowledgeCategory,
    KnowledgeItem,
    Note,
    Notebook,
    Review,
    ReviewSession,
    ReviewSessionTradeLink,
    ReviewTradeLink,
    TodoItem,
    Trade,
    TradeBroker,
    TradePlan,
)
from trading.review_session_service import normalize_review_session_scope as _review_session_normalize_scope

ROLE_SCOPED_MODELS = (
    Trade,
    ReviewSession,
    TradePlan,
    KnowledgeCategory,
    KnowledgeItem,
    Notebook,
    Note,
    TodoItem,
    TradeBroker,
)


def _current_username() -> str:
    return context.username()


def _current_role() -> str:
    return context.role()


def _current_is_admin() -> bool:
    return context.is_admin()


def _owner_role_value_for_create() -> str:
    return "admin" if _current_is_admin() else "user"


def _require_admin():
    ensure_admin(is_admin=_current_is_admin())


def _owner_role_filter_for_admin(model, owner_role: Optional[str]):
    if not _current_is_admin():
        return None
    role = normalize_owner_role(owner_role)
    if role:
        return model.owner_role == role
    return None


@event.listens_for(Session, "do_orm_execute")
def _apply_owner_role_scope(execute_state):
    if not execute_state.is_select:
        return
    if _current_is_admin():
        return
    statement = execute_state.statement
    for model in ROLE_SCOPED_MODELS:
        statement = statement.options(
            with_loader_criteria(model, lambda cls: cls.owner_role == "user", include_aliases=True)
        )
    execute_state.statement = statement


def _column_names(db: Session, table: str) -> set[str]:
    rows = db.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {row[1] for row in rows}


def _table_exists(db: Session, table: str) -> bool:
    row = db.execute(
        text("SELECT name FROM sqlite_master WHERE type = 'table' AND name = :name"),
        {"name": table},
    ).fetchone()
    return bool(row)


def _ensure_sqlite_column(db: Session, table: str, column: str, ddl_fragment: str):
    columns = _column_names(db, table)
    if columns and column not in columns:
        db.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_fragment}"))


def _rebuild_ledger_schema_if_incompatible(db: Session) -> bool:
    if not _table_exists(db, "ledger_rules"):
        return False

    rule_cols = _column_names(db, "ledger_rules")
    required_rule_cols = {
        "rule_type",
        "priority",
        "enabled",
        "match_mode",
        "pattern",
        "target_txn_kind",
        "target_scene",
    }
    if required_rule_cols.issubset(rule_cols):
        return False

    db.execute(text("PRAGMA foreign_keys = OFF"))
    for table in (
        "ledger_transactions",
        "ledger_import_rows",
        "ledger_import_batches",
        "ledger_rules",
        "ledger_merchants",
        "ledger_categories",
    ):
        if _table_exists(db, table):
            db.execute(text(f"DROP TABLE IF EXISTS {table}"))
    db.commit()
    db.execute(text("PRAGMA foreign_keys = ON"))
    Base.metadata.create_all(bind=engine)
    return True


def _migrate_legacy_schema():
    db = SessionLocal()
    try:
        _rebuild_ledger_schema_if_incompatible(db)
        if _table_exists(db, "users"):
            user_cols = _column_names(db, "users")
            if "password_hash" not in user_cols:
                db.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"))
                if "password" in user_cols:
                    db.execute(
                        text(
                            "UPDATE users SET password_hash = password "
                            "WHERE (password_hash IS NULL OR password_hash = '') AND password IS NOT NULL"
                        )
                    )
            _ensure_sqlite_column(db, "users", "role", "VARCHAR(20) DEFAULT 'user'")
            _ensure_sqlite_column(db, "users", "is_active", "BOOLEAN DEFAULT 1")
            _ensure_sqlite_column(db, "users", "module_permissions", "TEXT")
            _ensure_sqlite_column(db, "users", "data_permissions", "TEXT")
            _ensure_sqlite_column(db, "users", "created_at", "DATETIME")
            _ensure_sqlite_column(db, "users", "updated_at", "DATETIME")
            db.execute(text("UPDATE users SET role='user' WHERE role IS NULL OR role=''"))
            db.execute(text("UPDATE users SET is_active=1 WHERE is_active IS NULL"))
            db.execute(text("UPDATE users SET role='admin' WHERE username='xiaoyao'"))

        notebook_cols = _column_names(db, "notebooks")
        if "parent_id" not in notebook_cols:
            db.execute(text("ALTER TABLE notebooks ADD COLUMN parent_id INTEGER"))
        if "sort_order" not in notebook_cols:
            db.execute(text("ALTER TABLE notebooks ADD COLUMN sort_order INTEGER DEFAULT 0"))
        _ensure_sqlite_column(db, "notebooks", "owner_role", "VARCHAR(20) DEFAULT 'admin'")

        note_cols = _column_names(db, "notes")
        if "is_deleted" not in note_cols:
            db.execute(text("ALTER TABLE notes ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
        if "deleted_at" not in note_cols:
            db.execute(text("ALTER TABLE notes ADD COLUMN deleted_at DATETIME"))
        _ensure_sqlite_column(db, "notes", "owner_role", "VARCHAR(20) DEFAULT 'admin'")

        todo_cols = _column_names(db, "todo_items")
        if "source_anchor_text" not in todo_cols:
            db.execute(text("ALTER TABLE todo_items ADD COLUMN source_anchor_text TEXT"))
        if "due_at" not in todo_cols:
            db.execute(text("ALTER TABLE todo_items ADD COLUMN due_at DATETIME"))
        if "reminder_at" not in todo_cols:
            db.execute(text("ALTER TABLE todo_items ADD COLUMN reminder_at DATETIME"))
        _ensure_sqlite_column(db, "todo_items", "owner_role", "VARCHAR(20) DEFAULT 'admin'")

        review_cols = _column_names(db, "reviews")
        if "title" not in review_cols:
            db.execute(text("ALTER TABLE reviews ADD COLUMN title VARCHAR(200)"))
        if "review_scope" not in review_cols:
            db.execute(text("ALTER TABLE reviews ADD COLUMN review_scope VARCHAR(30) DEFAULT 'periodic'"))
        if "focus_topic" not in review_cols:
            db.execute(text("ALTER TABLE reviews ADD COLUMN focus_topic VARCHAR(200)"))
        if "market_regime" not in review_cols:
            db.execute(text("ALTER TABLE reviews ADD COLUMN market_regime VARCHAR(100)"))
        if "tags" not in review_cols:
            db.execute(text("ALTER TABLE reviews ADD COLUMN tags TEXT"))
        if "action_items" not in review_cols:
            db.execute(text("ALTER TABLE reviews ADD COLUMN action_items TEXT"))
        if "research_notes" not in review_cols:
            db.execute(text("ALTER TABLE reviews ADD COLUMN research_notes TEXT"))
        if "is_favorite" not in review_cols:
            db.execute(text("ALTER TABLE reviews ADD COLUMN is_favorite BOOLEAN DEFAULT 0"))
        if "star_rating" not in review_cols:
            db.execute(text("ALTER TABLE reviews ADD COLUMN star_rating INTEGER"))

        trade_cols = _column_names(db, "trades")
        if "is_favorite" not in trade_cols:
            db.execute(text("ALTER TABLE trades ADD COLUMN is_favorite BOOLEAN DEFAULT 0"))
        if "star_rating" not in trade_cols:
            db.execute(text("ALTER TABLE trades ADD COLUMN star_rating INTEGER"))
        if "is_deleted" not in trade_cols:
            db.execute(text("ALTER TABLE trades ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
        if "deleted_at" not in trade_cols:
            db.execute(text("ALTER TABLE trades ADD COLUMN deleted_at DATETIME"))
        _ensure_sqlite_column(db, "trades", "owner_role", "VARCHAR(20) DEFAULT 'admin'")
        _ensure_sqlite_column(db, "trades", "leverage", "FLOAT")

        if _table_exists(db, "trade_brokers"):
            _ensure_sqlite_column(db, "trade_brokers", "is_deleted", "BOOLEAN DEFAULT 0")
            _ensure_sqlite_column(db, "trade_brokers", "deleted_at", "DATETIME")
            _ensure_sqlite_column(db, "trade_brokers", "owner_role", "VARCHAR(20) DEFAULT 'admin'")
        if _table_exists(db, "knowledge_items"):
            _ensure_sqlite_column(db, "knowledge_items", "is_deleted", "BOOLEAN DEFAULT 0")
            _ensure_sqlite_column(db, "knowledge_items", "deleted_at", "DATETIME")
            _ensure_sqlite_column(db, "knowledge_items", "owner_role", "VARCHAR(20) DEFAULT 'admin'")
            _ensure_sqlite_column(db, "knowledge_items", "sub_category", "VARCHAR(100)")
        if _table_exists(db, "review_sessions"):
            _ensure_sqlite_column(db, "review_sessions", "review_kind", "VARCHAR(40) DEFAULT 'custom'")
            _ensure_sqlite_column(db, "review_sessions", "review_scope", "VARCHAR(40) DEFAULT 'custom'")
            _ensure_sqlite_column(db, "review_sessions", "selection_mode", "VARCHAR(40) DEFAULT 'manual'")
            _ensure_sqlite_column(db, "review_sessions", "selection_basis", "TEXT DEFAULT ''")
            _ensure_sqlite_column(db, "review_sessions", "review_goal", "TEXT DEFAULT ''")
            _ensure_sqlite_column(db, "review_sessions", "market_regime", "VARCHAR(100)")
            _ensure_sqlite_column(db, "review_sessions", "summary", "TEXT")
            _ensure_sqlite_column(db, "review_sessions", "repeated_errors", "TEXT")
            _ensure_sqlite_column(db, "review_sessions", "next_focus", "TEXT")
            _ensure_sqlite_column(db, "review_sessions", "action_items", "TEXT")
            _ensure_sqlite_column(db, "review_sessions", "content", "TEXT")
            _ensure_sqlite_column(db, "review_sessions", "research_notes", "TEXT")
            _ensure_sqlite_column(db, "review_sessions", "tags", "TEXT")
            _ensure_sqlite_column(db, "review_sessions", "filter_snapshot_json", "TEXT")
            _ensure_sqlite_column(db, "review_sessions", "is_favorite", "BOOLEAN DEFAULT 0")
            _ensure_sqlite_column(db, "review_sessions", "star_rating", "INTEGER")
            _ensure_sqlite_column(db, "review_sessions", "is_deleted", "BOOLEAN DEFAULT 0")
            _ensure_sqlite_column(db, "review_sessions", "deleted_at", "DATETIME")
            _ensure_sqlite_column(db, "review_sessions", "owner_role", "VARCHAR(20) DEFAULT 'admin'")
        if _table_exists(db, "trade_reviews"):
            _ensure_sqlite_column(db, "trade_reviews", "discipline_violated", "BOOLEAN DEFAULT 0")
        if _table_exists(db, "trade_plans"):
            _ensure_sqlite_column(db, "trade_plans", "status", "VARCHAR(20) DEFAULT 'draft'")
            _ensure_sqlite_column(db, "trade_plans", "symbol", "VARCHAR(50)")
            _ensure_sqlite_column(db, "trade_plans", "contract", "VARCHAR(50)")
            _ensure_sqlite_column(db, "trade_plans", "direction_bias", "VARCHAR(20)")
            _ensure_sqlite_column(db, "trade_plans", "setup_type", "VARCHAR(80)")
            _ensure_sqlite_column(db, "trade_plans", "market_regime", "VARCHAR(100)")
            _ensure_sqlite_column(db, "trade_plans", "entry_zone", "TEXT")
            _ensure_sqlite_column(db, "trade_plans", "stop_loss_plan", "TEXT")
            _ensure_sqlite_column(db, "trade_plans", "target_plan", "TEXT")
            _ensure_sqlite_column(db, "trade_plans", "invalid_condition", "TEXT")
            _ensure_sqlite_column(db, "trade_plans", "thesis", "TEXT")
            _ensure_sqlite_column(db, "trade_plans", "risk_notes", "TEXT")
            _ensure_sqlite_column(db, "trade_plans", "execution_checklist", "TEXT")
            _ensure_sqlite_column(db, "trade_plans", "priority", "VARCHAR(20) DEFAULT 'medium'")
            _ensure_sqlite_column(db, "trade_plans", "tags", "TEXT")
            _ensure_sqlite_column(db, "trade_plans", "source_ref", "VARCHAR(200)")
            _ensure_sqlite_column(db, "trade_plans", "post_result_summary", "TEXT")
            _ensure_sqlite_column(db, "trade_plans", "research_notes", "TEXT")
            _ensure_sqlite_column(db, "trade_plans", "is_deleted", "BOOLEAN DEFAULT 0")
            _ensure_sqlite_column(db, "trade_plans", "deleted_at", "DATETIME")
            _ensure_sqlite_column(db, "trade_plans", "owner_role", "VARCHAR(20) DEFAULT 'admin'")
        if _table_exists(db, "ledger_transactions"):
            _ensure_sqlite_column(db, "ledger_transactions", "confidence_score", "FLOAT")

        for table in (
            "trades",
            "review_sessions",
            "trade_plans",
            "knowledge_items",
            "trade_brokers",
            "notebooks",
            "notes",
            "todo_items",
        ):
            if _table_exists(db, table):
                db.execute(text(f"UPDATE {table} SET owner_role='admin' WHERE owner_role IS NULL OR owner_role=''"))
        db.commit()
    finally:
        db.close()


def _migrate_reviews_to_review_sessions():
    db = SessionLocal()
    try:
        if not _table_exists(db, "review_sessions"):
            return
        has_review_rows = db.query(Review).first() is not None
        has_review_session_rows = db.query(ReviewSession).first() is not None
        if not has_review_rows or has_review_session_rows:
            return

        review_rows = db.query(Review).order_by(Review.id.asc()).all()
        for row in review_rows:
            obj = ReviewSession(
                title=row.title or f"{row.review_date} {row.review_type}",
                review_kind="period" if (row.review_scope or "periodic") == "periodic" else "custom",
                review_scope=_review_session_normalize_scope(row.review_scope),
                selection_mode="manual",
                selection_basis=row.focus_topic or f"legacy review #{row.id}",
                review_goal=row.summary or "legacy migration",
                market_regime=row.market_regime,
                summary=row.summary,
                repeated_errors=row.repeated_errors,
                next_focus=row.next_focus,
                action_items=row.action_items,
                content=row.content,
                research_notes=row.research_notes,
                tags_text=row.tags_text,
                filter_snapshot_json=None,
                is_favorite=bool(row.is_favorite),
                star_rating=row.star_rating,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            db.add(obj)
            db.flush()

            trade_links = (
                db.query(ReviewTradeLink)
                .filter(ReviewTradeLink.review_id == row.id)
                .order_by(ReviewTradeLink.id.asc())
                .all()
            )
            for index, link in enumerate(trade_links):
                db.add(
                    ReviewSessionTradeLink(
                        review_session_id=obj.id,
                        trade_id=link.trade_id,
                        role=link.role,
                        note=link.notes,
                        sort_order=index,
                    )
                )
        db.commit()
    finally:
        db.close()


def _init_default_notebooks():
    from services.notes_runtime import init_default_notebooks

    init_default_notebooks()


def _index_links_for_existing_notes():
    from services import notes_runtime as _notes_runtime

    _notes_runtime.index_links_for_existing_notes()


from services import knowledge_runtime as _knowledge_runtime
from services import notes_runtime as _notes_runtime
from services import review_runtime as _review_runtime
from services import trade_analytics_runtime as _trade_analytics_runtime
from services import trade_broker_runtime as _trade_broker_runtime
from services import trade_import_runtime as _trade_import_runtime
from services import trade_plan_runtime as _trade_plan_runtime
from services import trading_runtime as _trading_runtime
from services import utility_runtime as _utility_runtime

PASTE_TRADE_HEADERS = _trade_import_runtime.PASTE_TRADE_HEADERS
_normalize_contract_symbol = _trading_runtime._normalize_contract_symbol
_position_side = _trading_runtime._position_side
_state_key = _trading_runtime._state_key
_state_key_contract = _trading_runtime._state_key_contract
_ensure_symbol_state = _trading_runtime._ensure_symbol_state
_build_position_state_from_db = _trading_runtime._build_position_state_from_db
_build_position_state_from_db_with_owner_role = _trading_runtime._build_position_state_from_db_with_owner_role
_append_note = _trading_runtime._append_note
_extract_source_from_notes = _trading_runtime._extract_source_from_notes
_attach_trade_view_fields = _trading_runtime._attach_trade_view_fields
_apply_source_keyword_filter = _trading_runtime._apply_source_keyword_filter
_upsert_trade_source_metadata_for_import = _trading_runtime._upsert_trade_source_metadata_for_import
_parse_include_ids = _trading_runtime._parse_include_ids

import_trades_from_paste = _trade_import_runtime.import_trades_from_paste
list_trade_positions = _trading_runtime.list_trade_positions
list_trades = _trading_runtime.list_trades
list_trade_search_options = _trading_runtime.list_trade_search_options
count_trades = _trade_analytics_runtime.count_trades
get_statistics = _trade_analytics_runtime.get_statistics
get_trade_analytics = _trade_analytics_runtime.get_trade_analytics
create_trade = _trading_runtime.create_trade
get_trade = _trading_runtime.get_trade
update_trade = _trading_runtime.update_trade
delete_trade = _trading_runtime.delete_trade
list_trade_sources = _trading_runtime.list_trade_sources
list_trade_symbols = _trading_runtime.list_trade_symbols
get_trade_review_taxonomy = _trading_runtime.get_trade_review_taxonomy
get_trade_review = _trading_runtime.get_trade_review
upsert_trade_review = _trading_runtime.upsert_trade_review
delete_trade_review = _trading_runtime.delete_trade_review
get_trade_source_metadata = _trading_runtime.get_trade_source_metadata
upsert_trade_source_metadata = _trading_runtime.upsert_trade_source_metadata
list_trade_brokers = _trade_broker_runtime.list_trade_brokers
create_trade_broker = _trade_broker_runtime.create_trade_broker
update_trade_broker = _trade_broker_runtime.update_trade_broker
delete_trade_broker = _trade_broker_runtime.delete_trade_broker

list_notebooks = _notes_runtime.list_notebooks
create_notebook = _notes_runtime.create_notebook
update_notebook = _notes_runtime.update_notebook
delete_notebook = _notes_runtime.delete_notebook
list_notes = _notes_runtime.list_notes
note_stats = _notes_runtime.note_stats
history_today = _notes_runtime.history_today
diary_tree = _notes_runtime.diary_tree
search_notes = _notes_runtime.search_notes
resolve_note_link = _notes_runtime.resolve_note_link
note_backlinks = _notes_runtime.note_backlinks
diary_summaries = _notes_runtime.diary_summaries
notes_calendar = _notes_runtime.notes_calendar
create_note = _notes_runtime.create_note
get_note = _notes_runtime.get_note
update_note = _notes_runtime.update_note
delete_note = _notes_runtime.delete_note
list_todos = _notes_runtime.list_todos
create_todo = _notes_runtime.create_todo
update_todo = _notes_runtime.update_todo
delete_todo = _notes_runtime.delete_todo

list_knowledge_items = _knowledge_runtime.list_knowledge_items
list_knowledge_item_categories = _knowledge_runtime.list_knowledge_item_categories
create_knowledge_item_category = _knowledge_runtime.create_knowledge_item_category
delete_knowledge_item_category = _knowledge_runtime.delete_knowledge_item_category
create_knowledge_item = _knowledge_runtime.create_knowledge_item
get_knowledge_item = _knowledge_runtime.get_knowledge_item
update_knowledge_item = _knowledge_runtime.update_knowledge_item
delete_knowledge_item = _knowledge_runtime.delete_knowledge_item

_attach_review_session_fields = _review_runtime._attach_review_session_fields
list_review_sessions = _review_runtime.list_review_sessions
create_review_session = _review_runtime.create_review_session
create_review_session_from_selection = _review_runtime.create_review_session_from_selection
get_review_session = _review_runtime.get_review_session
update_review_session = _review_runtime.update_review_session
delete_review_session = _review_runtime.delete_review_session
upsert_review_session_trade_links = _review_runtime.upsert_review_session_trade_links
list_reviews = _review_runtime.list_reviews
create_review = _review_runtime.create_review
get_review = _review_runtime.get_review
update_review = _review_runtime.update_review
delete_review = _review_runtime.delete_review
upsert_review_trade_links = _review_runtime.upsert_review_trade_links

_attach_trade_plan_fields = _trade_plan_runtime._attach_trade_plan_fields
list_trade_plans = _trade_plan_runtime.list_trade_plans
create_trade_plan = _trade_plan_runtime.create_trade_plan
get_trade_plan = _trade_plan_runtime.get_trade_plan
update_trade_plan = _trade_plan_runtime.update_trade_plan
delete_trade_plan = _trade_plan_runtime.delete_trade_plan
upsert_trade_plan_trade_links = _trade_plan_runtime.upsert_trade_plan_trade_links
upsert_trade_plan_review_session_links = _trade_plan_runtime.upsert_trade_plan_review_session_links
create_followup_review_session_from_trade_plan = _trade_plan_runtime.create_followup_review_session_from_trade_plan

upload_file = _utility_runtime.upload_file
get_upload = _utility_runtime.get_upload
get_daily_poem = _utility_runtime.get_daily_poem

BROWSE_LOG_RETENTION_DAYS = 180


def _cleanup_old_browse_logs():
    db = SessionLocal()
    try:
        cutoff = datetime.now() - timedelta(days=BROWSE_LOG_RETENTION_DAYS)
        db.query(BrowseLog).filter(BrowseLog.created_at < cutoff).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _maintenance_loop():
    while True:
        try:
            _cleanup_old_browse_logs()
        except Exception:
            pass
        _time.sleep(3600)


_maintenance_thread = threading.Thread(target=_maintenance_loop, daemon=True)
_RUNTIME_INITIALIZED = False


def init_runtime() -> None:
    global _RUNTIME_INITIALIZED
    if _RUNTIME_INITIALIZED:
        return

    from services.auth_runtime import migrate_legacy_auth_to_users
    from services.monitor_runtime import init_monitor_runtime

    Base.metadata.create_all(bind=engine)
    _migrate_legacy_schema()
    _migrate_reviews_to_review_sessions()
    _init_default_notebooks()
    migrate_legacy_auth_to_users()
    _index_links_for_existing_notes()
    _maintenance_thread.start()
    init_monitor_runtime()
    _RUNTIME_INITIALIZED = True
