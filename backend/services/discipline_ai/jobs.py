from datetime import datetime, timedelta, timezone
import json
import logging
import threading
from fastapi import HTTPException
from sqlalchemy import update
from core import context, db as database
from core.config import settings
from models.discipline_ai import DisciplineAIReport, DisciplineAISetting
from models.discipline_screen import ScreenImport
from schemas.discipline_ai import AIGenerate
from services.discipline_ai import provider, service

log = logging.getLogger(__name__)


def run_report(key):
    with database.SessionLocal() as db:
        stamp = service.now()
        changed = db.execute(update(DisciplineAIReport).where(DisciplineAIReport.id == key, DisciplineAIReport.status == 'queued')
            .values(status='running', updated_at=stamp, lease_until=(datetime.now(timezone.utc)+timedelta(minutes=4)).isoformat())).rowcount
        db.commit()
        if not changed: return
        row = db.get(DisciplineAIReport, key)
        owner, source, options = row.username, json.loads(row.snapshot_json), json.loads(row.options_json)
        model = row.model
    token = context.current_username.set(owner)
    try:
        with database.SessionLocal() as db:
            service.can_generate(db)
        # A configuration change while queued must not silently call a different model.
        if provider.configuration()['model'] != model:
            raise provider.ProviderError('configuration_changed', '模型配置已变化，请重新生成')
        content, usage = provider.generate(source, options)
        with database.SessionLocal() as db:
            service.can_generate(db)
            row = db.get(DisciplineAIReport, key)
            row.content_json = json.dumps(content, ensure_ascii=False)
            row.usage_json = json.dumps(usage)
            row.status, row.active_key, row.updated_at, row.lease_until = 'success', None, service.now(), None
            db.commit()
    except Exception as error:
        code = error.code if isinstance(error, provider.ProviderError) else 'permission' if isinstance(error, HTTPException) else 'generation'
        message = str(error) if isinstance(error, provider.ProviderError) else '本次报告未能生成，请稍后重试；已有报告已保留'
        with database.SessionLocal() as db:
            row = db.get(DisciplineAIReport, key)
            row.status, row.active_key = 'failed', None
            row.error_code, row.error_message, row.updated_at, row.lease_until = code, message, service.now(), None
            db.commit()
        log.warning('discipline AI generation failed: %s', code)
    finally:
        context.current_username.reset(token)


def expire_jobs(db):
    db.query(DisciplineAIReport).filter(DisciplineAIReport.status == 'running',
        DisciplineAIReport.lease_until < service.now()).update({'status': 'failed', 'active_key': None,
            'updated_at': service.now(), 'error_code': 'interrupted', 'error_message': '生成任务已中断，请重新生成'}, synchronize_session=False)
    db.commit()


def automatic_tick():
    if not provider.configuration()['api_key']: return
    local = datetime.now(settings.timezone)
    if local.hour < 8: return
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    quiet = (datetime.now(timezone.utc)-timedelta(seconds=90)).isoformat()
    with database.SessionLocal() as db:
        users = [(row.username, row.focus, row.detail) for row in db.query(DisciplineAISetting).filter_by(automatic=True).all()]
    for owner, focus, detail in users:
        token = context.current_username.set(owner)
        try:
            with database.SessionLocal() as db:
                latest = db.query(ScreenImport).filter_by(username=owner).order_by(ScreenImport.id.desc()).first()
                if not latest or latest.imported_at < midnight or latest.imported_at > quiet: continue
                periods = [('day', local.date()-timedelta(days=1))]
                if local.weekday() == 0: periods.append(('week', local.date()-timedelta(days=1)))
                for period, anchor in periods:
                    already = db.query(DisciplineAIReport).filter_by(username=owner, period=period, origin='automatic').filter(
                        DisciplineAIReport.created_at >= midnight).first()
                    if already: continue
                    try:
                        service.create_report(db, AIGenerate(period=period, anchor=anchor, focus=focus, detail=detail), origin='automatic')
                    except HTTPException:
                        db.rollback()
        finally:
            context.current_username.reset(token)


def start():
    stop, wake = threading.Event(), threading.Event()
    def loop():
        ticks = 0
        while not stop.is_set():
            try:
                with database.SessionLocal() as db:
                    expire_jobs(db)
                    keys = [row.id for row in db.query(DisciplineAIReport).filter_by(status='queued').order_by(DisciplineAIReport.created_at).limit(5).all()]
                for key in keys:
                    if stop.is_set(): break
                    run_report(key)
                if ticks % 12 == 0: automatic_tick()
            except Exception:
                log.warning('discipline AI worker cycle failed')
            ticks += 1
            wake.wait(5); wake.clear()
    thread = threading.Thread(target=loop, daemon=True, name='discipline-ai')
    thread.start()
    return stop, wake, thread
