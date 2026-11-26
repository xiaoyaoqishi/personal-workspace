from sqlalchemy import BigInteger, Boolean, Column, Index, Integer, String, UniqueConstraint
from core.db import Base


class ScreenDevice(Base):
    __tablename__ = 'discipline_screen_devices'
    __table_args__ = (UniqueConstraint('username', 'device_key'),)
    id = Column(Integer, primary_key=True)
    username = Column(String(100), nullable=False, index=True)
    device_key = Column(String(120), nullable=False)
    name = Column(String(80), nullable=False)
    kind = Column(String(20), nullable=False)
    imported_at = Column(String(40), nullable=False)


class ScreenEvent(Base):
    __tablename__ = 'discipline_screen_events'
    __table_args__ = (UniqueConstraint('username', 'fingerprint'),
                      Index('ix_screen_event_device_time', 'username', 'device_key', 'time_us'))
    id = Column(Integer, primary_key=True)
    username = Column(String(100), nullable=False)
    fingerprint = Column(String(64), nullable=False)
    device_key = Column(String(120), nullable=False)
    time_us = Column(BigInteger, nullable=False)
    app = Column(String(250), nullable=False)
    starting = Column(Boolean, nullable=False)


class ScreenSession(Base):
    __tablename__ = 'discipline_screen_sessions'
    __table_args__ = (Index('ix_screen_session_range', 'username', 'device_key', 'start_us', 'end_us'),)
    id = Column(Integer, primary_key=True)
    username = Column(String(100), nullable=False, index=True)
    device_key = Column(String(120), nullable=False)
    app = Column(String(250), nullable=False)
    start_us = Column(BigInteger, nullable=False)
    end_us = Column(BigInteger, nullable=True)
    status = Column(String(20), nullable=False)


class ScreenImport(Base):
    __tablename__ = 'discipline_screen_imports'
    id = Column(Integer, primary_key=True)
    username = Column(String(100), nullable=False, index=True)
    imported_at = Column(String(40), nullable=False)
    received = Column(Integer, nullable=False)
    added = Column(Integer, nullable=False)


class ScreenAppPreference(Base):
    __tablename__ = 'discipline_screen_app_preferences'
    __table_args__ = (UniqueConstraint('username', 'app'),)
    id = Column(Integer, primary_key=True)
    username = Column(String(100), nullable=False, index=True)
    app = Column(String(250), nullable=False)
    name = Column(String(80), nullable=False)
    category = Column(String(20), nullable=False)


class ScreenCollector(Base):
    __tablename__ = 'discipline_screen_collectors'
    id = Column(String(32), primary_key=True)
    username = Column(String(100), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    token_hash = Column(String(64), nullable=False)
    created_at = Column(String(40), nullable=False)
    revoked_at = Column(String(40), nullable=True)
    last_upload_at = Column(String(40), nullable=True)
    events_added = Column(Integer, nullable=False, default=0)
