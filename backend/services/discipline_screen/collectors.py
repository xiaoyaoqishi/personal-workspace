"""Revocable, upload-only credentials. Raw tokens are returned once, never stored."""
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from core import context
from models.auth import User
from models.discipline_screen import ScreenCollector

COLLECTOR_ROUTES = {
    '/api/discipline/screen/collector/imports': 'POST',
    '/api/discipline/screen/collector/status': 'GET',
}


def public(row):
    return {'id': row.id, 'name': row.name, 'created_at': row.created_at,
            'revoked_at': row.revoked_at, 'last_upload_at': row.last_upload_at,
            'events_added': row.events_added, 'scope': 'screen:ingest'}


def check_user(user):
    if user is None or not user.is_active:
        raise HTTPException(401, '采集账户不可用')
    if user.role == 'admin':
        return
    try:
        modules = json.loads(user.module_permissions or '[]')
        permissions = json.loads(user.data_permissions or '{}')
    except (ValueError, TypeError):
        raise HTTPException(403, '采集账户权限无效')
    if not isinstance(modules, list) or (modules and 'discipline' not in modules):
        raise HTTPException(403, '账户没有自律养成权限')
    if not isinstance(permissions, dict) or permissions.get('discipline', 'read_write') != 'read_write':
        raise HTTPException(403, '自律养成为只读，已暂停采集')


def create(db, name):
    owner = context.username()
    user = db.query(User).filter_by(username=owner).first()
    check_user(user)
    active = db.query(ScreenCollector).filter_by(username=owner, revoked_at=None).count()
    if active >= 10:
        raise HTTPException(409, '最多保留10个有效采集凭证，请先撤销不再使用的凭证')
    key = uuid4().hex
    token = 'dsc_' + key + '.' + secrets.token_urlsafe(32)
    row = ScreenCollector(id=key, username=owner, name=name.strip(),
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        created_at=datetime.now(timezone.utc).isoformat(), events_added=0)
    db.add(row)
    db.commit()
    return {**public(row), 'token': token}


def list_collectors(db):
    return {'items': [public(row) for row in db.query(ScreenCollector).filter_by(
        username=context.username()).order_by(ScreenCollector.created_at.desc()).all()]}


def revoke(db, key):
    row = db.query(ScreenCollector).filter_by(username=context.username(), id=key).first()
    if row is None:
        raise HTTPException(404, '采集凭证不存在')
    row.revoked_at = row.revoked_at or datetime.now(timezone.utc).isoformat()
    db.commit()
    return public(row)


def authenticate(db, authorization):
    if not authorization.startswith('Bearer dsc_') or len(authorization) > 256:
        raise HTTPException(401, '需要专用采集凭证')
    token = authorization[7:]
    key, separator, secret = token[4:].partition('.')
    if not separator or len(key) != 32 or len(secret) < 32:
        raise HTTPException(401, '采集凭证无效')
    row = db.query(ScreenCollector).filter_by(id=key, revoked_at=None).first()
    digest = hashlib.sha256(token.encode()).hexdigest()
    if row is None or not hmac.compare_digest(row.token_hash, digest):
        raise HTTPException(401, '采集凭证无效或已撤销')
    check_user(db.query(User).filter_by(username=row.username).first())
    return {'username': row.username, 'collector_id': row.id}


def record_success(db, key, added, now):
    row = db.query(ScreenCollector).filter_by(id=key, username=context.username(), revoked_at=None).first()
    if row is None:
        raise HTTPException(401, '采集凭证已撤销')
    check_user(db.query(User).filter_by(username=row.username).first())
    row.last_upload_at = now
    row.events_added += added


def status(db, key):
    row = db.query(ScreenCollector).filter_by(id=key, username=context.username(), revoked_at=None).first()
    if row is None:
        raise HTTPException(401, '采集凭证已撤销')
    return {**public(row), 'username': row.username}
