"""Atomic event ingestion and deterministic interval reconstruction."""
import hashlib
import json
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.dialects.sqlite import insert
from core import context
from models.discipline_screen import ScreenAppPreference, ScreenDevice, ScreenEvent, ScreenImport, ScreenSession
from services.discipline_screen.catalog import SYSTEM_APPS

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
RULE_VERSION = 'focus-v1'


def micros(value):
    delta = value.astimezone(timezone.utc) - EPOCH
    return (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds


def rebuild(db, username, device_key):
    events = db.query(ScreenEvent).filter_by(username=username, device_key=device_key).order_by(
        ScreenEvent.time_us, ScreenEvent.starting, ScreenEvent.app).all()
    db.query(ScreenSession).filter_by(username=username, device_key=device_key).delete(synchronize_session=False)
    active = None
    pending = []

    def close(start, end, app):
        duration = end - start
        status = ('system' if app in SYSTEM_APPS else 'short' if duration < 1_000_000
                  else 'long' if duration > 14_400_000_000 else 'normal')
        pending.append({'username': username, 'device_key': device_key, 'app': app,
                        'start_us': start, 'end_us': end, 'status': status})

    for event in events:
        if event.starting:
            if active and active[1] != event.app:
                close(active[0], event.time_us, active[1])
            if active is None or active[1] != event.app:
                active = (event.time_us, event.app)
        elif active and active[1] == event.app:
            close(active[0], event.time_us, active[1])
            active = None
    if active:
        pending.append({'username': username, 'device_key': device_key, 'app': active[1],
                        'start_us': active[0], 'end_us': None, 'status': 'open'})
    for offset in range(0, len(pending), 500):
        db.execute(insert(ScreenSession), pending[offset:offset + 500])


def import_events(db, body, collector_id=None):
    username = context.username()
    now = datetime.now(timezone.utc).isoformat()
    keys = [device.key for device in body.devices]
    try:
        # Acquire the SQLite write lock before reading/rebuilding a device; concurrent imports serialize.
        for device in body.devices:
            stmt = insert(ScreenDevice).values(username=username, device_key=device.key,
                name=device.name, kind=device.kind, imported_at=now)
            db.execute(stmt.on_conflict_do_update(index_elements=['username', 'device_key'], set_={'imported_at': now}))
        before = db.query(ScreenEvent).filter(ScreenEvent.username == username, ScreenEvent.device_key.in_(keys)).count()
        changed = set()
        for offset in range(0, len(body.events), 500):
            values = []
            for event in body.events[offset:offset + 500]:
                time_us = micros(event.time)
                identity = json.dumps([event.device, time_us, event.app, event.starting], separators=(',', ':'))
                values.append({'username': username, 'device_key': event.device, 'time_us': time_us,
                    'app': event.app, 'starting': event.starting,
                    'fingerprint': hashlib.sha256(identity.encode()).hexdigest()})
                changed.add(event.device)
            if values:
                db.execute(insert(ScreenEvent).on_conflict_do_nothing(index_elements=['username', 'fingerprint']), values)
        for key in sorted(changed):
            rebuild(db, username, key)
        after = db.query(ScreenEvent).filter(ScreenEvent.username == username, ScreenEvent.device_key.in_(keys)).count()
        added = after - before
        if collector_id:
            from services.discipline_screen.collectors import record_success
            record_success(db, collector_id, added, now)
        db.add(ScreenImport(username=username, imported_at=now, received=len(body.events), added=added))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {'received': len(body.events), 'added': added, 'duplicates': len(body.events) - added,
            'devices': len(keys), 'imported_at': now, 'rule_version': RULE_VERSION}


def rename_device(db, key, body):
    device = db.query(ScreenDevice).filter_by(username=context.username(), device_key=key).first()
    if device is None:
        raise HTTPException(404, '设备不存在')
    device.name = body.name
    db.commit()
    return {'key': key, 'name': device.name}


def edit_app(db, body):
    username = context.username()
    if not db.query(ScreenEvent.id).filter_by(username=username, app=body.app).first():
        raise HTTPException(404, '应用不存在')
    stmt = insert(ScreenAppPreference).values(username=username, app=body.app, name=body.name, category=body.category)
    db.execute(stmt.on_conflict_do_update(index_elements=['username', 'app'], set_={'name': body.name, 'category': body.category}))
    db.commit()
    return body.model_dump()
