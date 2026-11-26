import uuid
from datetime import date, datetime
import pytest
from services import discipline_service as service
from services.discipline_calendar import workday_reason


@pytest.fixture()
def clock(monkeypatch):
    value = [date(2026, 11, 25)]
    monkeypatch.setattr(service, 'china_today', lambda: value[0])
    return value


def slot(theme='学习工作', **extra):
    return {'start':'08:30', 'end':'11:30', 'theme':theme, 'status':'partial',
            'notes':'整理需求，临时处理事务', 'included':True, **extra}


def test_day_template_snapshot_and_conflict(admin_login, clock):
    c = admin_login
    day = clock[0].isoformat()
    initial = c.get(f'/api/discipline/days/{day}').json()
    saved = c.put(f'/api/discipline/days/{day}', json={'revision':initial['revision'], 'slots':[slot()]}).json()
    assert saved['slots'][0]['notes'] == slot()['notes']
    assert saved['achievement']['rate'] == 50
    template = c.get('/api/discipline/template').json()
    r = c.put('/api/discipline/template', json={'revision':template['revision'], 'slots':[slot('读书', id=saved['slots'][0]['id'], included=False)]})
    assert r.status_code == 200
    assert r.json()['slots'][0]['status'] == 'pending'
    assert r.json()['slots'][0]['notes'] == ''
    assert r.json()['slots'][0]['included'] is False
    synced = c.get(f'/api/discipline/days/{day}').json()
    assert synced['slots'][0]['theme'] == '读书'
    assert synced['slots'][0]['status'] == 'partial'
    assert synced['slots'][0]['notes'] == slot()['notes']
    other = c.get('/api/discipline/days/2026-11-26').json()
    assert other['slots'][0]['theme'] == '读书'
    assert other['achievement']['rate'] is None
    assert other['editable'] is False
    assert c.put(f'/api/discipline/days/{day}', json={'revision':initial['revision'],'slots':[]}).status_code == 409
    clock[0] = date(2026, 11, 26)
    assert c.get(f'/api/discipline/days/{day}').json()['editable'] is False
    assert c.put(f'/api/discipline/days/{day}', json={'revision':saved['revision'],'slots':[slot(status='aligned')]}).status_code == 403
    assert c.get(f'/api/discipline/days/{day}').json()['achievement']['rate'] is None


def test_validation(admin_login, clock):
    c = admin_login
    for slots in [[slot(end='07:00')], [slot(theme=' ')], [slot(), slot()], [slot(status='done')]]:
        assert c.put('/api/discipline/days/2026-11-25', json={'slots':slots}).status_code == 422
    assert c.get('/api/discipline/days/not-a-date').status_code == 422
    assert c.get('/api/discipline/calendar?year=2026&month=13').status_code == 422


def test_permissions_and_user_isolation(admin_login, clock):
    c = admin_login
    users = []
    for _ in range(2):
        username = f'discipline_{uuid.uuid4().hex[:8]}'
        r = c.post('/api/admin/users', json={'username':username,'password':'test123'})
        assert r.status_code == 200
        users.append((username,r.json()['id']))
    c.put(f'/api/admin/users/{users[0][1]}',json={'module_permissions':['discipline']})
    c.put(f'/api/admin/users/{users[1][1]}',json={'module_permissions':['notes']})
    c.post('/api/auth/login',json={'username':users[0][0],'password':'test123'})
    assert c.put('/api/discipline/days/2026-11-25',json={'slots':[slot()]}).status_code == 200
    c.post('/api/auth/login',json={'username':users[1][0],'password':'test123'})
    assert c.get('/api/discipline/calendar?year=2026&month=11').status_code == 403
    c.post('/api/auth/login',json={'username':'xiaoyao','password':'admin123'})
    c.put(f'/api/admin/users/{users[1][1]}',json={'module_permissions':['discipline'], 'data_permissions':{'discipline':'read_only'}})
    c.post('/api/auth/login',json={'username':users[1][0],'password':'test123'})
    r = c.get('/api/discipline/days/2026-11-25')
    assert r.status_code == 200
    assert r.json()['revision'] == 0
    assert c.get('/api/discipline/calendar?year=2026&month=11').json()['started_on'] is None
    assert c.put('/api/discipline/template',json={'slots':[]}).status_code == 403
    assert c.put('/api/discipline/days/2026-11-25',json={'slots':[]}).status_code == 403


