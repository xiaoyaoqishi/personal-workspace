"""Behavioral tests for clipping, replay, late arrivals, permissions and data ownership."""
import csv
import io
import uuid
import pytest

ROOT = '/api/discipline/screen'
RANGE = 'start=2026-11-25&end=2026-11-25'


def own_user(c):
    name = 'screen_' + uuid.uuid4().hex[:12]
    response = c.post('/api/admin/users', json={'username': name, 'password': 'test123'})
    assert response.status_code == 200
    assert c.post('/api/auth/login', json={'username': name, 'password': 'test123'}).status_code == 200
    return name, response.json()['id']


def event(device, when, starting, app='test.app'):
    return {'device': device, 'time': when, 'starting': starting, 'app': app}


def payload(events):
    return {'version': 1, 'devices': [{'key': 'phone', 'name': 'iPhone', 'kind': 'iphone'},
        {'key': 'mac', 'name': 'Mac', 'kind': 'mac'}], 'events': events}


def ingest(c, events):
    response = c.post(ROOT + '/imports', json=payload(events))
    assert response.status_code == 200, response.text
    return response.json()


def test_midnight_timezone_union_and_conservation(admin_login):
    c = admin_login
    own_user(c)
    ingest(c, [event('phone', '2026-11-24T15:30:00Z', True),
               event('phone', '2026-11-24T16:30:00Z', False),
               event('mac', '2026-11-25T00:00:00+08:00', True),
               event('mac', '2026-11-25T01:00:00+08:00', False)])
    r = c.get(f'{ROOT}/overview?{RANGE}')
    assert r.status_code == 200, r.text
    data = r.json()
    summary = data['summary']
    assert summary['seconds'] == 5400
    assert summary['unique_seconds'] == 3600
    assert summary['overlap_seconds'] == 1800
    assert summary['night_seconds'] == 5400
    assert summary['sessions'] == 2
    assert sum(row['seconds'] for row in data['hourly']) == 5400
    assert sum(row['seconds'] for row in data['categories']) == 5400
    assert sum(row['seconds'] for row in data['apps']) == 5400
    phone = c.get(f'{ROOT}/overview?{RANGE}&device=phone').json()
    assert phone['summary']['seconds'] == 1800
    assert phone['summary']['overlap_seconds'] == 0
    # Cards retain the other devices' actual totals when one device is selected.
    assert {d['key']: d['seconds'] for d in phone['devices']} == {'mac': 3600, 'phone': 1800}
    detail = c.get(f'{ROOT}/sessions?{RANGE}&device=phone').json()['items'][0]
    assert detail['start'].startswith('2026-11-25T00:00:00')
    assert detail['original_start'].startswith('2026-11-24T23:30:00')
    assert detail['clipped'] is True


def test_replay_and_late_events_repair_long_interval(admin_login):
    c = admin_login
    own_user(c)
    initial = [event('mac', '2026-11-25T00:00:00+08:00', True),
               event('mac', '2026-11-25T10:00:00+08:00', False)]
    assert ingest(c, initial)['added'] == 2
    before = c.get(f'{ROOT}/overview?{RANGE}').json()
    assert before['summary']['seconds'] == 0
    assert before['quality']['long'] == 1
    late = [event('mac', '2026-11-25T01:00:00+08:00', False),
            event('mac', '2026-11-25T09:00:00+08:00', True)]
    assert ingest(c, late)['added'] == 2
    repaired = c.get(f'{ROOT}/overview?{RANGE}').json()
    assert repaired['summary']['seconds'] == 7200
    assert repaired['summary']['sessions'] == 2
    assert repaired['quality']['long'] == 0
    assert ingest(c, list(reversed(initial + late)))['added'] == 0
    assert c.get(f'{ROOT}/overview?{RANGE}').json()['summary'] == repaired['summary']


