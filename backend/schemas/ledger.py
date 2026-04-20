from datetime import date, datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator


class LedgerAccountType(str, Enum):
    cash = "cash"
    bank = "bank"
    credit_card = "credit_card"
    ewallet = "ewallet"
    investment = "investment"
    other = "other"


class LedgerCategoryType(str, Enum):
    income = "income"
    expense = "expense"
    both = "both"


class LedgerDirection(str, Enum):
    income = "income"
    expense = "expense"
    neutral = "neutral"


class LedgerTransactionType(str, Enum):
    income = "income"
    expense = "expense"
    transfer = "transfer"
    refund = "refund"
    repayment = "repayment"
    fee = "fee"
    interest = "interest"
    adjustment = "adjustment"


class LedgerAccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    account_type: LedgerAccountType
    currency: str = Field(default="CNY", min_length=1, max_length=10)
    initial_balance: float = 0
    is_active: bool = True
    notes: Optional[str] = None


class LedgerAccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    account_type: Optional[LedgerAccountType] = None
    currency: Optional[str] = Field(default=None, min_length=1, max_length=10)
    initial_balance: Optional[float] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class LedgerAccountItem(BaseModel):
    id: int
    name: str
    account_type: LedgerAccountType
    currency: str
    initial_balance: float
    current_balance: float
    is_active: bool
    notes: Optional[str] = None
    owner_role: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class LedgerCategoryCreate(BaseModel):
    parent_id: Optional[int] = Field(default=None, ge=1)
    name: str = Field(min_length=1, max_length=120)
    category_type: LedgerCategoryType
    sort_order: int = 0
    is_active: bool = True


class LedgerCategoryUpdate(BaseModel):
    parent_id: Optional[int] = Field(default=None, ge=1)
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    category_type: Optional[LedgerCategoryType] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class LedgerCategoryItem(BaseModel):
    id: int
    parent_id: Optional[int] = None
    name: str
    category_type: LedgerCategoryType
    sort_order: int
    is_active: bool
    owner_role: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class LedgerTransactionCreate(BaseModel):
    occurred_at: datetime
    posted_date: Optional[date] = None
    account_id: int = Field(ge=1)
    counterparty_account_id: Optional[int] = Field(default=None, ge=1)
    category_id: Optional[int] = Field(default=None, ge=1)
    direction: LedgerDirection
    transaction_type: LedgerTransactionType
    amount: float = Field(gt=0)
    currency: str = Field(default="CNY", min_length=1, max_length=10)
    merchant: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    note: Optional[str] = None
    external_ref: Optional[str] = Field(default=None, max_length=120)
    source: str = Field(default="manual", min_length=1, max_length=30)
    linked_transaction_id: Optional[int] = Field(default=None, ge=1)
    is_cleared: bool = False

    @model_validator(mode="after")
    def validate_type_direction(self):
        if self.transaction_type == LedgerTransactionType.transfer:
            if self.direction != LedgerDirection.neutral:
                raise ValueError("transfer direction must be neutral")
        if self.transaction_type == LedgerTransactionType.refund:
            if self.direction != LedgerDirection.income:
                raise ValueError("refund direction must be income")
        return self


class LedgerTransactionUpdate(BaseModel):
    occurred_at: Optional[datetime] = None
    posted_date: Optional[date] = None
    account_id: Optional[int] = Field(default=None, ge=1)
    counterparty_account_id: Optional[int] = Field(default=None, ge=1)
    category_id: Optional[int] = Field(default=None, ge=1)
    direction: Optional[LedgerDirection] = None
    transaction_type: Optional[LedgerTransactionType] = None
    amount: Optional[float] = Field(default=None, gt=0)
    currency: Optional[str] = Field(default=None, min_length=1, max_length=10)
    merchant: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    note: Optional[str] = None
    external_ref: Optional[str] = Field(default=None, max_length=120)
    source: Optional[str] = Field(default=None, min_length=1, max_length=30)
    linked_transaction_id: Optional[int] = Field(default=None, ge=1)
    is_cleared: Optional[bool] = None


class LedgerTransactionItem(BaseModel):
    id: int
    occurred_at: datetime
    posted_date: Optional[date] = None
    account_id: int
    counterparty_account_id: Optional[int] = None
    category_id: Optional[int] = None
    direction: LedgerDirection
    transaction_type: LedgerTransactionType
    amount: float
    currency: str
    merchant: Optional[str] = None
    description: Optional[str] = None
    note: Optional[str] = None
    external_ref: Optional[str] = None
    source: str
    linked_transaction_id: Optional[int] = None
    recurring_rule_id: Optional[int] = None
    recurring_rule_name: Optional[str] = None
    is_cleared: bool
    owner_role: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class LedgerTransactionListQuery(BaseModel):
    account_id: Optional[int] = Field(default=None, ge=1)
    category_id: Optional[int] = Field(default=None, ge=1)
    transaction_type: Optional[LedgerTransactionType] = None
    direction: Optional[LedgerDirection] = None
    keyword: Optional[str] = None
    source: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must be <= date_to")
        return self


