"""All metrics share the same clipped intervals; seconds are never rounded before aggregation."""
import csv
import io
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import func, or_
from core import context
from core.config import settings
from models.discipline_screen import ScreenAppPreference, ScreenDevice, ScreenEvent, ScreenImport, ScreenSession
from services.discipline_screen.catalog import APPS, CATEGORIES
from services.discipline_screen.store import EPOCH, RULE_VERSION, micros

TZ = settings.timezone


def stamp(value):
    return (EPOCH + timedelta(microseconds=value)).astimezone(TZ).isoformat() if value is not None else None


def bounds(start, end):
    if start.year < 2001 or end.year > 2100 or start > end or (end - start).days > 365:
        raise HTTPException(422, '请选择起止顺序正确且不超过 366 天的范围')
    return micros(datetime.combine(start, time.min, TZ)), micros(datetime.combine(end + timedelta(days=1), time.min, TZ))


def selected_devices(db, key):
    devices = db.query(ScreenDevice).filter_by(username=context.username()).order_by(ScreenDevice.kind, ScreenDevice.name).all()
    if key and not any(d.device_key == key for d in devices):
        raise HTTPException(404, '设备不存在')
    return devices


def session_query(db, lo, hi, device=None, app=None):
    query = db.query(ScreenSession).filter(ScreenSession.username == context.username(),
        ScreenSession.start_us < hi, or_(ScreenSession.end_us > lo,
            (ScreenSession.end_us.is_(None) & (ScreenSession.start_us >= lo))))
    if device:
        query = query.filter(ScreenSession.device_key == device)
    if app:
        query = query.filter(ScreenSession.app == app)
    return query


def app_catalog(db):
    catalog = dict(APPS)
    for row in db.query(ScreenAppPreference).filter_by(username=context.username()).all():
        catalog[row.app] = (row.name, row.category)
    return catalog


def app_info(app, catalog):
    name, category = catalog.get(app, (app, 'other'))
    return {'app': app, 'name': name, 'category': category, 'category_name': CATEGORIES[category]}


def union_seconds(intervals):
    total = 0
    edge = None
    for start, end in sorted(intervals):
        total += max(0, end - max(start, edge if edge is not None else start))
        edge = max(edge if edge is not None else end, end)
    return total / 1_000_000


def split_hours(start, end):
    cursor = (EPOCH + timedelta(microseconds=start)).astimezone(TZ)
    finish = (EPOCH + timedelta(microseconds=end)).astimezone(TZ)
    while cursor < finish:
        boundary = min(finish, cursor.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))
        yield cursor.date().isoformat(), cursor.hour, (boundary - cursor).total_seconds()
        cursor = boundary


