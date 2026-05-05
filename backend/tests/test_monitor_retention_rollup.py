from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import core.db as core_db
from core.db import Base
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
    db.query(MonitorServerSampleRollup).delete(synchronize_session=False)
    db.query(MonitorServerSample).delete(synchronize_session=False)
    db.query(MonitorSiteResult).delete(synchronize_session=False)
    db.query(MonitorSite).delete(synchronize_session=False)
    db.commit()


def test_monitor_cleanup_retention_window(monitor_db):
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
                    bucket_start=now - timedelta(days=366),
                    avg_cpu=10,
                    max_cpu=10,
                    avg_mem=20,
                    max_mem=20,
                    sample_count=1,
                ),
                MonitorServerSampleRollup(
                    granularity="day",
                    bucket_start=now - timedelta(days=3),
                    avg_cpu=30,
                    max_cpu=30,
                    avg_mem=40,
                    max_mem=40,
                    sample_count=1,
                ),
            ]
        )
        db.commit()
    finally:
        db.close()

    result = monitor_runtime._cleanup_monitor_data(now=now)
    assert result["deleted_samples"] >= 1
    assert result["deleted_site_results"] >= 1
    assert result["deleted_rollups"] >= 1

    db = monitor_db()
    try:
        assert db.query(MonitorServerSample).filter(MonitorServerSample.sampled_at < now - timedelta(days=30)).count() == 0
        assert db.query(MonitorServerSample).filter(MonitorServerSample.sampled_at >= now - timedelta(days=30)).count() >= 1
        assert db.query(MonitorSiteResult).filter(MonitorSiteResult.created_at < now - timedelta(days=90)).count() == 0
        assert db.query(MonitorSiteResult).filter(MonitorSiteResult.created_at >= now - timedelta(days=90)).count() >= 1
        assert (
            db.query(MonitorServerSampleRollup)
            .filter(MonitorServerSampleRollup.bucket_start < now - timedelta(days=365))
            .count()
            == 0
        )
        migrated_rollup = next(
            (
                row
                for row in db.query(MonitorServerSampleRollup)
                .filter(MonitorServerSampleRollup.granularity == "day")
                .all()
                if row.bucket_start and row.bucket_start.strftime("%Y-%m-%d") == "2026-03-31"
            ),
            None,
        )
        assert migrated_rollup is not None
        assert round(migrated_rollup.avg_cpu, 1) == 10.0
    finally:
        db.close()


def test_monitor_rollup_hour_and_day_aggregation(monitor_db):
    now = datetime(2026, 5, 2, 0, 0, 0)
    db = monitor_db()
    try:
        _clear_monitor_tables(db)
        db.add_all(
            [
                MonitorServerSample(sampled_at=datetime(2026, 5, 1, 10, 5, 0), cpu=10, mem=20),
                MonitorServerSample(sampled_at=datetime(2026, 5, 1, 10, 45, 0), cpu=30, mem=40),
                MonitorServerSample(sampled_at=datetime(2026, 5, 1, 11, 15, 0), cpu=50, mem=60),
            ]
        )
        db.commit()
        monitor_runtime._rollup_server_samples(db, now)
        db.commit()

        hour_row = (
            db.query(MonitorServerSampleRollup)
            .filter(MonitorServerSampleRollup.granularity == "hour")
            .order_by(MonitorServerSampleRollup.bucket_start.asc())
            .first()
        )
        day_row = (
            db.query(MonitorServerSampleRollup)
            .filter(
                MonitorServerSampleRollup.granularity == "day",
            )
            .order_by(MonitorServerSampleRollup.bucket_start.asc())
            .first()
        )
        assert hour_row is not None
        assert round(hour_row.avg_cpu, 1) == 20.0
        assert round(hour_row.max_cpu, 1) == 30.0
        assert hour_row.sample_count == 2
        assert day_row is not None
        assert round(day_row.avg_mem, 1) == 40.0
        assert round(day_row.max_mem, 1) == 60.0
        assert day_row.sample_count == 3
    finally:
        db.close()


def test_monitor_trend_prefers_rollup(monitor_db, monkeypatch):
    now = datetime(2026, 5, 3, 0, 0, 0)
    db = monitor_db()
    try:
        _clear_monitor_tables(db)
        db.add(
            MonitorServerSampleRollup(
                granularity="day",
                bucket_start=now - timedelta(days=1),
                avg_cpu=12.2,
                max_cpu=24.4,
                avg_mem=33.3,
                max_mem=44.4,
                sample_count=10,
            )
        )
        db.add(MonitorServerSample(sampled_at=now - timedelta(days=1), cpu=90.0, mem=90.0))
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(monitor_runtime, "_require_admin", lambda: None)
    db = monitor_db()
    try:
        rows = monitor_runtime.monitor_server_trend(
            granularity="day",
            date_from="2026-05-01",
            date_to="2026-05-03",
            db=db,
        )
    finally:
        db.close()

    assert len(rows) == 1
    assert rows[0]["ts"] == "2026-05-02"
    assert rows[0]["avg_cpu"] == 12.2
    assert rows[0]["max_cpu"] == 24.4