class LedgerImportPreviewRequest(BaseModel):
    delimiter: str = ","
    encoding: str = "utf-8"
    has_header: bool = True
    mapping: dict[str, str] = Field(default_factory=dict)
    default_account_id: Optional[int] = Field(default=None, ge=1)
    default_currency: str = Field(default="CNY", min_length=1, max_length=10)
    default_transaction_type: Optional[LedgerTransactionType] = None
    default_direction: Optional[LedgerDirection] = None
    apply_rules: bool = True
    preview_limit: int = Field(default=100, ge=1, le=1000)


class LedgerImportPreviewResponse(BaseModel):
    columns: list[str]
    preview_rows: list[dict[str, Any]]
    errors: list[str]
    stats: dict[str, int]


class LedgerImportCommitRequest(BaseModel):
    records: list[dict[str, Any]] = Field(default_factory=list)
    skip_duplicates: bool = True
    skip_invalid: bool = True
    apply_rules: bool = True
    template_id: Optional[int] = Field(default=None, ge=1)


class LedgerImportCommitResponse(BaseModel):
    created_count: int
    skipped_duplicate_count: int
    skipped_invalid_count: int
    failed_count: int
    created_ids: list[int]
    error_rows: list[dict[str, Any]]
    rule_hit_rows: int
    per_rule_hit_summary: dict[str, int]


class LedgerImportTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    delimiter: str = ","
    encoding: str = "utf-8"
    mapping: dict[str, str] = Field(default_factory=dict)
    apply_rules: bool = True


class LedgerImportTemplateItem(BaseModel):
    id: int
    name: str
    delimiter: str
    encoding: str
    mapping: dict[str, str]
    apply_rules: bool = True
    owner_role: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class LedgerRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    is_active: bool = True
    priority: int = Field(default=100, ge=0, le=9999)
    match_json: dict[str, Any] = Field(default_factory=dict)
    action_json: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_rule(self):
        if not self.match_json:
            raise ValueError("match_json 至少包含一个条件")
        if not self.action_json:
            raise ValueError("action_json 至少包含一个动作")
        return self


class LedgerRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    is_active: Optional[bool] = None
    priority: Optional[int] = Field(default=None, ge=0, le=9999)
    match_json: Optional[dict[str, Any]] = None
    action_json: Optional[dict[str, Any]] = None


class LedgerRuleItem(BaseModel):
    id: int
    name: str
    is_active: bool
    priority: int
    match_json: dict[str, Any]
    action_json: dict[str, Any]
    owner_role: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class LedgerRuleListResponse(BaseModel):
    items: list[LedgerRuleItem]


class LedgerRuleApplyPreviewRequest(BaseModel):
    transaction: Optional[dict[str, Any]] = None
    transaction_ids: list[int] = Field(default_factory=list)
    account_id: Optional[int] = Field(default=None, ge=1)
    category_id: Optional[int] = Field(default=None, ge=1)
    source: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    limit: int = Field(default=20, ge=1, le=200)


class LedgerRuleApplyPreviewResponse(BaseModel):
    items: list[dict[str, Any]]


class LedgerRuleBulkApplyRequest(BaseModel):
    transaction_ids: list[int] = Field(default_factory=list)
    account_id: Optional[int] = Field(default=None, ge=1)
    category_id: Optional[int] = Field(default=None, ge=1)
    source: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class LedgerRuleBulkApplyResponse(BaseModel):
    scanned_count: int
    updated_count: int
    skipped_count: int
    error_count: int
    per_rule_hit_summary: dict[str, int]


class LedgerDashboardResponse(BaseModel):
    income_total: float
    expense_total: float
    fee_total: float
    repayment_total: float
    net_cashflow: float
    transaction_count: int
    accounts_summary: list[LedgerAccountItem]
    top_expense_categories: list[dict]
    recent_transactions: list[LedgerTransactionItem]
    recurring_summary: Optional[dict[str, int]] = None
    recurring_next_due_items: Optional[list[dict[str, Any]]] = None


class LedgerRecurringRuleType(str, Enum):
    expense = "expense"
    income = "income"
    transfer = "transfer"
    repayment = "repayment"
    subscription = "subscription"


class LedgerRecurringFrequency(str, Enum):
    monthly = "monthly"
    weekly = "weekly"
    yearly = "yearly"


class LedgerRecurringRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    is_active: bool = True
    rule_type: LedgerRecurringRuleType
    frequency: LedgerRecurringFrequency
    interval_count: int = Field(default=1, ge=1, le=36)
    day_of_month: Optional[int] = Field(default=None, ge=1, le=31)
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    start_date: date
    end_date: Optional[date] = None
    expected_amount: Optional[float] = Field(default=None, gt=0)
    amount_tolerance: Optional[float] = Field(default=None, ge=0)
    currency: str = Field(default="CNY", min_length=1, max_length=10)
    account_id: int = Field(ge=1)
    counterparty_account_id: Optional[int] = Field(default=None, ge=1)
    category_id: Optional[int] = Field(default=None, ge=1)
    transaction_type: LedgerTransactionType
    direction: LedgerDirection
    merchant: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    note: Optional[str] = None
    source_hint: Optional[str] = Field(default=None, max_length=30)

    @model_validator(mode="after")
    def validate_recurring_rule(self):
        if self.frequency == LedgerRecurringFrequency.monthly and self.day_of_month is None:
            raise ValueError("monthly 必须提供 day_of_month")
        if self.frequency == LedgerRecurringFrequency.weekly and self.weekday is None:
            raise ValueError("weekly 必须提供 weekday")
        if self.frequency == LedgerRecurringFrequency.yearly and self.day_of_month is None:
            raise ValueError("yearly 必须提供 day_of_month")
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date 必须大于等于 start_date")
        if self.transaction_type == LedgerTransactionType.transfer and self.direction != LedgerDirection.neutral:
            raise ValueError("transfer direction must be neutral")
        if self.transaction_type == LedgerTransactionType.refund and self.direction != LedgerDirection.income:
            raise ValueError("refund direction must be income")
        return self


class LedgerRecurringRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    is_active: Optional[bool] = None
    rule_type: Optional[LedgerRecurringRuleType] = None
    frequency: Optional[LedgerRecurringFrequency] = None
    interval_count: Optional[int] = Field(default=None, ge=1, le=36)
    day_of_month: Optional[int] = Field(default=None, ge=1, le=31)
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    expected_amount: Optional[float] = Field(default=None, gt=0)
    amount_tolerance: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=1, max_length=10)
    account_id: Optional[int] = Field(default=None, ge=1)
    counterparty_account_id: Optional[int] = Field(default=None, ge=1)
    category_id: Optional[int] = Field(default=None, ge=1)
    transaction_type: Optional[LedgerTransactionType] = None
    direction: Optional[LedgerDirection] = None
    merchant: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    note: Optional[str] = None
    source_hint: Optional[str] = Field(default=None, max_length=30)


class LedgerRecurringRuleItem(BaseModel):
    id: int
    name: str
    is_active: bool
    rule_type: LedgerRecurringRuleType
    frequency: LedgerRecurringFrequency
    interval_count: int
    day_of_month: Optional[int] = None
    weekday: Optional[int] = None
    start_date: date
    end_date: Optional[date] = None
    expected_amount: Optional[float] = None
    amount_tolerance: Optional[float] = None
    currency: str
    account_id: int
    account_name: Optional[str] = None
    counterparty_account_id: Optional[int] = None
    counterparty_account_name: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    transaction_type: LedgerTransactionType
    direction: LedgerDirection
    merchant: Optional[str] = None
    description: Optional[str] = None
    note: Optional[str] = None
    source_hint: Optional[str] = None
    last_matched_transaction_id: Optional[int] = None
    last_matched_at: Optional[datetime] = None
    next_due_date: Optional[date] = None
    owner_role: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class LedgerRecurringReminderItem(BaseModel):
    reminder_type: str
    rule_id: int
    rule_name: str
    frequency: LedgerRecurringFrequency
    due_date: date
    account_id: int
    account_name: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    expected_amount: Optional[float] = None
    actual_amount: Optional[float] = None
    amount_deviation: Optional[float] = None
    currency: str
    merchant: Optional[str] = None
    last_matched_transaction_id: Optional[int] = None
    last_matched_at: Optional[datetime] = None


class LedgerRecurringDetectRequest(BaseModel):
    lookback_days: int = Field(default=180, ge=30, le=730)
    min_occurrences: int = Field(default=3, ge=2, le=20)
    account_id: Optional[int] = Field(default=None, ge=1)
    direction: Optional[LedgerDirection] = None
    transaction_type: Optional[LedgerTransactionType] = None


class LedgerRecurringDetectItem(BaseModel):
    merchant: str
    amount: float
    account_id: int
    transaction_type: LedgerTransactionType
    direction: LedgerDirection
    estimated_frequency: LedgerRecurringFrequency
    occurrences: int
    last_seen_at: datetime
    suggested_day_of_month: Optional[int] = None
    suggested_weekday: Optional[int] = None
    suggested_category_id: Optional[int] = None


class LedgerRecurringDetectResponse(BaseModel):
    candidates: list[LedgerRecurringDetectItem]


class LedgerRecurringApplyDraftRequest(BaseModel):
    occurred_at: Optional[datetime] = None


class LedgerRecurringApplyDraftResponse(BaseModel):
    occurred_at: datetime
    account_id: int
    counterparty_account_id: Optional[int] = None
    category_id: Optional[int] = None
    transaction_type: LedgerTransactionType
    direction: LedgerDirection
    amount: Optional[float] = None
    currency: str
    merchant: Optional[str] = None
    description: Optional[str] = None
    note: Optional[str] = None
    source: str
