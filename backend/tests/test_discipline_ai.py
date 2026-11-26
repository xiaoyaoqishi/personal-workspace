import json
import threading
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
import pytest
from core import context, db as database
from models.auth import User
from models.discipline import DisciplinePlan
from models.discipline_ai import DisciplineAIReport, DisciplineAISetting
from models.discipline_screen import ScreenImport
from schemas.discipline_ai import AIGenerate
from services.discipline_ai import jobs, provider, service, snapshot
from tests.test_discipline_screen import event, ingest, own_user

ROOT = '/api/discipline/ai'
QUERY = '?period=day&anchor=2026-11-25'
BODY = {'period': 'day', 'anchor': '2026-11-25', 'focus': 'balanced', 'detail': 'concise'}


@pytest.fixture(autouse=True)
def isolated_provider(monkeypatch):
    # Tests never contact the configured real provider or run a background worker.
    monkeypatch.setattr(provider, 'configuration', lambda: {'api_key': 'synthetic-secret', 'model': 'test-model'})
    monkeypatch.setattr(jobs, 'start', lambda: (threading.Event(), threading.Event(), Mock()))
    yield
    with database.SessionLocal() as db:
        db.query(DisciplineAIReport).delete()
        db.query(DisciplineAISetting).delete()
        db.commit()


def material():
    return {'title': '从记录找到下一步', 'summary': '依据已保存记录进行复盘，缺失不表示零使用。',
        'strengths': [], 'attention': [], 'patterns': [],
        'actions': [{'title': '核对计划', 'body': '今天结束时评价当天的一个时段。', 'kind': 'hypothesis', 'evidence_ids': ['screen-summary']}]}


def seed(c):
    owner, user_id = own_user(c)
    ingest(c, [event('mac', '2026-11-25T08:00:00+08:00', True), event('mac', '2026-11-25T09:00:00+08:00', False),
               event('phone', '2026-11-25T08:00:00+08:00', True), event('phone', '2026-11-25T09:00:00+08:00', False)])
    return owner, user_id


def complete(c, monkeypatch):
    stub = Mock(return_value=(material(), {'total_tokens': 200, 'prompt_tokens': 100, 'completion_tokens': 100}))
    monkeypatch.setattr(provider, 'generate', stub)
    response = c.post(ROOT + '/reports', json=BODY)
    assert response.status_code == 200, response.text
    key = response.json()['id']
    jobs.run_report(key)
    return c.get(ROOT + '/reports/' + key).json(), stub


def test_gets_are_read_only_and_no_secret_is_returned(admin_login, monkeypatch):
    c = admin_login; seed(c)
    stub = Mock(); monkeypatch.setattr(provider, 'generate', stub)
    for path in ['/overview' + QUERY, '/settings', '/history']:
        response = c.get(ROOT + path)
        assert response.status_code == 200, response.text
        assert 'synthetic-secret' not in response.text and 'api_key' not in response.text
    assert c.get(ROOT + '/overview' + QUERY).json()['report'] is None
    with database.SessionLocal() as db:
        assert db.query(DisciplineAIReport).count() == 0
    stub.assert_not_called()


def test_snapshot_math_notes_opt_in_and_late_data_preserves_report(admin_login, monkeypatch):
    c = admin_login; owner, _ = seed(c)
    with database.SessionLocal() as db:
        db.add(DisciplinePlan(username=owner, plan_key='2026-11-25', revision=1, slots_json=json.dumps([
            {'id': 's1', 'start': '08:00', 'end': '09:00', 'theme': '阅读', 'included': True, 'status': 'pending', 'notes': 'PRIVATE-NOTE-' + '字'*300}])))
        db.commit()
    source = c.get(ROOT + '/overview' + QUERY).json()['source']
    assert source['metrics']['screen_seconds'] == 7200
    assert source['metrics']['unique_seconds'] == 3600
    assert source['metrics']['plan_pending'] == 1
    assert 'PRIVATE-NOTE' not in json.dumps(source)
    report, _ = complete(c, monkeypatch)
    assert report['status'] == 'success' and report['stale'] is False
    ingest(c, [event('mac', '2026-11-25T10:00:00+08:00', True), event('mac', '2026-11-25T10:10:00+08:00', False)])
    updated = c.get(ROOT + '/overview' + QUERY).json()
    assert updated['stale'] is True
    assert updated['source']['metrics']['screen_seconds'] == 7800
    assert updated['report']['snapshot']['metrics']['screen_seconds'] == 7200
    c.put(ROOT + '/settings', json={'include_notes': True})
    included = c.get(ROOT + '/overview' + QUERY).json()['source']
    assert 'PRIVATE-NOTE-' in json.dumps(included, ensure_ascii=False)
    assert '字'*241 not in json.dumps(included, ensure_ascii=False)