@pytest.mark.parametrize('statuses,rate,grade', [
    (['aligned','partial'],75,'good'),
    (['aligned','aligned','off_track','off_track','off_track'],40,'improve'),
    (['aligned','partial','off_track','off_track'],37.5,'failed'),
    (['partial'],50,'improve'),
    (['pending'],0,'failed'),
    (['aligned','pending'],50,'improve'),
])
def test_score_boundaries(statuses, rate, grade):
    result = service.achievement([slot(status=status) for status in statuses] + [slot(status='off_track', included=False)])
    assert result['rate'] == rate
    assert result['grade'] == grade
    assert result['selected'] == len(statuses)
    assert service.achievement([slot(included=False)])['rate'] is None


@pytest.mark.parametrize('value,reason', [
    ('2026-01-01','holiday'), ('2026-02-16','holiday'), ('2026-06-19','holiday'),
    ('2026-09-25','holiday'), ('2026-10-07','holiday'), ('2026-10-10','weekend'),
    ('2026-11-25','workday'), ('2027-02-05','holiday'), ('2027-06-09','holiday'),
    ('2027-09-15','holiday'), ('2027-05-08','weekend'), ('2028-01-03','unknown_calendar'),
])
def test_workday_calendar(value, reason):
    assert workday_reason(date.fromisoformat(value)) == reason


def test_calendar_missed_days_and_freeze(admin_login, clock):
    c = admin_login
    # Own isolated user ensures no pre-existing history affects the start date.
    username = f'calendar_{uuid.uuid4().hex[:8]}'
    c.post('/api/admin/users',json={'username':username,'password':'test123'})
    c.post('/api/auth/login',json={'username':username,'password':'test123'})
    clock[0] = date(2026, 9, 24)
    assert c.put('/api/discipline/days/2026-09-24',json={'slots':[slot(status='aligned')]}).status_code == 200
    assert c.put('/api/discipline/days/2026-09-23',json={'slots':[slot()]}).status_code == 403
    assert c.put('/api/discipline/days/2026-09-28',json={'slots':[slot()]}).status_code == 403
    clock[0] = date(2026, 9, 29)
    calendar = c.get('/api/discipline/calendar?year=2026&month=9').json()
    days = {row['date']:row for row in calendar['days']}
    assert days['2026-09-23']['grade'] == 'not_started'
    assert days['2026-09-24']['rate'] == 100
    assert days['2026-09-25']['day_type'] == 'holiday'
    assert days['2026-09-27']['day_type'] == 'weekend'
    assert days['2026-09-28']['rate'] == 0
    assert days['2026-09-28']['counted'] is True
    assert days['2026-09-29']['grade'] == 'pending'
    assert days['2026-09-30']['grade'] == 'future'
    assert calendar['summary']['average_rate'] == 50
    assert calendar['summary']['counted_days'] == 2
    assert c.put('/api/discipline/days/2026-09-28',json={'slots':[slot(status='aligned')]}).status_code == 403
    assert c.put('/api/discipline/template',json={'slots':[slot(included=False)]}).status_code == 200
    history = c.get('/api/discipline/days/2026-09-28').json()
    assert history['slots'] == []
    assert history['achievement']['rate'] == 0
    assert c.get('/api/discipline/days/2026-09-24').json()['achievement']['rate'] == 100
    # Excluding every slot today doesn't change earlier scores.
    c.put('/api/discipline/days/2026-09-29',json={'slots':[slot(included=False)]})
    assert c.get('/api/discipline/calendar?year=2026&month=9').json()['summary']['average_rate'] == 50


def test_china_timezone(monkeypatch):
    from zoneinfo import ZoneInfo
    class FakeDatetime:
        @staticmethod
        def now(zone):
            return datetime(2026, 11, 25, 16, 1, tzinfo=ZoneInfo('UTC')).astimezone(zone)
    monkeypatch.setattr(service,'datetime',FakeDatetime)
    assert service.china_today() == date(2026,11,26)