def overview(db, start, end, device=None):
    lo, hi = bounds(start, end)
    owner = context.username()
    devices = selected_devices(db, device)
    catalog = app_catalog(db)
    rows = session_query(db, lo, hi, device).all()
    normal = [r for r in rows if r.status == 'normal']
    all_days = [start + timedelta(days=i) for i in range((end-start).days+1)]
    daily = {d.isoformat(): {'date': d.isoformat(), 'seconds': None, 'devices': {}, 'categories': {}, 'sessions': 0}
             for d in all_days}
    hourly = [{'hour': i, 'seconds': 0, 'devices': {}, 'categories': {}} for i in range(24)]
    applications = {}
    device_totals = Counter()
    category_totals = Counter()
    total = night = longest = 0
    intervals = []
    day_intervals = defaultdict(list)
    device_days = set()
    for row in normal:
        a, b = max(row.start_us, lo), min(row.end_us, hi)
        seconds = (b-a) / 1_000_000
        info = app_info(row.app, catalog)
        category = info['category']
        entry = applications.setdefault(row.app, {**info, 'seconds': 0, 'sessions': 0, 'devices': [], 'last_used': None})
        entry['seconds'] += seconds
        entry['sessions'] += 1
        if row.device_key not in entry['devices']:
            entry['devices'].append(row.device_key)
        entry['last_used'] = max(entry['last_used'] or '', stamp(b))
        total += seconds
        longest = max(longest, seconds)
        device_totals[row.device_key] += seconds
        category_totals[category] += seconds
        intervals.append((a, b))
        seen_days = set()
        for day, hour, value in split_hours(a, b):
            target = daily[day]
            target['seconds'] = (target['seconds'] or 0) + value
            for dest in (target, hourly[hour]):
                dest['devices'][row.device_key] = dest['devices'].get(row.device_key, 0) + value
                dest['categories'][category] = dest['categories'].get(category, 0) + value
            hourly[hour]['seconds'] += value
            if day not in seen_days:
                target['sessions'] += 1
                seen_days.add(day)
                device_days.add((row.device_key, day))
            if hour >= 23 or hour < 6:
                night += value
        # Daily union is clipped separately, rather than summing device durations.
        for day in seen_days:
            day_lo, day_hi = bounds(date.fromisoformat(day), date.fromisoformat(day))
            day_intervals[day].append((max(a, day_lo), min(b, day_hi)))
    for day, value in daily.items():
        value['unique_seconds'] = union_seconds(day_intervals[day]) if value['seconds'] is not None else None
    union = union_seconds(intervals)
    observed = sum(d['seconds'] is not None for d in daily.values())
    anomaly_count = sum(r.status in {'long', 'open'} for r in rows)
    for day, entry in daily.items():
        day_lo, day_hi = bounds(date.fromisoformat(day), date.fromisoformat(day))
        entry['anomalies'] = sum(r.status in {'long', 'open'} and r.start_us < day_hi
            and (r.end_us > day_lo if r.end_us else r.start_us >= day_lo) for r in rows)
    span = len(all_days)
    prev_lo, prev_hi = lo - span * 86_400_000_000, lo
    previous = session_query(db, prev_lo, prev_hi, device).filter(ScreenSession.status == 'normal').all()
    prev_total = sum((min(r.end_us, prev_hi)-max(r.start_us, prev_lo))/1_000_000 for r in previous)
    prev_days = {d for r in previous for d, hour, value in split_hours(max(r.start_us, prev_lo), min(r.end_us, prev_hi))}
    event_ranges = {key: (first, last) for key, first, last in db.query(ScreenEvent.device_key,
        func.min(ScreenEvent.time_us), func.max(ScreenEvent.time_us)).filter_by(username=owner).group_by(ScreenEvent.device_key).all()}
    comparison_devices = {device} if device else set(event_ranges)
    prev_device_days = {(r.device_key, day) for r in previous for day, hour, value in
                        split_hours(max(r.start_us, prev_lo), min(r.end_us, prev_hi))}
    previous_anomalies = session_query(db, prev_lo, prev_hi, device).filter(ScreenSession.status.in_(['long', 'open'])).count()
    comparable = (bool(comparison_devices) and len(device_days) == span * len(comparison_devices)
                  and len(prev_device_days) == span * len(comparison_devices)
                  and not anomaly_count and not previous_anomalies and end < datetime.now(TZ).date())
    all_device_totals = dict(db.query(ScreenSession.device_key,
        func.sum(func.min(ScreenSession.end_us, hi) - func.max(ScreenSession.start_us, lo)) / 1_000_000).filter(
            ScreenSession.username == owner, ScreenSession.status == 'normal',
            ScreenSession.start_us < hi, ScreenSession.end_us > lo).group_by(ScreenSession.device_key).all())
    device_data = []
    for d in devices:
        first, last = event_ranges.get(d.device_key, (None, None))
        device_data.append({'key': d.device_key, 'name': d.name, 'kind': d.kind,
            'seconds': all_device_totals.get(d.device_key), 'first_event': stamp(first), 'last_event': stamp(last),
            'imported_at': d.imported_at, 'has_data': first is not None})
    imports = db.query(ScreenImport).filter_by(username=owner).order_by(ScreenImport.id.desc()).limit(10).all()
    return {
        'start': start.isoformat(), 'end': end.isoformat(), 'timezone': 'Asia/Shanghai',
        'summary': {'seconds': total, 'unique_seconds': union, 'overlap_seconds': max(0, total-union),
            'night_seconds': night, 'longest_seconds': longest, 'sessions': len(normal),
            'apps': len(applications), 'observed_days': observed, 'days': span,
            'daily_average': total/observed if observed else None, 'anomalies': anomaly_count,
            'peak_hour': max(hourly, key=lambda item: item['seconds'])['hour'] if total else None},
        'comparison': {'seconds': prev_total, 'observed_days': len(prev_days), 'comparable': comparable,
            'delta_percent': (total-prev_total)/prev_total*100 if comparable and prev_total else None},
        'devices': device_data, 'daily': list(daily.values()), 'hourly': hourly,
        'apps': sorted(applications.values(), key=lambda item: (-item['seconds'], item['app'])),
        'categories': [{'key': k, 'name': CATEGORIES[k], 'seconds': v} for k, v in category_totals.most_common()],
        'quality': {'long': sum(r.status == 'long' for r in rows), 'open': sum(r.status == 'open' for r in rows),
            'system': sum(r.status == 'system' for r in rows), 'short': sum(r.status == 'short' for r in rows),
            'rule_version': RULE_VERSION, 'has_events': bool(event_ranges),
            'latest_event': stamp(max((r[1] for r in event_ranges.values()), default=None)),
            'first_event': stamp(min((r[0] for r in event_ranges.values()), default=None))},
        'imports': [{'id': r.id, 'imported_at': r.imported_at, 'received': r.received, 'added': r.added} for r in imports],
    }


