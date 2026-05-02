from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

LedgerAssetStatus = Literal["draft", "in_use", "idle", "on_sale", "sold", "retired", "disposed", "lost"]
LedgerAssetEventType = Literal[
    "purchase",
    "start_use",
    "repair",
    "maintenance",
    "accessory",
    "usage",
    "idle",
    "resume",
    "on_sale",
    "sell",
    "retire",
    "dispose",
    "lost",
    "note",
]


def _parse_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
        except Exception:
            return [raw]
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    return []


def _parse_json_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except Exception:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


class LedgerAssetBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    asset_type: str = Field(min_length=1, max_length=40)
    category: Optional[str] = Field(default=None, max_length=80)
    status: LedgerAssetStatus = "draft"
    brand: Optional[str] = Field(default=None, max_length=100)
    model: Optional[str] = Field(default=None, max_length=100)
    serial_number: Optional[str] = Field(default=None, max_length=120)
    location: Optional[str] = Field(default=None, max_length=120)
    purchase_channel: Optional[str] = Field(default=None, max_length=120)
    purchase_date: Optional[date] = None
    start_use_date: Optional[date] = None
    end_date: Optional[date] = None
    purchase_price: Optional[float] = Field(default=None, ge=0)
    extra_cost: Optional[float] = Field(default=None, ge=0)
    sale_price: Optional[float] = Field(default=None, ge=0)
    target_daily_cost: Optional[float] = Field(default=None, ge=0)
    expected_use_days: Optional[int] = Field(default=None, ge=0)
    usage_count: int = Field(default=0, ge=0)
    warranty_until: Optional[date] = None
    include_in_net_worth: bool = True
    tags: list[str] = Field(default_factory=list)
    images: list[str] = Field(default_factory=list)
    note: Optional[str] = None

    @field_validator("tags", "images", mode="before")
    @classmethod
    def _validate_string_lists(cls, value: Any) -> list[str]:
        return _parse_string_list(value)


class LedgerAssetCreate(LedgerAssetBase):
    pass


class LedgerAssetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    asset_type: Optional[str] = Field(default=None, min_length=1, max_length=40)
    category: Optional[str] = Field(default=None, max_length=80)
    status: Optional[LedgerAssetStatus] = None
    brand: Optional[str] = Field(default=None, max_length=100)
    model: Optional[str] = Field(default=None, max_length=100)
    serial_number: Optional[str] = Field(default=None, max_length=120)
    location: Optional[str] = Field(default=None, max_length=120)
    purchase_channel: Optional[str] = Field(default=None, max_length=120)
    purchase_date: Optional[date] = None
    start_use_date: Optional[date] = None
    end_date: Optional[date] = None
    purchase_price: Optional[float] = Field(default=None, ge=0)
    extra_cost: Optional[float] = Field(default=None, ge=0)
    sale_price: Optional[float] = Field(default=None, ge=0)
    target_daily_cost: Optional[float] = Field(default=None, ge=0)
    expected_use_days: Optional[int] = Field(default=None, ge=0)
    usage_count: Optional[int] = Field(default=None, ge=0)
    warranty_until: Optional[date] = None
    include_in_net_worth: Optional[bool] = None
    tags: Optional[list[str]] = None
    images: Optional[list[str]] = None
    note: Optional[str] = None

    @field_validator("tags", "images", mode="before")
    @classmethod
    def _validate_optional_string_lists(cls, value: Any) -> Optional[list[str]]:
        if value is None:
            return None
        return _parse_string_list(value)


class LedgerAssetMetricsOut(BaseModel):
    holding_days: Optional[int] = None
    use_days: Optional[int] = None
    total_cost: Optional[float] = None
    realized_consumption_cost: Optional[float] = None
    cash_daily_cost: Optional[float] = None
    realized_daily_cost: Optional[float] = None
    profit_loss: Optional[float] = None
    target_progress: Optional[float] = None
    days_to_target: Optional[int] = None


class LedgerAssetOut(LedgerAssetBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    tags: list[str] = Field(default_factory=list, validation_alias=AliasChoices("tags", "tags_json"))
    images: list[str] = Field(default_factory=list, validation_alias=AliasChoices("images", "images_json"))
    owner_role: str
    is_deleted: bool
    deleted_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    metrics: Optional[LedgerAssetMetricsOut] = None


class LedgerAssetSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    name: str
    asset_type: str
    category: Optional[str] = None
    status: LedgerAssetStatus
    brand: Optional[str] = None
    model: Optional[str] = None
    location: Optional[str] = None
    purchase_channel: Optional[str] = None
    purchase_date: Optional[date] = None
    start_use_date: Optional[date] = None
    end_date: Optional[date] = None
    purchase_price: Optional[float] = None
    extra_cost: Optional[float] = None
    sale_price: Optional[float] = None
    target_daily_cost: Optional[float] = None
    usage_count: int = 0
    include_in_net_worth: bool
    tags: list[str] = Field(default_factory=list, validation_alias=AliasChoices("tags", "tags_json"))
    images: list[str] = Field(default_factory=list, validation_alias=AliasChoices("images", "images_json"))
    owner_role: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    metrics: Optional[LedgerAssetMetricsOut] = None

    @field_validator("tags", "images", mode="before")
    @classmethod
    def _validate_summary_string_lists(cls, value: Any) -> list[str]:
        return _parse_string_list(value)


class LedgerAssetEventCreate(BaseModel):
    event_type: LedgerAssetEventType
    event_date: date
    title: str = Field(min_length=1, max_length=200)
    amount: Optional[float] = Field(default=None, ge=0)
    note: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias=AliasChoices("metadata", "metadata_json"))

    @field_validator("metadata", mode="before")
    @classmethod
    def _validate_metadata_json(cls, value: Any) -> dict[str, Any]:
        return _parse_json_dict(value)


class LedgerAssetEventOut(LedgerAssetEventCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    asset_id: int
    owner_role: str
    created_at: Optional[datetime] = None


class LedgerAssetListResponse(BaseModel):
    items: list[LedgerAssetSummaryOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int


class LedgerAssetEventListResponse(BaseModel):
    items: list[LedgerAssetEventOut] = Field(default_factory=list)
    total: int


class LedgerAssetStatusBreakdownOut(BaseModel):
    status: str
    count: int


class LedgerAssetCategoryBreakdownOut(BaseModel):
    category: str
    count: int
    total_purchase_cost: float
    total_extra_cost: float
    total_cost: float


class LedgerAssetLibrarySummaryOut(BaseModel):
    total_assets: int
    active_assets: int
    idle_assets: int
    sold_assets: int
    total_purchase_cost: float
    total_extra_cost: float
    total_cost: float
    total_realized_profit_loss: float
    status_breakdown: list[LedgerAssetStatusBreakdownOut] = Field(default_factory=list)
    category_breakdown: list[LedgerAssetCategoryBreakdownOut] = Field(default_factory=list)
    top_daily_cost_assets: list[LedgerAssetSummaryOut] = Field(default_factory=list)
    top_idle_assets: list[LedgerAssetSummaryOut] = Field(default_factory=list)
    top_extra_cost_assets: list[LedgerAssetSummaryOut] = Field(default_factory=list)
