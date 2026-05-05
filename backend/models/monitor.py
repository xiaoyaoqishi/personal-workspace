from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.db import Base


class MonitorSite(Base):
    __tablename__ = "monitor_sites"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    name = Column(String(150), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    interval_sec = Column(Integer, default=60, nullable=False)
    timeout_sec = Column(Integer, default=8, nullable=False)
    last_checked_at = Column(DateTime, nullable=True)
    last_status_code = Column(Integer, nullable=True)
    last_response_ms = Column(Integer, nullable=True)
    last_ok = Column(Boolean, nullable=True)
    last_error = Column(Text, nullable=True)


class MonitorSiteResult(Base):
    __tablename__ = "monitor_site_results"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    site_id = Column(Integer, ForeignKey("monitor_sites.id"), nullable=False, index=True)
    status_code = Column(Integer, nullable=True)
    response_ms = Column(Integer, nullable=True)
    ok = Column(Boolean, nullable=False, default=False, index=True)
    error = Column(Text, nullable=True)

    site = relationship("MonitorSite")


class MonitorServerSample(Base):
    __tablename__ = "monitor_server_samples"

    id = Column(Integer, primary_key=True, index=True)
    sampled_at = Column(DateTime, index=True)
    cpu = Column(Float, nullable=True)
    mem = Column(Float, nullable=True)
    net_up = Column(Float, nullable=True)  # KB/s
    net_down = Column(Float, nullable=True)  # KB/s
    disk_read = Column(Float, nullable=True)  # MB/s
    disk_write = Column(Float, nullable=True)  # MB/s


class MonitorServerSampleRollup(Base):
    __tablename__ = "monitor_server_sample_rollups"
    __table_args__ = (UniqueConstraint("granularity", "bucket_start", name="uq_monitor_rollup_bucket"),)

    id = Column(Integer, primary_key=True, index=True)
    granularity = Column(String(10), nullable=False, index=True)  # hour/day
    bucket_start = Column(DateTime, nullable=False, index=True)
    avg_cpu = Column(Float, nullable=True)
    max_cpu = Column(Float, nullable=True)
    avg_mem = Column(Float, nullable=True)
    max_mem = Column(Float, nullable=True)
    sample_count = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
