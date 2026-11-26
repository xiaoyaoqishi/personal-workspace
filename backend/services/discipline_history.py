"""Append-only routine history, committed atomically with routine/day changes."""
import json
from datetime import datetime
from fastapi import HTTPException
from core import context
from core.config import settings
from models.discipline import DisciplineRoutineVersion


def record_change(db, before, after_slots, day_before, day_after, effective_date):
    username = context.username()
    baseline = db.query(DisciplineRoutineVersion).filter_by(username=username, revision=before['revision']).first()
    if baseline is None:
        db.add(DisciplineRoutineVersion(username=username, revision=before['revision'], kind='baseline',
            slots_json=json.dumps(before['slots'], ensure_ascii=False)))
    db.add(DisciplineRoutineVersion(username=username, revision=before['revision'] + 1, kind='change',
        changed_at=datetime.now(settings.timezone).isoformat(timespec='seconds'), effective_date=effective_date,
        slots_json=json.dumps(after_slots, ensure_ascii=False),
        day_before_json=json.dumps(day_before, ensure_ascii=False), day_after_json=json.dumps(day_after, ensure_ascii=False)))


def serialize(row, detail=False):
    slots = json.loads(row.slots_json)
    result = {'revision':row.revision, 'changed_at':row.changed_at, 'effective_date':row.effective_date,
              'kind':row.kind, 'slot_count':len(slots), 'included_count':sum(slot['included'] for slot in slots)}
    if detail:
        result.update(slots=slots, day_before=json.loads(row.day_before_json) if row.day_before_json else None,
                      day_after=json.loads(row.day_after_json) if row.day_after_json else None)
    return result


def legacy_baseline(current, detail=False):
    slots = current['slots']
    result = {'revision':current['revision'], 'changed_at':None, 'effective_date':None, 'kind':'baseline',
              'slot_count':len(slots), 'included_count':sum(slot['included'] for slot in slots)}
    if detail:
        result.update(slots=slots, day_before=None, day_after=None)
    return result


def list_versions(db, current, offset, limit):
    query = db.query(DisciplineRoutineVersion).filter_by(username=context.username())
    total = query.count()
    if total == 0:
        return {'items':[legacy_baseline(current)] if offset == 0 else [], 'total':1}
    rows = query.order_by(DisciplineRoutineVersion.revision.desc()).offset(offset).limit(limit).all()
    return {'items':[serialize(row) for row in rows], 'total':total}


def get_version(db, current, revision):
    query = db.query(DisciplineRoutineVersion).filter_by(username=context.username())
    row = query.filter_by(revision=revision).first()
    if row:
        result = serialize(row, detail=True)
        previous = query.filter_by(revision=revision - 1).first() if row.kind == 'change' else None
        result['before_slots'] = json.loads(previous.slots_json) if previous else None
        return result
    if revision == current['revision'] and query.count() == 0:
        return legacy_baseline(current, detail=True)
    raise HTTPException(404, '作息版本不存在')
