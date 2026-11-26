from collections import Counter
from datetime import date, datetime, timedelta
import hashlib
import json
from fastapi import HTTPException
from sqlalchemy import func
from core import context
from core.config import settings
from models.discipline_screen import ScreenEvent, ScreenImport, ScreenSession
from services import discipline_service
from services.discipline_screen import analytics

STATUS = {'aligned': '符合', 'partial': '部分符合', 'off_track': '偏离', 'pending': '未评价'}
DAY_NAMES = {'workday': '工作日', 'weekend': '周末', 'holiday': '节假日', 'unknown_calendar': '日历待维护'}


def period_range(period, anchor):
    if anchor > datetime.now(settings.timezone).date() - timedelta(days=1):
        raise HTTPException(422, '请选择已结束的日期；今日数据尚在变化')
    start = anchor if period == 'day' else anchor - timedelta(days=anchor.weekday())
    end = start if period == 'day' else start + timedelta(days=6)
    if end >= datetime.now(settings.timezone).date():
        raise HTTPException(422, '本周尚未结束，请选择上一周')
    if start.year < 2001:
        raise HTTPException(422, '日期超出支持范围')
    return start, end


def build(db, period, anchor, include_notes=False):
    start, end = period_range(period, anchor)
    screen = analytics.overview(db, start, end)
    owner = context.username()
    lo, hi = analytics.bounds(start, end)
    raw_count, first, last = db.query(func.count(ScreenEvent.id), func.min(ScreenEvent.time_us), func.max(ScreenEvent.time_us)).filter(
        ScreenEvent.username == owner, ScreenEvent.time_us >= lo, ScreenEvent.time_us < hi).one()
    imported = db.query(func.max(ScreenImport.imported_at)).filter_by(username=owner).scalar()
    sessions = db.query(ScreenSession).filter(ScreenSession.username == owner, ScreenSession.status == 'normal',
        ScreenSession.start_us < hi, ScreenSession.end_us > lo).all()
    evidence = []
    def add(key, title, detail, source, day=None):
        evidence.append({'id': key, 'title': title, 'detail': detail, 'source': source, 'date': day})
    summary = screen['summary']
    observed = summary['observed_days'] > 0
    add('screen-summary', '设备使用概览',
        f"设备累计 {summary['seconds']/60:.1f} 分钟，跨设备合并后 {summary['unique_seconds']/60:.1f} 分钟；"
        f"正常片段 {summary['sessions']}，应用 {summary['apps']}，有记录 {summary['observed_days']}/{summary['days']} 天。缺记录不等于零使用。" if observed else '暂无正常屏幕使用记录，无法计算实际使用时长，不代表零使用。', 'screen')
    add('screen-night', '夜间使用', f"23:00—次日06:00的设备累计使用 {summary['night_seconds']/60:.1f} 分钟，不能据此判断睡眠。" if observed else '屏幕记录不足，夜间使用未知。', 'screen')
    for index, device in enumerate(screen['devices'][:12]):
        if device['seconds'] is not None:
            add(f'device-{index}', device['name'], f"正常使用累计 {float(device['seconds'])/60:.1f} 分钟，设备类型 {device['kind']}。", 'screen')
    for index, app in enumerate(screen['apps'][:8]):
        percent = app['seconds']/summary['seconds']*100 if summary['seconds'] else 0
        add(f'app-{index}', app['name'], f"正常使用累计 {app['seconds']/60:.1f} 分钟，占设备累计时长 {percent:.1f}%（分母是设备累计时长）；{app['sessions']} 个片段，分类为 {app['category_name']}。分类不等于使用目的。", 'screen')
    days, rates, slot_counts = [], [], Counter()
    for offset in range((end-start).days + 1):
        day = start + timedelta(days=offset)
        key = day.isoformat()
        plan = discipline_service.read_plan(db, key)
        score = plan['achievement']
        if score['rate'] is not None:
            rates.append(score['rate'])
        selected = [slot for slot in plan['slots'] if slot.get('included', True)]
        slot_counts.update(slot['status'] for slot in selected)
        row = {'date': key, 'saved': plan['saved'], 'day_type': plan['day_type'], 'rate': score['rate'],
               'selected': len(selected), 'evaluated': sum(s['status'] != 'pending' for s in selected)}
        days.append(row)
        daily_screen = screen['daily'][offset]
        row['screen_seconds'] = daily_screen['seconds']
        screen_detail = f"设备累计 {daily_screen['seconds']/60:.1f} 分钟，合并后 {daily_screen['unique_seconds']/60:.1f} 分钟。" if daily_screen['seconds'] is not None else '暂无正常使用记录，不能推断为零使用。'
        add('screen-day-' + key, key + '用机概况', screen_detail, 'screen', key)
        add('plan-' + key, key + ' 计划执行',
            f"{'有保存记录' if plan['saved'] else '无保存记录'}；日期类型 {DAY_NAMES[plan['day_type']]}；"
            f"达成率 {str(score['rate'])+'%' if score['rate'] is not None else '不计分'}；"
            f"参与 {row['selected']} 段，已评价 {row['evaluated']} 段。未评价不表示实际执行失败。", 'plan', key)
        # At most eight specific slots per day; summary above includes all slots.
        selected_slots = sorted(enumerate(plan['slots']), key=lambda item: (item[1]['status'] == 'aligned', not item[1].get('included', True), item[0]))[:8]
        for index, slot in selected_slots:
            slot_lo = analytics.bounds(day, day)[0] + (int(slot['start'][:2])*60 + int(slot['start'][3:]))*60_000_000
            slot_hi = analytics.bounds(day, day)[0] + (int(slot['end'][:2])*60 + int(slot['end'][3:]))*60_000_000
            overlap = sum(max(0, min(row.end_us, slot_hi) - max(row.start_us, slot_lo)) for row in sessions)/60_000_000
            counted = '计入统计' if slot.get('included', True) else '不计入统计'
            text = f"{slot['start']}—{slot['end']}，主题 {slot['theme']}，{counted}，自评 {STATUS[slot['status']]}；同时间段设备累计前台使用 {overlap:.1f} 分钟，不能直接判断是否偏离主题。"
            if include_notes and slot.get('notes'):
                text += ' 用户备注：' + slot['notes'][:240]
            add(f'slot-{key}-{index}', slot['theme'], text, 'plan', key)
    metrics = {'screen_seconds': summary['seconds'] if observed else None, 'unique_seconds': summary['unique_seconds'] if observed else None,
        'night_seconds': summary['night_seconds'] if observed else None, 'apps': summary['apps'], 'sessions': summary['sessions'],
        'plan_rate': round(sum(rates)/len(rates), 1) if rates else None, 'plan_scored_days': len(rates),
        'plan_recorded_days': sum(day['saved'] for day in days), 'plan_selected': sum(slot_counts.values()),
        'plan_evaluated': sum(slot_counts.values()) - slot_counts['pending'], 'plan_pending': slot_counts['pending'],
        'observed_screen_days': summary['observed_days'], 'days': summary['days']}
    quality = {'missing_screen_days': [row['date'] for row in screen['daily'] if row['seconds'] is None],
        'missing_plan_days': [row['date'] for row in days if not row['saved']],
        'anomalies': summary['anomalies'], 'include_notes': include_notes,
        'notice': '截至本次已入库的数据；无法保证跨设备同步完整。未提供通知、拿起次数、网站内容、睡眠或真实专注度。每日至多展示8个计划时段，汇总包含全部时段。'}
    source = {'version': 'ai-source-v1', 'period': period, 'start': start.isoformat(), 'end': end.isoformat(),
        'timezone': 'Asia/Shanghai', 'metrics': metrics, 'days': days, 'quality': quality, 'evidence': evidence,
        'has_data': bool(raw_count or any(day['saved'] for day in days)), 'event_count': raw_count,
        'first_event': analytics.stamp(first), 'last_event': analytics.stamp(last)}
    fingerprint = hashlib.sha256(json.dumps(source, ensure_ascii=False, sort_keys=True, default=float).encode()).hexdigest()
    return {**source, 'fingerprint': fingerprint, 'data_as_of': imported}
