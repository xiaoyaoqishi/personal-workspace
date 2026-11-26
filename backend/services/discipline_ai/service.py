from datetime import datetime, timedelta, timezone
import json
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from core import context
from models.auth import User
from models.discipline_ai import DisciplineAIReport, DisciplineAISetting
from services.discipline_screen.collectors import check_user
from services.discipline_ai import provider, snapshot


def now():
    return datetime.now(timezone.utc).isoformat()


def can_generate(db):
    check_user(db.query(User).filter_by(username=context.username()).first())


def preferences(db):
    defaults = {'automatic': False, 'include_notes': False, 'focus': 'balanced', 'detail': 'concise'}
    row = db.query(DisciplineAISetting).filter_by(username=context.username()).first()
    return {key: getattr(row, key) if row else value for key, value in defaults.items()}


def settings_view(db):
    config = provider.configuration()
    return {**preferences(db), 'configured': bool(config['api_key']), 'model': config['model'], 'daily_limit': 20}


def save_settings(db, body):
    can_generate(db)
    row = db.query(DisciplineAISetting).filter_by(username=context.username()).first()
    if row is None:
        row = DisciplineAISetting(username=context.username())
        db.add(row)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return settings_view(db)


def public(row, full=True):
    result = {name: getattr(row, name) for name in ['id', 'period', 'start', 'end', 'status', 'created_at',
        'updated_at', 'model', 'prompt_version', 'error_code', 'error_message', 'origin']}
    result['options'] = json.loads(row.options_json)
    if full:
        result.update(snapshot=json.loads(row.snapshot_json), content=json.loads(row.content_json) if row.content_json else None,
                      usage=json.loads(row.usage_json) if row.usage_json else None)
    return result


def report_view(db, key):
    row = db.query(DisciplineAIReport).filter_by(username=context.username(), id=key).first()
    if row is None:
        raise HTTPException(404, '报告不存在')
    result = public(row)
    current = snapshot.build(db, row.period, datetime.fromisoformat(row.start).date(), result['snapshot']['quality']['include_notes'])
    return {**result, 'stale': current['fingerprint'] != row.source_hash}


def history(db, period=None, limit=20):
    query = db.query(DisciplineAIReport).filter_by(username=context.username())
    if period:
        query = query.filter_by(period=period)
    return {'items': [public(row, False) for row in query.order_by(DisciplineAIReport.created_at.desc()).limit(limit).all()]}


def overview(db, period, anchor):
    current = snapshot.build(db, period, anchor, preferences(db)['include_notes'])
    query = db.query(DisciplineAIReport).filter_by(username=context.username(), period=period, start=current['start'])
    latest = query.order_by(DisciplineAIReport.created_at.desc()).first()
    success = query.filter_by(status='success').order_by(DisciplineAIReport.created_at.desc()).first()
    active = query.filter(DisciplineAIReport.status.in_(['queued', 'running'])).first()
    return {'source': current, 'report': public(success) if success else None,
        'active': public(active, False) if active else None, 'latest_attempt': public(latest, False) if latest else None,
        'stale': bool(success and success.source_hash != current['fingerprint']), 'settings': settings_view(db)}


def create_report(db, body, origin='manual'):
    can_generate(db)
    config = provider.configuration()
    if not config['api_key']:
        raise HTTPException(503, '尚未配置 DeepSeek，请先完成服务端接入')
    source = snapshot.build(db, body.period, body.anchor, preferences(db)['include_notes'])
    if not source['has_data']:
        raise HTTPException(409, '这个周期尚无已入库记录，请先同步屏幕统计或保存每日计划')
    owner = context.username()
    active = db.query(DisciplineAIReport).filter_by(active_key=owner).first()
    if active:
        if active.period == body.period and active.start == source['start']:
            return {**public(active), 'reused': True}
        raise HTTPException(409, '另一个周期正在生成，请稍后再试')
    options = {'focus': body.focus, 'detail': body.detail}
    success = db.query(DisciplineAIReport).filter_by(username=owner, period=body.period, start=source['start'],
        source_hash=source['fingerprint'], status='success', model=config['model'], prompt_version=provider.PROMPT_VERSION,
        options_json=json.dumps(options, sort_keys=True)).order_by(DisciplineAIReport.created_at.desc()).first()
    if success and not body.regenerate:
        return {**public(success), 'reused': True}
    midnight = datetime.now(snapshot.settings.timezone).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    if db.query(DisciplineAIReport).filter(DisciplineAIReport.username == owner, DisciplineAIReport.created_at >= midnight).count() >= 20:
        raise HTTPException(429, '今天的生成次数已达上限；已有报告仍可查看')
    stamp = now()
    row = DisciplineAIReport(id=uuid4().hex, username=owner, period=body.period, start=source['start'], end=source['end'],
        status='queued', active_key=owner, created_at=stamp, updated_at=stamp, source_hash=source['fingerprint'],
        snapshot_json=json.dumps(source, ensure_ascii=False, default=float), options_json=json.dumps(options, sort_keys=True),
        model=config['model'], prompt_version=provider.PROMPT_VERSION, origin=origin)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, '生成任务已存在，请刷新查看进度') from None
    return {**public(row), 'reused': False}
