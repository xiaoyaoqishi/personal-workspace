from datetime import date, datetime
from typing import List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

from trade_review_taxonomy import EdgeSource, FailureType, OpportunityStructure, ReviewConclusion


class TradeCreate(BaseModel):
    trade_date: Optional[date] = None
    instrument_type: str
    symbol: str
    contract: Optional[str] = None
    category: Optional[str] = None
    direction: str
    open_time: datetime
    close_time: Optional[datetime] = None
    open_price: float
    close_price: Optional[float] = None
    stop_loss_point: float
    target_point: float
    capital_percentage: float = Field(ge=0, le=100)
    commission: Optional[float] = 0
    leverage: Optional[float] = None
    pnl: Optional[float] = None
    status: Optional[str] = "open"

    entry_logic: Optional[str] = None
    exit_logic: Optional[str] = None
    strategy_type: Optional[str] = None
    core_signal: Optional[str] = None

    @model_validator(mode="after")
    def derive_trade_date_from_open_time(self):
        self.trade_date = self.open_time.date()
        return self


class TradeUpdate(BaseModel):
    trade_date: Optional[date] = None
    instrument_type: Optional[str] = None
    symbol: Optional[str] = None
    contract: Optional[str] = None
    category: Optional[str] = None
    direction: Optional[str] = None
    open_time: Optional[datetime] = None
    close_time: Optional[datetime] = None
    open_price: Optional[float] = None
    close_price: Optional[float] = None
    stop_loss_point: Optional[float] = None
    target_point: Optional[float] = None
    capital_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    commission: Optional[float] = None
    leverage: Optional[float] = None
    pnl: Optional[float] = None
    status: Optional[str] = None

    entry_logic: Optional[str] = None
    exit_logic: Optional[str] = None
    strategy_type: Optional[str] = None
    core_signal: Optional[str] = None


class TradeResponse(TradeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    source_broker_name: Optional[str] = None
    source_label: Optional[str] = None
    source_display: Optional[str] = None
    source_is_metadata: Optional[bool] = None
    has_trade_review: Optional[bool] = None


class TradePasteImportRequest(BaseModel):
    raw_text: str
    broker: Optional[str] = None


class TradeRiskPointHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trade_id: int
    stop_loss_point: Optional[float] = None
    target_point: Optional[float] = None
    capital_percentage: Optional[float] = None
    recorded_at: datetime

    @field_serializer("recorded_at")
    def serialize_recorded_at_as_china_time(self, value: datetime) -> str:
        from datetime import timezone
        from zoneinfo import ZoneInfo

        source = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
        return source.astimezone(ZoneInfo("Asia/Shanghai")).isoformat()


class TradePasteImportError(BaseModel):
    row: int
    reason: str
    raw: Optional[str] = None


class TradePasteImportResponse(BaseModel):
    inserted: int
    skipped: int
    errors: List[TradePasteImportError] = []


class TradePositionResponse(BaseModel):
    symbol: str
    contract: Optional[str] = None
    side: str
    avg_open_price: float
    open_since: Optional[date] = None
    commission: Optional[float] = None
    leverage: Optional[float] = None


class TradeSearchOptionItemResponse(BaseModel):
    trade_id: int
    trade_date: Optional[date] = None
    symbol: Optional[str] = None
    contract: Optional[str] = None
    direction: Optional[str] = None
    open_price: Optional[float] = None
    close_price: Optional[float] = None
    status: Optional[str] = None
    pnl: Optional[float] = None
    source_display: Optional[str] = None
    has_trade_review: Optional[bool] = None
    review_conclusion: Optional[str] = None


class TradeSearchOptionsResponse(BaseModel):
    items: List[TradeSearchOptionItemResponse] = []


class TradeReviewUpsert(BaseModel):
    opportunity_structure: Optional[OpportunityStructure] = None
    edge_source: Optional[EdgeSource] = None
    failure_type: Optional[FailureType] = None
    review_conclusion: Optional[ReviewConclusion] = None

    entry_thesis: Optional[str] = None
    invalidation_valid_evidence: Optional[str] = None
    invalidation_trigger_evidence: Optional[str] = None
    invalidation_boundary: Optional[str] = None
    management_actions: Optional[str] = None
    exit_reason: Optional[str] = None
    tags: Optional[Union[List[str], str]] = None
    review_tags: Optional[str] = None
    research_notes: Optional[str] = None


class TradeReviewResponse(TradeReviewUpsert):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trade_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    tags: List[str] = []
    review_tags: Optional[str] = None


class TradeReviewTaxonomyResponse(BaseModel):
    opportunity_structure: List[str]
    edge_source: List[str]
    failure_type: List[str]
    review_conclusion: List[str]


class TradeSourceMetadataUpsert(BaseModel):
    broker_name: Optional[str] = None
    source_label: Optional[str] = None
    import_channel: Optional[str] = None
    parser_version: Optional[str] = None


class TradeSourceMetadataResponse(TradeSourceMetadataUpsert):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    trade_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    exists_in_db: bool = False


class TradeBrokerCreate(BaseModel):
    name: str
    account: Optional[str] = None
    password: Optional[str] = None
    extra_info: Optional[str] = None
    notes: Optional[str] = None


class TradeBrokerUpdate(BaseModel):
    name: Optional[str] = None
    account: Optional[str] = None
    password: Optional[str] = None
    extra_info: Optional[str] = None
    notes: Optional[str] = None


class TradeBrokerResponse(TradeBrokerCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class TradeSummaryResponse(BaseModel):
    trade_id: int
    trade_date: Optional[date] = None
    instrument_type: Optional[str] = None
    symbol: Optional[str] = None
    contract: Optional[str] = None
    direction: Optional[str] = None
    open_price: Optional[float] = None
    close_price: Optional[float] = None
    status: Optional[str] = None
    pnl: Optional[float] = None
    source_display: Optional[str] = None
    has_trade_review: Optional[bool] = None
    review_conclusion: Optional[str] = None