def test_system_short_open_and_long_records_are_explained(admin_login):
    c = admin_login
    own_user(c)
    ingest(c, [event('phone', '2026-11-25T08:00:00+08:00', True, 'com.apple.loginwindow'),
               event('phone', '2026-11-25T09:00:00+08:00', False, 'com.apple.loginwindow'),
               event('phone', '2026-11-25T09:00:00+08:00', True),
               event('phone', '2026-11-25T09:00:00.500000+08:00', False),
               event('phone', '2026-11-25T10:00:00+08:00', True),
               event('mac', '2026-11-25T00:00:00+08:00', True),
               event('mac', '2026-11-25T05:00:00+08:00', False)])
    result = c.get(f'{ROOT}/overview?{RANGE}').json()
    assert result['summary']['seconds'] == 0
    assert {k: result['quality'][k] for k in ['system', 'short', 'open', 'long']} == dict(system=1, short=1, open=1, long=1)
    rows = c.get(f'{ROOT}/sessions?{RANGE}&status=anomaly').json()
    assert rows['total'] == 2
    assert next(r for r in rows['items'] if r['status'] == 'open')['end'] is None


def test_missing_days_are_unknown_and_comparison_requires_observed_days(admin_login):
    c = admin_login
    own_user(c)
    assert c.get(f'{ROOT}/overview?{RANGE}').json()['daily'][0]['seconds'] is None
    ingest(c, [event('phone', '2026-11-25T08:00:00+08:00', True),
               event('phone', '2026-11-25T09:00:00+08:00', False)])
    data = c.get(f'{ROOT}/overview?start=2026-11-24&end=2026-11-26').json()
    assert [r['seconds'] for r in data['daily']] == [None, 3600, None]
    assert data['summary']['daily_average'] == 3600
    assert data['summary']['observed_days'] == 1
    assert data['comparison']['delta_percent'] is None


def test_personal_labels_categories_and_safe_csv(admin_login):
    c = admin_login
    own_user(c)
    ingest(c, [event('phone', '2026-11-25T08:00:00+08:00', True),
               event('phone', '2026-11-25T09:00:00+08:00', False)])
    assert c.put(ROOT + '/apps', json={'app': 'test.app', 'name': '=SUM(A1)', 'category': 'study'}).status_code == 200
    assert c.put(ROOT + '/devices/phone', json={'name': '个人手机'}).status_code == 200
    data = c.get(f'{ROOT}/overview?{RANGE}').json()
    assert data['apps'][0]['category'] == 'study'
    assert data['categories'] == [{'key': 'study', 'name': '学习', 'seconds': 3600}]
    exported = c.get(f'{ROOT}/export?{RANGE}&device=phone')
    assert exported.status_code == 200
    rows = list(csv.reader(io.StringIO(exported.text.lstrip('\ufeff'))))
    assert rows[1][0] == '个人手机'
    assert rows[1][1] == "'=SUM(A1)"
    assert float(rows[1][-1]) == 3600
    assert c.put(ROOT + '/apps', json={'app': 'unknown', 'name': '未知', 'category': 'study'}).status_code == 404


@pytest.mark.parametrize('bad', [
    {'time': '2026-11-25T08:00:00'}, {'time': '2099-01-01T00:00:00Z'},
    {'device': 'undeclared'}, {'starting': 'false'}, {'app': ' '},
])
def test_import_validation_is_atomic(admin_login, bad):
    c = admin_login
    own_user(c)
    body = payload([event('phone', '2026-11-25T08:00:00+08:00', True),
                    {**event('phone', '2026-11-25T09:00:00+08:00', False), **bad}])
    assert c.post(ROOT + '/imports', json=body).status_code == 422
    assert c.get(f'{ROOT}/overview?{RANGE}').json()['devices'] == []