def isolated_user(client):
    username = f'sync_{uuid.uuid4().hex[:8]}'
    assert client.post('/api/admin/users', json={'username':username,'password':'test123'}).status_code == 200
    assert client.post('/api/auth/login', json={'username':username,'password':'test123'}).status_code == 200
    return username


def test_template_sync_keeps_evaluation_adds_slots_and_freezes_history(admin_login, clock):
    c = admin_login
    isolated_user(c)
    clock[0] = date(2026,11,24)
    yesterday = c.put('/api/discipline/days/2026-11-24',json={'slots':[slot()]}).json()
    clock[0] = date(2026,11,25)
    template = c.get('/api/discipline/template').json()
    day = c.get('/api/discipline/days/2026-11-25').json()
    day['slots'][0].update(status='partial',notes='今天原有记录')
    saved = c.put('/api/discipline/days/2026-11-25',json=day).json()
    template['slots'].append(slot('晚间阅读',id='evening',start='20:00',end='21:00',status='pending',notes=''))
    r = c.put('/api/discipline/template',json={**template,'day_revision':saved['revision']})
    assert r.status_code == 200
    synced = r.json()['day']
    assert len(synced['slots']) == 7
    assert synced['revision'] == saved['revision'] + 1
    assert synced['slots'][0]['status'] == 'partial'
    assert synced['slots'][0]['notes'] == '今天原有记录'
    assert synced['slots'][-1]['theme'] == '晚间阅读'
    assert synced['slots'][-1]['status'] == 'pending'
    assert c.get('/api/discipline/days/2026-11-24').json()['slots'] == yesterday['slots']
    assert c.put('/api/discipline/days/2026-11-25',json=saved).status_code == 409


def test_template_sync_conflict_is_atomic_and_no_implicit_day_record(admin_login, clock):
    c = admin_login
    isolated_user(c)
    template = c.get('/api/discipline/template').json()
    initial = c.put('/api/discipline/template',json=template).json()
    assert initial['day']['saved'] is False
    assert initial['day']['revision'] == 0
    saved = c.put('/api/discipline/days/2026-11-25',json={'slots':[slot()]}).json()
    before = c.get('/api/discipline/template').json()
    history_before = c.get('/api/discipline/template/history').json()
    response = c.put('/api/discipline/template',json={**before,'day_revision':0})
    assert response.status_code == 409
    assert c.get('/api/discipline/template').json()['revision'] == before['revision']
    assert c.get('/api/discipline/days/2026-11-25').json()['revision'] == saved['revision']
    assert c.get('/api/discipline/template/history').json() == history_before
    # A replacement may reuse the deleted slot's time; old data lives in history.
    response = c.put('/api/discipline/template',json={'revision':before['revision'], 'slots':[slot(start='09:00',end='12:00')]})
    assert response.status_code == 200
    assert len(response.json()['day']['slots']) == 1
    assert response.json()['day']['slots'][0]['notes'] == ''
    snapshot = c.get(f"/api/discipline/template/history/{response.json()['revision']}").json()
    assert snapshot['day_before']['slots'] == saved['slots']


def test_routine_versions_and_day_snapshots_are_immutable_and_private(admin_login, clock):
    c = admin_login
    isolated_user(c)
    current = c.get('/api/discipline/template').json()
    baseline = c.get('/api/discipline/template/history').json()
    assert baseline['items'][0]['revision'] == 0
    assert baseline['items'][0]['changed_at'] is None
    saved = c.put('/api/discipline/days/2026-11-25',json={'slots':[slot(id='focus')]}).json()
    updated = c.put('/api/discipline/template',json={'revision':0,'day_revision':saved['revision'], 'slots':[slot('新主题',id='focus')]}).json()
    versions = c.get('/api/discipline/template/history').json()
    assert [item['revision'] for item in versions['items']] == [1,0]
    snapshot = c.get('/api/discipline/template/history/1').json()
    assert snapshot['kind'] == 'change'
    assert snapshot['changed_at'].endswith('+08:00')
    assert snapshot['effective_date'] == '2026-11-25'
    assert snapshot['before_slots'] == current['slots']
    assert snapshot['slots'][0]['theme'] == '新主题'
    assert snapshot['slots'][0]['status'] == 'pending'
    assert snapshot['day_before']['slots'] == saved['slots']
    assert snapshot['day_after']['slots'] == updated['day']['slots']
    assert snapshot['day_after']['slots'][0]['notes'] == slot()['notes']
    after = updated['day']
    after['slots'][0].update(status='aligned',notes='后来改动')
    saved_again = c.put('/api/discipline/days/2026-11-25',json=after).json()
    assert c.put('/api/discipline/template',json={'revision':1,'day_revision':saved_again['revision'],'slots':[slot('再次调整',id='focus')]}).status_code == 200
    assert c.get('/api/discipline/template/history/1').json() == snapshot
    assert c.get('/api/discipline/template/history?offset=1&limit=1').json()['items'][0]['revision'] == 1
    assert c.get('/api/discipline/template/history?limit=0').status_code == 422
    assert c.get('/api/discipline/template/history/999').status_code == 404
    c.post('/api/auth/login',json={'username':'xiaoyao','password':'admin123'})
    isolated_user(c)
    assert c.get('/api/discipline/template/history/1').status_code == 404
    assert c.get('/api/discipline/template/history').json()['total'] == 1
    c.post('/api/auth/logout')
    assert c.get('/api/discipline/template/history').status_code == 401