def test_idempotency_regeneration_history_and_failed_attempt_keep_previous(admin_login, monkeypatch):
    c = admin_login; seed(c)
    first, stub = complete(c, monkeypatch)
    response = c.post(ROOT + '/reports', json=BODY).json()
    assert response['id'] == first['id'] and response['reused'] is True
    assert stub.call_count == 1
    jobs.run_report(first['id'])
    assert stub.call_count == 1  # an already claimed/completed task is never billed twice
    regenerate = c.post(ROOT + '/reports', json={**BODY, 'regenerate': True}).json()
    assert regenerate['id'] != first['id']
    duplicate = c.post(ROOT + '/reports', json={**BODY, 'regenerate': True}).json()
    assert duplicate['id'] == regenerate['id'] and duplicate['reused'] is True
    monkeypatch.setattr(provider, 'generate', Mock(side_effect=provider.ProviderError('invalid_output', '报告校验失败')))
    jobs.run_report(regenerate['id'])
    result = c.get(ROOT + '/overview' + QUERY).json()
    assert result['report']['id'] == first['id']
    assert result['latest_attempt']['status'] == 'failed'
    assert len(c.get(ROOT + '/history').json()['items']) == 2


def test_owner_isolation_and_readonly_collector_scopes(admin_login, monkeypatch):
    c = admin_login; owner, user_id = seed(c)
    report, stub = complete(c, monkeypatch)
    credential = c.post('/api/discipline/screen/collectors', json={'name': 'test'}).json()
    headers = {'Authorization': 'Bearer ' + credential['token']}
    assert c.get(ROOT + '/overview' + QUERY, headers=headers).status_code == 403
    c.post('/api/auth/login', json={'username': 'xiaoyao', 'password': 'admin123'})
    c.put('/api/admin/users/' + str(user_id), json={'data_permissions': {'discipline': 'read_only'}})
    c.post('/api/auth/login', json={'username': owner, 'password': 'test123'})
    assert c.get(ROOT + '/overview' + QUERY).status_code == 200
    assert c.post(ROOT + '/reports', json=BODY).status_code == 403
    assert c.put(ROOT + '/settings', json={'automatic': True}).status_code == 403
    c.post('/api/auth/login', json={'username': 'xiaoyao', 'password': 'admin123'})
    own_user(c)
    assert c.get(ROOT + '/reports/' + report['id']).status_code == 404
    assert c.get(ROOT + '/history').json()['items'] == []
    assert stub.call_count == 1


def test_queued_permission_revocation_prevents_provider_call(admin_login, monkeypatch):
    c = admin_login; owner, _ = seed(c)
    report = c.post(ROOT + '/reports', json=BODY).json()
    with database.SessionLocal() as db:
        db.query(User).filter_by(username=owner).update({'is_active': False}); db.commit()
    stub = Mock(); monkeypatch.setattr(provider, 'generate', stub)
    jobs.run_report(report['id'])
    stub.assert_not_called()
    with database.SessionLocal() as db:
        row = db.get(DisciplineAIReport, report['id'])
        assert row.status == 'failed' and row.active_key is None


def test_invalid_evidence_and_provider_errors_never_return_key(monkeypatch):
    content = material(); content['actions'][0]['evidence_ids'] = ['invented']
    with pytest.raises(provider.ProviderError):
        provider.validate_content(content, {'evidence': [{'id': 'screen-summary'}]})
    locked = material(); locked['actions'][0]['body'] = '明早给昨天未评价的时段补自评。'
    with pytest.raises(provider.ProviderError):
        provider.validate_content(locked, {'evidence': [{'id': 'screen-summary'}]})
    response = Mock(status_code=401)
    response.text = 'synthetic-secret'
    client = Mock(); client.__enter__ = Mock(return_value=client); client.__exit__ = Mock(return_value=False)
    client.post.return_value = response
    monkeypatch.setattr(provider.httpx, 'Client', Mock(return_value=client))
    with pytest.raises(provider.ProviderError) as raised:
        provider.generate({'start': '2026-11-25', 'end': '2026-11-25', 'metrics': {}, 'quality': {}, 'evidence': []}, {'detail': 'concise'})
    assert raised.value.code == 'credential' and 'synthetic-secret' not in str(raised.value)