def list_sessions(db, start, end, device=None, app=None, status='normal', offset=0, limit=50):
    lo, hi = bounds(start, end)
    devices = {d.device_key: d for d in selected_devices(db, device)}
    catalog = app_catalog(db)
    query = session_query(db, lo, hi, device, app)
    query = query.filter(ScreenSession.status == 'normal') if status == 'normal' else query.filter(ScreenSession.status.in_(['long', 'open']))
    total = query.count()
    rows = query.order_by(ScreenSession.start_us.desc(), ScreenSession.id.desc()).offset(offset).limit(limit).all()
    items = []
    for r in rows:
        a, b = max(lo, r.start_us), min(hi, r.end_us) if r.end_us is not None else None
        items.append({**app_info(r.app, catalog), 'id': r.id, 'device': r.device_key,
            'device_name': devices[r.device_key].name, 'start': stamp(a), 'end': stamp(b),
            'original_start': stamp(r.start_us), 'original_end': stamp(r.end_us),
            'seconds': (b-a)/1_000_000 if b is not None else None,
            'status': r.status, 'clipped': a != r.start_us or b != r.end_us})
    return {'items': items, 'total': total, 'offset': offset, 'limit': limit}


def export_csv(db, start, end, device=None, app=None):
    lo, hi = bounds(start, end)
    devices = {d.device_key: d.name for d in selected_devices(db, device)}
    catalog = app_catalog(db)
    rows = session_query(db, lo, hi, device, app).filter(ScreenSession.status == 'normal').order_by(ScreenSession.start_us).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['设备', '应用', '应用标识', '分类', '开始时间（北京时间）', '结束时间（北京时间）', '秒数'])
    def safe(value):
        return "'" + value if value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else value
    for r in rows:
        info = app_info(r.app, catalog)
        a, b = max(lo, r.start_us), min(hi, r.end_us)
        writer.writerow([safe(devices[r.device_key]), safe(info['name']), safe(r.app), info['category_name'], stamp(a), stamp(b), (b-a)/1_000_000])
    return '\ufeff' + output.getvalue()
