from sqlalchemy import Boolean, Column, Index, Integer, String, Text
from core.db import Base


class DisciplineAISetting(Base):
    __tablename__ = 'discipline_ai_settings'
    username = Column(String(100), primary_key=True)
    automatic = Column(Boolean, nullable=False, default=False)
    include_notes = Column(Boolean, nullable=False, default=False)
    focus = Column(String(20), nullable=False, default='balanced')
    detail = Column(String(20), nullable=False, default='concise')


class DisciplineAIReport(Base):
    __tablename__ = 'discipline_ai_reports'
    __table_args__ = (Index('ix_ai_report_period', 'username', 'period', 'start', 'created_at'),)
    id = Column(String(32), primary_key=True)
    username = Column(String(100), nullable=False, index=True)
    period = Column(String(10), nullable=False)
    start = Column(String(10), nullable=False)
    end = Column(String(10), nullable=False)
    status = Column(String(20), nullable=False)
    active_key = Column(String(100), nullable=True, unique=True)
    source_hash = Column(String(64), nullable=False)
    snapshot_json = Column(Text, nullable=False)
    options_json = Column(Text, nullable=False)
    content_json = Column(Text, nullable=True)
    usage_json = Column(Text, nullable=True)
    model = Column(String(80), nullable=False)
    created_at = Column(String(40), nullable=False)
    updated_at = Column(String(40), nullable=False)
    lease_until = Column(String(40), nullable=True)
    error_code = Column(String(40), nullable=True)
    error_message = Column(String(300), nullable=True)
    prompt_version = Column(String(20), nullable=False, default='review-v1')
    origin = Column(String(20), nullable=False, default='manual')