def test_malformed_json_is_repaired_once_and_all_returned_usage_is_counted(monkeypatch):
    def response(content):
        row = Mock(status_code=200)
        row.json.return_value = {'choices': [{'finish_reason': 'stop', 'message': {'content': content}}],
                                 'usage': {'prompt_tokens': 100, 'completion_tokens': 20, 'total_tokens': 120}}
        return row
    client = Mock(); client.__enter__ = Mock(return_value=client); client.__exit__ = Mock(return_value=False)
    client.post.side_effect = [response('   '), response(json.dumps(material()))]
    monkeypatch.setattr(provider.httpx, 'Client', Mock(return_value=client))
    source = {'start': '2026-11-25', 'end': '2026-11-25', 'metrics': {}, 'quality': {}, 'evidence': [{'id': 'screen-summary'}]}
    content, usage = provider.generate(source, {'detail': 'concise'})
    assert content['title'] == material()['title'] and client.post.call_count == 2
    assert usage['total_tokens'] == 240


def test_interrupted_task_releases_active_slot_and_daily_quota_is_enforced(admin_login):
    c = admin_login; owner, _ = seed(c)
    report = c.post(ROOT + '/reports', json=BODY).json()
    with database.SessionLocal() as db:
        row = db.get(DisciplineAIReport, report['id'])
        row.status = 'running'; row.lease_until = (datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat(); db.commit()
        jobs.expire_jobs(db)
        db.refresh(row)
        assert row.status == 'failed' and row.active_key is None
        base = {column.name: getattr(row, column.name) for column in DisciplineAIReport.__table__.columns}
        for index in range(19):
            db.add(DisciplineAIReport(**{**base, 'id': f'{index:032x}'}))
        db.commit()
    assert c.post(ROOT + '/reports', json={**BODY, 'regenerate': True}).status_code == 429


def test_incomplete_periods_no_data_and_configuration_are_explicit(admin_login, monkeypatch):
    c = admin_login; own_user(c)
    assert c.post(ROOT + '/reports', json=BODY).status_code == 409
    today = datetime.now(snapshot.settings.timezone).date().isoformat()
    assert c.get(ROOT + '/overview?period=day&anchor=' + today).status_code == 422
    assert c.get(ROOT + '/overview?period=week&anchor=' + today).status_code == 422
    monkeypatch.setattr(provider, 'configuration', lambda: {'api_key': '', 'model': 'test'})
    assert c.post(ROOT + '/reports', json=BODY).status_code == 503


def test_weekend_scores_and_automatic_quiet_period_once_per_day(admin_login, monkeypatch):
    c = admin_login; owner, _ = seed(c)
    with database.SessionLocal() as db:
        db.add(DisciplinePlan(username=owner, plan_key='2026-11-21', revision=1, slots_json=json.dumps([
            {'id': 's', 'start': '08:00', 'end': '09:00', 'theme': '阅读', 'included': True, 'status': 'aligned', 'notes': ''}])))
        db.commit()
    week = c.get(ROOT + '/overview?period=week&anchor=2026-11-21').json()['source']
    assert week['start'] == '2026-11-16' and week['end'] == '2026-11-22'
    assert next(day for day in week['days'] if day['date'] == '2026-11-21')['rate'] is None
    c.put(ROOT + '/settings', json={'automatic': True})
    jobs.automatic_tick()
    assert c.get(ROOT + '/history').json()['items'] == []  # recent batch is still settling
    with database.SessionLocal() as db:
        db.query(ScreenImport).filter_by(username=owner).update({'imported_at': (datetime.now(timezone.utc)-timedelta(seconds=120)).isoformat()})
        db.commit()
    jobs.automatic_tick(); jobs.automatic_tick()
    items = c.get(ROOT + '/history').json()['items']
    assert len(items) == 1 and items[0]['origin'] == 'automatic'