def test_ranges_pagination_and_ownership(admin_login):
    c = admin_login
    _, first_id = own_user(c)
    ingest(c, [event('phone', '2026-11-25T08:00:00+08:00', True),
               event('phone', '2026-11-25T09:00:00+08:00', False)])
    for suffix in ['start=2026-11-26&end=2026-11-25', 'start=2020-01-01&end=2026-01-01',
                   'start=9999-12-31&end=9999-12-31']:
        assert c.get(f'{ROOT}/overview?{suffix}').status_code == 422
    assert c.get(f'{ROOT}/sessions?{RANGE}&limit=0').status_code == 422
    assert c.get(f'{ROOT}/sessions?{RANGE}&offset=1&limit=1').json()['items'] == []
    assert c.get(f'{ROOT}/sessions?{RANGE}&device=unavailable').status_code == 404
    c.post('/api/auth/login', json={'username': 'xiaoyao', 'password': 'admin123'})
    other_name, other_id = own_user(c)
    assert c.get(f'{ROOT}/overview?{RANGE}').json()['summary']['seconds'] == 0
    assert c.get(f'{ROOT}/sessions?{RANGE}').json()['items'] == []
    assert c.put(ROOT + '/devices/phone', json={'name': '不能修改他人设备'}).status_code == 404
    c.post('/api/auth/login', json={'username': 'xiaoyao', 'password': 'admin123'})
    assert c.put(f'/api/admin/users/{other_id}', json={'module_permissions': ['discipline'], 'data_permissions': {'discipline': 'read_only'}}).status_code == 200
    c.post('/api/auth/login', json={'username': other_name, 'password': 'test123'})
    assert c.get(f'{ROOT}/overview?{RANGE}').status_code == 200
    assert c.get(f'{ROOT}/export?{RANGE}').status_code == 200
    assert c.post(ROOT + '/imports', json=payload([event('phone', '2026-11-25T08:00:00+08:00', True)])).status_code == 403
    assert c.put(ROOT + '/apps', json={'app': 'test.app', 'name': '测试', 'category': 'work'}).status_code == 403
    c.post('/api/auth/logout')
    assert c.get(f'{ROOT}/overview?{RANGE}').status_code == 401


def test_replays_late_events_and_recalculation_preserve_totals(admin_login):
    c = admin_login
    own_user(c)
    original = [event('phone', '2026-11-25T08:00:00+08:00', True),
                event('phone', '2026-11-25T13:00:00+08:00', False)]
    assert ingest(c, original)['added'] == 2
    assert c.get(f'{ROOT}/overview?{RANGE}').json()['quality']['long'] == 1
    late = [event('phone', '2026-11-25T10:00:00+08:00', False),
            event('phone', '2026-11-25T11:00:00+08:00', True)]
    result = ingest(c, late + original)
    assert (result['added'], result['duplicates']) == (2, 2)
    summary = c.get(f'{ROOT}/overview?{RANGE}').json()['summary']
    assert summary['seconds'] == 4 * 3600
    assert summary['anomalies'] == 0
    assert summary['sessions'] == 2
    assert ingest(c, late + original)['added'] == 0
    assert c.get(f'{ROOT}/overview?{RANGE}').json()['summary'] == summary


def test_comparison_does_not_treat_missing_device_day_as_zero(admin_login):
    c = admin_login
    own_user(c)
    ingest(c, [event('phone', '2026-11-24T08:00:00+08:00', True),
               event('phone', '2026-11-24T09:00:00+08:00', False),
               event('phone', '2026-11-25T08:00:00+08:00', True),
               event('phone', '2026-11-25T10:00:00+08:00', False),
               event('mac', '2026-11-25T10:00:00+08:00', True),
               event('mac', '2026-11-25T11:00:00+08:00', False)])
    all_devices = c.get(f'{ROOT}/overview?{RANGE}').json()
    assert all_devices['comparison']['delta_percent'] is None
    phone = c.get(f'{ROOT}/overview?{RANGE}&device=phone').json()
    assert phone['comparison']['delta_percent'] == 100
    assert next(d for d in phone['devices'] if d['key'] == 'mac')['seconds'] == 3600
