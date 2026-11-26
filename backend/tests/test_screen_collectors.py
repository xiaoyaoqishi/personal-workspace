import uuid
import pytest
from tests.test_discipline_screen import event, payload, own_user, ROOT, RANGE


def create(c):
    response = c.post(ROOT+'/collectors', json={'name':'测试Mac'})
    assert response.status_code == 200, response.text
    return response.json()


def test_scoped_token_uploads_without_cookie_and_cannot_read_other_apis(admin_login):
    c = admin_login
    username, _ = own_user(c)
    credential = create(c)
    headers={'Authorization':'Bearer '+credential['token']}
    listing=c.get(ROOT+'/collectors').json()['items']
    assert listing[0]['id']==credential['id']
    assert 'token' not in listing[0] and 'token_hash' not in listing[0]
    c.post('/api/auth/logout')
    assert c.get(ROOT+'/collector/status',headers=headers).json()['username']==username
    body=payload([event('phone','2026-11-25T08:00:00+08:00',True),event('phone','2026-11-25T08:10:00+08:00',False)])
    response=c.post(ROOT+'/collector/imports',headers=headers,json=body)
    assert response.status_code==200, response.text
    assert response.json()['added']==2
    assert c.post(ROOT+'/collector/imports',headers=headers,json=body).json()['added']==0
    status=c.get(ROOT+'/collector/status',headers=headers).json()
    assert status['events_added']==2 and status['last_upload_at']
    for path in [ROOT+'/overview?'+RANGE,ROOT+'/collectors','/api/trades','/api/admin/users','/api/auth/check']:
        assert c.get(path,headers=headers).status_code==403
    assert c.post(ROOT+'/collectors',headers=headers,json={'name':'不能创建凭证'}).status_code==403
    assert c.get(ROOT+'/collector/imports',headers=headers).status_code==405
    assert c.get(ROOT+'/collector/status').status_code==401


def test_revocation_owner_isolation_and_account_changes_take_effect(admin_login):
    c=admin_login
    username,user_id=own_user(c)
    credential=create(c)
    headers={'Authorization':'Bearer '+credential['token']}
    c.post('/api/auth/login',json={'username':'xiaoyao','password':'admin123'})
    own_user(c)
    assert c.delete(ROOT+'/collectors/'+credential['id']).status_code==404
    c.post('/api/auth/login',json={'username':'xiaoyao','password':'admin123'})
    c.put(f'/api/admin/users/{user_id}',json={'data_permissions':{'discipline':'read_only'}})
    assert c.get(ROOT+'/collector/status',headers=headers).status_code==403
    c.put(f'/api/admin/users/{user_id}',json={'data_permissions':{'discipline':'read_write'},'module_permissions':['notes']})
    assert c.get(ROOT+'/collector/status',headers=headers).status_code==403
    c.put(f'/api/admin/users/{user_id}',json={'module_permissions':['discipline']})
    assert c.get(ROOT+'/collector/status',headers=headers).status_code==200
    c.post('/api/auth/login',json={'username':username,'password':'test123'})
    assert c.delete(ROOT+'/collectors/'+credential['id']).status_code==200
    assert c.get(ROOT+'/collector/status',headers=headers).status_code==401


@pytest.mark.parametrize('value',['Bearer dsc_bad','Bearer dsc_'+'0'*32+'.'+'x'*43,'Basic wrong',''])
def test_invalid_tokens_never_fall_back_to_admin_cookie(admin_login,value):
    assert admin_login.get(ROOT+'/collector/status',headers={'Authorization':value}).status_code==401
