import uuid


def test_removed_server_monitor_routes_return_404(admin_login):
    client = admin_login

    assert client.get("/api/monitor/realtime").status_code == 404
    assert client.get("/api/monitor/history").status_code == 404
    assert client.get("/api/monitor/server-samples").status_code == 404
    assert client.get("/api/monitor/server-trend").status_code == 404


def test_monitor_admin_authz(admin_login):
    client = admin_login

    username = f"site_user_{uuid.uuid4().hex[:8]}"
    create_user = client.post("/api/admin/users", json={"username": username, "password": "u123456"})
    assert create_user.status_code == 200

    admin_sites = client.get("/api/monitor/sites")
    assert admin_sites.status_code == 200

    client.post("/api/auth/logout")
    user_login = client.post("/api/auth/login", json={"username": username, "password": "u123456"})
    assert user_login.status_code == 200

    user_sites = client.get("/api/monitor/sites")
    assert user_sites.status_code == 403