def test_legacy_routine_preserves_known_baseline_without_invented_history(admin_login, clock):
    import json
    import core.db as core_db
    from models.discipline import DisciplinePlan
    c = admin_login
    username = isolated_user(c)
    with core_db.SessionLocal() as db:
        db.add(DisciplinePlan(username=username,plan_key='template',slots_json=json.dumps([slot()]),revision=7))
        db.commit()
    old = c.get('/api/discipline/template/history/7').json()
    assert old['kind'] == 'baseline'
    assert old['changed_at'] is None
    template = c.get('/api/discipline/template').json()
    assert c.put('/api/discipline/template',json=template).status_code == 200
    assert [item['revision'] for item in c.get('/api/discipline/template/history').json()['items']] == [8,7]
    frozen = c.get('/api/discipline/template/history/7').json()
    assert frozen['slots'] == old['slots']
    assert frozen['changed_at'] is None


@pytest.mark.parametrize('deleted_status',['pending','aligned','partial','off_track'])
def test_delete_recorded_slot_then_add_replacement_at_same_time(admin_login, clock, deleted_status):
    c=admin_login
    isolated_user(c)
    slots=[slot('保留段',id='keep',start='08:00',end='10:00',status='aligned',notes='保留的内容'),
           slot('删除段',id='delete',start='10:00',end='12:00',status=deleted_status,notes='已删除段的原记录')]
    initial=c.put('/api/discipline/template',json={'slots':slots}).json()
    day=c.put('/api/discipline/days/2026-11-25',json={'slots':slots}).json()
    deleted=c.put('/api/discipline/template',json={'revision':initial['revision'],'day_revision':day['revision'],'slots':[slots[0]]})
    assert deleted.status_code==200
    assert [item['id'] for item in deleted.json()['day']['slots']]==['keep']
    archived=c.get(f"/api/discipline/template/history/{deleted.json()['revision']}").json()
    assert archived['day_before']['slots'][1]['notes']=='已删除段的原记录'
    assert archived['day_before']['slots'][1]['status']==deleted_status
    assert len(archived['day_after']['slots'])==1
    replacement=slot('新建段',id='replacement',start='10:00',end='12:00')
    added=c.put('/api/discipline/template',json={'revision':deleted.json()['revision'], 'day_revision':deleted.json()['day']['revision'], 'slots':[slots[0],replacement]})
    assert added.status_code==200
    assert [item['id'] for item in added.json()['day']['slots']]==['keep','replacement']
    assert added.json()['day']['slots'][0]['notes']=='保留的内容'
    assert added.json()['day']['slots'][0]['status']=='aligned'
    assert added.json()['day']['slots'][1]['notes']==''
    assert added.json()['day']['slots'][1]['status']=='pending'
    assert c.get(f"/api/discipline/template/history/{deleted.json()['revision']}").json()==archived
    history=c.get('/api/discipline/template/history').json()
    assert c.put('/api/discipline/template',json={'revision':added.json()['revision'],'slots':[replacement,slot(start='11:00',end='13:00')]}).status_code==422
    assert c.get('/api/discipline/template/history').json()==history
