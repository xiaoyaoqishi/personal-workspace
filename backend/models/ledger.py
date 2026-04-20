from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.db import Base


class LedgerAccount(Base):
    __tablename__ = "ledger_accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, index=True)
    account_type = Column(String(20), nullable=False, index=True)
    currency = Column(String(10), nullable=False, default="CNY")
    initial_balance = Column(Float, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text)
    owner_role = Column(String(20), default="admin", index=True)
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    transactions = relationship("LedgerTransaction", foreign_keys="LedgerTransaction.account_id", back_populates="account")


class LedgerCategory(Base):
    __tablename__ = "ledger_categories"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("ledger_categories.id"), nullable=True, index=True)
    name = Column(String(120), nullable=False, index=True)
    category_type = Column(String(20), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    owner_role = Column(String(20), default="admin", index=True)
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    parent = relationship("LedgerCategory", remote_side=[id], backref="children", uselist=False)


class LedgerTransaction(Base):
    __tablename__ = "ledger_transactions"

    id = Column(Integer, primary_key=True, index=True)
    occurred_at = Column(DateTime, nullable=False, index=True)
    posted_date = Column(Date, nullable=True, index=True)
    account_id = Column(Integer, ForeignKey("ledger_accounts.id"), nullable=False, index=True)
    counterparty_account_id = Column(Integer, ForeignKey("ledger_accounts.id"), nullable=True, index=True)
    category_id = Column(Integer, ForeignKey("ledger_categories.id"), nullable=True, index=True)
    direction = Column(String(20), nullable=False, index=True)
    transaction_type = Column(String(30), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="CNY")
    merchant = Column(String(200), nullable=True, index=True)
    description = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    external_ref = Column(String(120), nullable=True, index=True)
    source = Column(String(30), nullable=False, default="manual")
    linked_transaction_id = Column(Integer, ForeignKey("ledger_transactions.id"), nullable=True, index=True)
    recurring_rule_id = Column(Integer, ForeignKey("ledger_recurring_rules.id"), nullable=True, index=True)
    is_cleared = Column(Boolean, nullable=False, default=False)
    owner_role = Column(String(20), default="admin", index=True)
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    account = relationship("LedgerAccount", foreign_keys=[account_id], back_populates="transactions")
    counterparty_account = relationship("LedgerAccount", foreign_keys=[counterparty_account_id])
    category = relationship("LedgerCategory")
    linked_transaction = relationship("LedgerTransaction", remote_side=[id], uselist=False)
    recurring_rule = relationship("LedgerRecurringRule", back_populates="transactions", foreign_keys=[recurring_rule_id])


class LedgerImportTemplate(Base):
    __tablename__ = "ledger_import_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, index=True)
    delimiter = Column(String(10), nullable=False, default=",")
    encoding = Column(String(20), nullable=False, default="utf-8")
    mapping_json = Column(Text, nullable=False, default="{}")
    owner_role = Column(String(20), default="admin", index=True)
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LedgerRule(Base):
    __tablename__ = "ledger_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    priority = Column(Integer, nullable=False, default=100, index=True)
    match_json = Column(Text, nullable=False, default="{}")
    action_json = Column(Text, nullable=False, default="{}")
    owner_role = Column(String(20), default="admin", index=True)
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LedgerRecurringRule(Base):
    __tablename__ = "ledger_recurring_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    rule_type = Column(String(30), nullable=False, index=True)
    frequency = Column(String(20), nullable=False, index=True)
    interval_count = Column(Integer, nullable=False, default=1)
    day_of_month = Column(Integer, nullable=True)
    weekday = Column(Integer, nullable=True)
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=True, index=True)
    expected_amount = Column(Float, nullable=True)
    amount_tolerance = Column(Float, nullable=True)
    currency = Column(String(10), nullable=False, default="CNY")
    account_id = Column(Integer, ForeignKey("ledger_accounts.id"), nullable=False, index=True)
    counterparty_account_id = Column(Integer, ForeignKey("ledger_accounts.id"), nullable=True, index=True)
    category_id = Column(Integer, ForeignKey("ledger_categories.id"), nullable=True, index=True)
    transaction_type = Column(String(30), nullable=False, index=True)
    direction = Column(String(20), nullable=False, index=True)
    merchant = Column(String(200), nullable=True, index=True)
    description = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    source_hint = Column(String(30), nullable=True)
    last_matched_transaction_id = Column(Integer, ForeignKey("ledger_transactions.id"), nullable=True, index=True)
    last_matched_at = Column(DateTime, nullable=True, index=True)
    next_due_date = Column(Date, nullable=True, index=True)
    owner_role = Column(String(20), default="admin", index=True)
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    account = relationship("LedgerAccount", foreign_keys=[account_id])
    counterparty_account = relationship("LedgerAccount", foreign_keys=[counterparty_account_id])
    category = relationship("LedgerCategory")
    last_matched_transaction = relationship("LedgerTransaction", foreign_keys=[last_matched_transaction_id])
    transactions = relationship("LedgerTransaction", back_populates="recurring_rule", foreign_keys=[LedgerTransaction.recurring_rule_id])
