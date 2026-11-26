import json
from datetime import date, datetime
from uuid import NAMESPACE_URL, uuid5
from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from core import context
from core.config import settings
from models.discipline import DisciplinePlan
from schemas.discipline import PlanWrite
from services.discipline_calendar import month_dates, workday_reason
from services import discipline_history


DEFAULT_SLOTS = [
    {'start': '07:00', 'end': '08:30', 'theme': '读书'},
    {'start': '08:30', 'end': '11:30', 'theme': '学习工作'},
    {'start': '11:30', 'end': '13:30', 'theme': '午休', 'included': False},
    {'start': '13:30', 'end': '16:00', 'theme': '学习工作'},
    {'start': '16:00', 'end': '17:30', 'theme': '运动 / 自由安排'},
    {'start': '17:30', 'end': '19:30', 'theme': '晚饭 / 休息', 'included': False},
]

POINTS = {'aligned': 100, 'partial': 50, 'off_track': 0, 'pending': 0}


def china_today():
    return datetime.now(settings.timezone).date()


def normalize_slots(slots):
    # Preserve old records without a data migration; never derive history from a live template.
    return [dict(slot, id=slot.get('id') or str(uuid5(NAMESPACE_URL, f"discipline:{slot['start']}:{slot['end']}:{slot['theme']}")),
                 status=slot.get('status', 'pending'), notes=slot.get('notes', ''),
                 included=slot.get('included', slot['theme'] not in {'午休', '晚饭 / 休息'})) for slot in slots]


def achievement(slots):
    selected = [slot for slot in slots if slot.get('included', True)]
    if not selected:
        return {'rate': None, 'grade': 'untracked', 'selected': 0, 'evaluated': 0}
    total = sum(POINTS.get(slot['status'], 0) for slot in selected)
    grade = 'good' if total >= 75 * len(selected) else 'improve' if total >= 40 * len(selected) else 'failed'
    return {'rate': round(total / len(selected), 1), 'grade': grade, 'selected': len(selected),
            'evaluated': sum(slot['status'] != 'pending' for slot in selected)}


def day_metadata(day, slots, current):
    reason = workday_reason(day)
    score = achievement(slots)
    if day > current and reason == 'workday':
        score = {**score, 'rate': None, 'grade': 'future'}
    return {'today': current.isoformat(), 'editable': day == current, 'day_type': reason,
            'achievement': score if reason == 'workday' else {**score, 'rate': None, 'grade': 'excluded'}}


def read_plan(db, key):
    current = china_today()
    row = db.query(DisciplinePlan).filter_by(username=context.username(), plan_key=key).first()
    if row:
        result = {'revision': row.revision, 'slots': normalize_slots(json.loads(row.slots_json)), 'saved': True}
        if key != 'template':
            result.update(day_metadata(date.fromisoformat(key), result['slots'], current))
        return result
    template = db.query(DisciplinePlan).filter_by(username=context.username(), plan_key='template').first()
    slots = json.loads(template.slots_json) if template else DEFAULT_SLOTS
    if key != 'template' and date.fromisoformat(key) < current:
        slots = []
    result = {'revision': 0, 'saved': False, 'slots': normalize_slots([dict(slot, status='pending', notes='') for slot in slots])}
    if key != 'template':
        result.update(day_metadata(date.fromisoformat(key), result['slots'], current))
        if date.fromisoformat(key) < current:
            day = date.fromisoformat(key)
            entry = next(item for item in month_summary(db, day.year, day.month)['days'] if item['date'] == key)
            result['achievement'] = {name: entry[name] for name in ('rate', 'grade', 'selected', 'evaluated')}
    return result


def save_plan(db, key, body):
    if key != 'template' and date.fromisoformat(key) != china_today():
        raise HTTPException(403, '只能保存北京时间当天的记录，历史与未来日期仅供查看')
    slots = [slot.model_dump() for slot in sorted(body.slots, key=lambda slot: slot.start)]
    if key == 'template':
        slots = [dict(slot, status='pending', notes='') for slot in slots]
    before_template = read_plan(db, 'template') if key == 'template' else None
    affected_date = china_today().isoformat()
    before_day = read_plan(db, affected_date) if key == 'template' else None
    username = context.username()
    raw = json.dumps(slots, ensure_ascii=False)
    try:
        if body.revision == 0:
            db.add(DisciplinePlan(username=username, plan_key=key, slots_json=raw, revision=1))
        else:
            result = db.execute(update(DisciplinePlan).where(
                DisciplinePlan.username == username,
                DisciplinePlan.plan_key == key,
                DisciplinePlan.revision == body.revision,
            ).values(slots_json=raw, revision=body.revision + 1))
            if result.rowcount != 1:
                raise HTTPException(409, '记录已在其他窗口更新，请刷新后重试')
        if key == 'template':
            synchronize_today(db, slots, body.day_revision, before_template['slots'])
            if affected_date != china_today().isoformat():
                db.rollback()
                raise HTTPException(409, '已跨过北京时间零点，请重新打开默认作息')
            discipline_history.record_change(db, before_template, slots, before_day, read_plan(db, affected_date), affected_date)
        if key != 'template' and date.fromisoformat(key) != china_today():
            db.rollback()
            raise HTTPException(403, '已跨过北京时间零点，记录已锁定')
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, '记录已在其他窗口更新，请刷新后重试')
    result = read_plan(db, key)
    if key == 'template':
        result['day'] = read_plan(db, china_today().isoformat())
    return result


