from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.db import Base


class TradingResearchFolder(Base):
    __tablename__ = "trading_research_folders"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    name = Column(String(100), nullable=False)
    parent_id = Column(Integer, ForeignKey("trading_research_folders.id"), nullable=True, index=True)
    sort_order = Column(Integer, default=0)
    owner_role = Column(String(20), default="admin", index=True)
    legacy_notebook_id = Column(Integer, nullable=True, unique=True, index=True)

    documents = relationship("TradingResearchDocument", back_populates="folder", cascade="all, delete-orphan")


class TradingResearchDocument(Base):
    __tablename__ = "trading_research_documents"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    folder_id = Column(Integer, ForeignKey("trading_research_folders.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, default="")
    tags_text = Column("tags", Text)
    is_pinned = Column(Boolean, default=False, index=True)
    word_count = Column(Integer, default=0)
    owner_role = Column(String(20), default="admin", index=True)
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    legacy_note_id = Column(Integer, nullable=True, unique=True, index=True)

    folder = relationship("TradingResearchFolder", back_populates="documents")


class TradingResearchLink(Base):
    __tablename__ = "trading_research_links"
    __table_args__ = (
        UniqueConstraint("source_document_id", "target_name", "target_heading", name="uq_trading_research_link"),
    )

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    source_document_id = Column(Integer, ForeignKey("trading_research_documents.id"), nullable=False, index=True)
    target_document_id = Column(Integer, ForeignKey("trading_research_documents.id"), nullable=True, index=True)
    target_name = Column(String(200), nullable=False)
    target_heading = Column(String(200), nullable=True)
