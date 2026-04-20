from datetime import date, datetime, timedelta
import uuid


def _create_account(client, name):
    r = client.post(
        "/api/ledger/accounts",
        json={"name": name, "account_type": "cash", "currency": "CNY", "initial_balance": 0},
    )
    assert r.status_code == 200
    return r.json()["id"]


def _create_category(client, name="recurring-cat"):
    r = client.post(
        "/api/ledger/categories",
        json={"name": name, "category_type": "expense", "sort_order": 1, "is_active": True},
    )
    assert r.status_code == 200
    return r.json()["id"]


def test_ledger_recurring_rule_crud_and_draft(admin_login):
    client = admin_login
    account_id = _create_account(client, "recurring-a1")
    category_id = _create_category(client)

    today = date.today()
    create = client.post(
        "/api/ledger/recurring/rules",
        json={
            "name": "Netflix",
            "is_active": True,
            "rule_type": "subscription",
            "frequency": "monthly",
            "interval_count": 1,
            "day_of_month": 31,
            "start_date": str(today - timedelta(days=40)),
            "expected_amount": 68,
            "amount_tolerance": 2,
            "currency": "CNY",
            "account_id": account_id,
            "category_id": category_id,
            "transaction_type": "expense",
            "direction": "expense",
            "merchant": "NETFLIX",
        },
    )
    assert create.status_code == 200
    row = create.json()
    assert row["id"] > 0
    assert row["next_due_date"]

    rule_id = row["id"]

    listed = client.get("/api/ledger/recurring/rules")
    assert listed.status_code == 200
    assert any(x["id"] == rule_id for x in listed.json()["items"])

    updated = client.put(
        f"/api/ledger/recurring/rules/{rule_id}",
        json={"frequency": "weekly", "weekday": today.weekday(), "day_of_month": None},
    )
    assert updated.status_code == 200
    assert updated.json()["frequency"] == "weekly"
    assert updated.json()["weekday"] == today.weekday()

    draft = client.post(f"/api/ledger/recurring/{rule_id}/draft", json={})
    assert draft.status_code == 200
    draft_payload = draft.json()
    assert draft_payload["account_id"] == account_id
    assert draft_payload["transaction_type"] == "expense"
    assert draft_payload["source"] == "manual"

    deleted = client.delete(f"/api/ledger/recurring/rules/{rule_id}")
    assert deleted.status_code == 200


def test_ledger_recurring_schedule_and_match_binding(admin_login):
    client = admin_login
    account_id = _create_account(client, "recurring-a2")
    category_id = _create_category(client, "recurring-c2")

    today = date.today()
    rule_resp = client.post(
        "/api/ledger/recurring/rules",
        json={
            "name": "Phone Bill",
            "is_active": True,
            "rule_type": "expense",
            "frequency": "monthly",
            "interval_count": 1,
            "day_of_month": today.day,
            "start_date": str(today - timedelta(days=100)),
            "expected_amount": 120,
            "amount_tolerance": 0,
            "currency": "CNY",
            "account_id": account_id,
            "category_id": category_id,
            "transaction_type": "expense",
            "direction": "expense",
            "merchant": "Carrier",
        },
    )
    assert rule_resp.status_code == 200
    rule = rule_resp.json()
    rule_id = rule["id"]

    tx_resp = client.post(
        "/api/ledger/transactions",
        json={
            "occurred_at": datetime.utcnow().replace(microsecond=0).isoformat(),
            "account_id": account_id,
            "category_id": category_id,
            "direction": "expense",
            "transaction_type": "expense",
            "amount": 120,
            "currency": "CNY",
            "merchant": "Carrier",
        },
    )
    assert tx_resp.status_code == 200
    tx_id = tx_resp.json()["id"]

    mark = client.post(f"/api/ledger/recurring/{rule_id}/match/{tx_id}")
    assert mark.status_code == 200
    assert mark.json()["ok"] is True

    tx_detail = client.get(f"/api/ledger/transactions/{tx_id}")
    assert tx_detail.status_code == 200
    assert tx_detail.json()["recurring_rule_id"] == rule_id


def test_ledger_recurring_owner_isolated(admin_login):
    client = admin_login
    account_id = _create_account(client, "recurring-admin-a")

    create = client.post(
        "/api/ledger/recurring/rules",
        json={
            "name": "Admin recurring",
            "rule_type": "expense",
            "frequency": "monthly",
            "interval_count": 1,
            "day_of_month": 10,
            "start_date": "2026-01-01",
            "account_id": account_id,
            "transaction_type": "expense",
            "direction": "expense",
            "currency": "CNY",
        },
    )
    assert create.status_code == 200

    username = f"ledger_recurring_{uuid.uuid4().hex[:8]}"
    create_user = client.post("/api/admin/users", json={"username": username, "password": "u123456"})
    assert create_user.status_code == 200

    client.post("/api/auth/logout")
    login_user = client.post("/api/auth/login", json={"username": username, "password": "u123456"})
    assert login_user.status_code == 200

    listed = client.get("/api/ledger/recurring/rules")
    assert listed.status_code == 200
    names = [x["name"] for x in listed.json()["items"]]
    assert "Admin recurring" not in names
