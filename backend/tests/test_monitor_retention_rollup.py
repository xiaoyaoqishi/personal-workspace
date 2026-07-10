from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import core.db as core_db
from core.db import Base
from models import BrowseLog
from models.monitor import MonitorServerSample, MonitorServerSampleRollup, MonitorSite, MonitorSiteResult
from services import monitor_runtime


@pytest.fixture()
def monitor_db(tmp_path, monkeypatch):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'monitor.db'}", connect_args={"check_same_thread": False})
    test_session_local = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    monkeypatch.setattr(core_db, "engine", test_engine)
    monkeypatch.setattr(core_db, "SessionLocal", test_session_local)
    monkeypatch.setattr(monitor_runtime, "SessionLocal", test_session_local)
    Base.metadata.create_all(bind=test_engine)
    return test_session_local


def _clear_monitor_tables(db):
    db.query(BrowseLog).delete(synchronize_session=False)
    db.query(MonitorServerSampleRollup).delete(synchronize_session=False)
    db.query(MonitorServerSample).delete(synchronize_session=False)
    db.query(MonitorSiteResult).delete(synchronize_session=False)
    db.query(MonitorSite).delete(synchronize_session=False)
    db.commit()


def test_monitor_cleanup_removes_obsolete_server_monitoring_data(monitor_db):
    now = datetime(2026, 5, 1, 12, 0, 0)
    db = monitor_db()
    try:
        _clear_monitor_tables(db)
        site = MonitorSite(name="test", url="https://example.com", enabled=True, interval_sec=60, timeout_sec=8)
        db.add(site)
        db.flush()

        db.add_all(
            [
                MonitorServerSample(sampled_at=now - timedelta(days=31), cpu=10, mem=20),
                MonitorServerSample(sampled_at=now - timedelta(days=2), cpu=30, mem=40),
                MonitorSiteResult(site_id=site.id, created_at=now - timedelta(days=91), ok=True),
                MonitorSiteResult(site_id=site.id, created_at=now - timedelta(days=7), ok=True),
                MonitorServerSampleRollup(
                    granularity="day",
                    bucket_start=now - timedelta(days=3),
                    avg_cpu=10,
                    max_cpu=10,
                    avg_mem=20,
                    max_mem=20,
                    sample_count=1,
                ),
                BrowseLog(username="demo", role="user", event_type="page_view", path="/monitor/", module="monitor_home", detail="open monitor app"),
                BrowseLog(username="demo", role="user", event_type="action", path="/api/monitor/realtime", module="monitor_home", detail="legacy realtime"),
                BrowseLog(username="demo", role="user", event_type="page_view", path="/monitor/sites", module="monitor_site", detail="site panel"),
            ]
        )
        db.commit()
    finally:
        db.close()

    result = monitor_runtime._cleanup_monitor_data(now=now)
    assert result["deleted_samples"] >= 1
    assert result["deleted_site_results"] >= 1
    assert result["deleted_rollups"] >= 1
    assert result["deleted_monitor_home_logs"] >= 2

    db = monitor_db()
    try:
        assert db.query(MonitorServerSample).count() == 0
        assert db.query(MonitorSiteResult).filter(MonitorSiteResult.created_at < now - timedelta(days=90)).count() == 0
        assert db.query(MonitorSiteResult).filter(MonitorSiteResult.created_at >= now - timedelta(days=90)).count() >= 1
        assert db.query(MonitorServerSampleRollup).count() == 0
        assert db.query(BrowseLog).filter(BrowseLog.module == "monitor_home").count() == 0
        assert db.query(BrowseLog).filter(BrowseLog.module == "monitor_site").count() == 1
    finally:
        db.close()
