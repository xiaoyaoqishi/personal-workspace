import uuid


def test_knowledge_category_create_list_delete(admin_login):
    client = admin_login

    create = client.post('/api/knowledge-items/categories', json={'name': 'my_strategy'})
    assert create.status_code == 200
    assert create.json()['name'] == 'my_strategy'

    listed = client.get('/api/knowledge-items/categories')
    assert listed.status_code == 200
    assert 'my_strategy' in listed.json()['items']

    deleted = client.delete('/api/knowledge-items/categories/my_strategy')
    assert deleted.status_code == 200

    listed_after = client.get('/api/knowledge-items/categories')
    assert listed_after.status_code == 200
    assert 'my_strategy' not in listed_after.json()['items']


def test_knowledge_category_delete_builtin_and_in_use(admin_login):
    client = admin_login

    builtin_del = client.delete('/api/knowledge-items/categories/pattern_dictionary')
    assert builtin_del.status_code == 400

    create = client.post('/api/knowledge-items/categories', json={'name': 'in_use_cat'})
    assert create.status_code == 200

    item = client.post('/api/knowledge-items', json={'category': 'in_use_cat', 'title': 'item-1'})
    assert item.status_code == 200

    in_use_del = client.delete('/api/knowledge-items/categories/in_use_cat')
    assert in_use_del.status_code == 400


def test_knowledge_category_owner_scoped(admin_login):
    client = admin_login

    create = client.post('/api/knowledge-items/categories', json={'name': 'admin_private_cat'})
    assert create.status_code == 200

    username = f'kcat_{uuid.uuid4().hex[:8]}'
    create_user = client.post('/api/admin/users', json={'username': username, 'password': 'u123456'})
    assert create_user.status_code == 200

    client.post('/api/auth/logout')
    login_user = client.post('/api/auth/login', json={'username': username, 'password': 'u123456'})
    assert login_user.status_code == 200

    user_categories = client.get('/api/knowledge-items/categories')
    assert user_categories.status_code == 200
    assert 'admin_private_cat' not in user_categories.json()['items']

    user_create = client.post('/api/knowledge-items/categories', json={'name': 'user_cat'})
    assert user_create.status_code == 200

    user_list_after = client.get('/api/knowledge-items/categories')
    assert user_list_after.status_code == 200
    assert 'user_cat' in user_list_after.json()['items']
