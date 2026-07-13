from datetime import date, datetime
from typing import List, Optional, Union

from pydantic import BaseModel, ConfigDict

from schemas.trading import TradeSummaryResponse


class TradePlanTradeLinkUpsert(BaseModel):
    trade_id: int
    note: Optional[str] = None
    sort_order: Optional[int] = 0


class TradePlanCreate(BaseModel):
    title: str
    plan_date: date
    status: Optional[str] = "draft"
    symbol: Optional[str] = None
    contract: Optional[str] = None
    direction_bias: Optional[str] = None
    setup_type: Optional[str] = None
    market_regime: Optional[str] = None
    entry_zone: Optional[str] = None
    stop_loss_plan: Optional[str] = None
    target_plan: Optional[str] = None
    invalid_condition: Optional[str] = None
    thesis: Optional[str] = None
    risk_notes: Optional[str] = None
    execution_checklist: Optional[str] = None
    priority: Optional[str] = "medium"
    tags: Optional[Union[List[str], str]] = None
    source_ref: Optional[str] = None
    post_result_summary: Optional[str] = None
    research_notes: Optional[str] = None
    trade_links: List[TradePlanTradeLinkUpsert] = []


class TradePlanUpdate(BaseModel):
    title: Optional[str] = None
    plan_date: Optional[date] = None
    status: Optional[str] = None
    symbol: Optional[str] = None
    contract: Optional[str] = None
    direction_bias: Optional[str] = None
    setup_type: Optional[str] = None
    market_regime: Optional[str] = None
    entry_zone: Optional[str] = None
    stop_loss_plan: Optional[str] = None
    target_plan: Optional[str] = None
    invalid_condition: Optional[str] = None
    thesis: Optional[str] = None
    risk_notes: Optional[str] = None
    execution_checklist: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[Union[List[str], str]] = None
    source_ref: Optional[str] = None
    post_result_summary: Optional[str] = None
    research_notes: Optional[str] = None


class TradePlanTradeLinkResponse(TradePlanTradeLinkUpsert):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trade_plan_id: int
    trade_summary: Optional[TradeSummaryResponse] = None
    created_at: Optional[datetime] = None


class TradePlanResponse(TradePlanCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    tags: List[str] = []
    tags_text: Optional[str] = None
    trade_links: List[TradePlanTradeLinkResponse] = []
    linked_trade_ids: List[int] = []


class TradePlanTradeLinksPayload(BaseModel):
    trade_links: List[TradePlanTradeLinkUpsert] = []