def list_template_versions(db, offset, limit):
    return discipline_history.list_versions(db, read_plan(db, 'template'), offset, limit)


def get_template_version(db, revision):
    return discipline_history.get_version(db, read_plan(db, 'template'), revision)


def synchronize_today(db, template_slots, expected_revision=None, prior_template_slots=None):
    key = china_today().isoformat()
    row = db.query(DisciplinePlan).filter_by(username=context.username(), plan_key=key).first()
    if expected_revision is not None and expected_revision != (row.revision if row else 0):
        db.rollback()
        raise HTTPException(409, '当天记录已在其他窗口更新，请刷新后再修改作息')
    if not row:
        return  # Configuring a routine alone must not start daily tracking.
    raw_previous = json.loads(row.slots_json)
    previous = normalize_slots(raw_previous)
    legacy_ids = {slot['id'] for raw, slot in zip(raw_previous, previous) if not raw.get('id')}
    prior_ids = {slot['id'] for slot in (prior_template_slots or [])}
    merged, used = [], set()
    for slot in template_slots:
        match = next((old for old in previous if old['id'] == slot['id']), None)
        # Only genuine legacy records may match a retained template slot by time.
        # A newly created replacement must never inherit the deleted slot's rating.
        if match is None and slot['id'] in prior_ids:
            match = next((old for old in previous if old['id'] not in used and
                          old['id'] in legacy_ids and
                          (old['start'], old['end']) == (slot['start'], slot['end'])), None)
        if match:
            used.add(match['id'])
        merged.append(dict(slot, status=match['status'] if match else 'pending', notes=match['notes'] if match else ''))
    # Removed slots live in the immutable before-snapshot, never in the active plan.
    try:
        validated = PlanWrite(slots=merged)
    except ValueError:
        db.rollback()
        raise HTTPException(409, '当天记录无法同步，请重新打开默认作息后重试')
    result = db.execute(update(DisciplinePlan).where(
        DisciplinePlan.id == row.id, DisciplinePlan.revision == row.revision,
    ).values(slots_json=json.dumps([slot.model_dump() for slot in sorted(validated.slots, key=lambda s: s.start)], ensure_ascii=False),
             revision=row.revision + 1))
    if result.rowcount != 1 or key != china_today().isoformat():
        db.rollback()
        raise HTTPException(409, '当天记录已变化，请刷新后再修改作息')


def month_summary(db, year, month):
    current = china_today()
    rows = db.query(DisciplinePlan).filter(
        DisciplinePlan.username == context.username(), DisciplinePlan.plan_key <= current.isoformat(),
    ).all()
    records = {row.plan_key: normalize_slots(json.loads(row.slots_json)) for row in rows
               if len(row.plan_key) == 10 and row.plan_key[4] == '-'}
    started = min(records) if records else None
    days = []
    for day in month_dates(year, month):
        key = day.isoformat()
        reason = workday_reason(day)
        score = achievement(records.get(key, []))
        counted = False
        if reason != 'workday':
            score = {**score, 'rate': None, 'grade': 'excluded'}
        elif day > current:
            score = {**score, 'rate': None, 'grade': 'future'}
        elif key in records:
            counted = score['rate'] is not None
        elif day == current:
            score = {**score, 'rate': None, 'grade': 'pending'}
        elif started and key >= started:
            # A missed workday after tracking started remains a zero permanently.
            score = {**score, 'rate': 0, 'grade': 'failed'}
            counted = True
        else:
            score = {**score, 'rate': None, 'grade': 'not_started'}
        days.append({'date': key, 'day_type': reason, 'saved': key in records, 'counted': counted,
                     'is_today': day == current, **score})
    counted_days = [day for day in days if day['counted']]
    return {'today': current.isoformat(), 'started_on': started, 'calendar_supported': year in (2026, 2027),
            'days': days, 'summary': {'counted_days': len(counted_days),
                'average_rate': round(sum(day['rate'] for day in counted_days) / len(counted_days), 1) if counted_days else None,
                'good_days': sum(day['grade'] == 'good' for day in counted_days),
                'improve_days': sum(day['grade'] == 'improve' for day in counted_days),
                'failed_days': sum(day['grade'] == 'failed' for day in counted_days)}}
