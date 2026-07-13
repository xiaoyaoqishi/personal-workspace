from datetime import datetime
from typing import List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


class TradingResearchFolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None
    sort_order: int = 0


class TradingResearchFolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None


class TradingResearchFolderResponse(TradingResearchFolderCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    document_count: int = 0


class TradingResearchDocumentCreate(BaseModel):
    folder_id: int
    title: str
    content: str = ""
    tags: Optional[Union[List[str], str]] = None
    is_pinned: bool = False


class TradingResearchDocumentUpdate(BaseModel):
    folder_id: Optional[int] = None
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[Union[List[str], str]] = None
    is_pinned: Optional[bool] = None


class TradingResearchDocumentResponse(TradingResearchDocumentCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    tags: List[str] = []
    tags_text: Optional[str] = None
    word_count: int = 0


class TradingResearchLinkResponse(BaseModel):
    id: int
    source_document_id: int
    target_document_id: Optional[int] = None
    target_name: str
    target_heading: Optional[str] = None


class TradingResearchBacklinkResponse(BaseModel):
    document_id: int
    title: str
    target_heading: Optional[str] = None


class TradingResearchDocumentListResponse(BaseModel):
    items: List[TradingResearchDocumentResponse] = []
    total: int = Field(ge=0)
