from datetime import date, datetime, timedelta


def _create_account(client, name):
    r = client.post(
        "/api/ledger/accounts",
        json={"name": name, "account_type": "cash", "currency": "CNY", "initial_balance": 0},
    )
    assert r.status_code == 200
    return r.json()["id"]


def _create_category(client, name="reminder-cat"):
    r = client.post(
        "/api/ledger/categories",
        json={"name": name, "category_type": "expense", "sort_order": 1, "is_active": True},
    )
    assert r.status_code == 200
    return r.json()["id"]


def _create_rule(client, payload):
    r = client.post("/api/ledger/recurring/rules", json=payload)
    assert r.status_code == 200
    return r.json()


def _create_tx(client, payload):
    r = client.post("/api/ledger/transactions", json=payload)
    assert r.status_code == 200
    return r.json()


def test_ledger_recurring_reminders_split_upcoming_overdue_anomaly(admin_login):
    client = admin_login
    account_id = _create_account(client, "reminder-a1")
    category_id = _create_category(client)
    today = date.today()

    upcoming_rule = _create_rule(
        client,
        {
            "name": "Upcoming Rule",
            "rule_type": "expense",
            "frequency": "monthly",
            "interval_count": 1,
            "day_of_month": today.day,
            "start_date": str(today - timedelta(days=45)),
            "expected_amount": 66,
            "amount_tolerance": 0,
            "currency": "CNY",
            "account_id": account_id,
            "category_id": category_id,
            "transaction_type": "expense",
            "direction": "expense",
            "merchant": "UpcomingMerchant",
        },
    )

    anomaly_rule = _create_rule(
        client,
        {
            "name": "Anomaly Rule",
            "rule_type": "expense",
            "frequency": "monthly",
            "interval_count": 1,
            "day_of_month": today.day,
            "start_date": str(today - timedelta(days=65)),
            "expected_amount": 100,
            "amount_tolerance": 5,
            "currency": "CNY",
            "account_id": account_id,
            "category_id": category_id,
            "transaction_type": "expense",
            "direction": "expense",
            "merchant": "AnomalyMerchant",
        },
    )

    _create_tx(
        client,
        {
            "occurred_at": datetime.utcnow().replace(microsecond=0).isoformat(),
            "account_id": account_id,
            "category_id": category_id,
            "direction": "expense",
            "transaction_type": "expense",
            "amount": 120,
            "currency": "CNY",
            "merchant": "AnomalyMerchant",
        },
    )

    overdue_rule = _create_rule(
        client,
        {
            "name": "Overdue Rule",
            "rule_type": "expense",
            "frequency": "monthly",
            "interval_count": 1,
            "day_of_month": 1,
            "start_date": str(today - timedelta(days=180)),
            "expected_amount": 88,
            "amount_tolerance": 0,
            "currency": "CNY",
            "account_id": account_id,
            "category_id": category_id,
            "transaction_type": "expense",
            "direction": "expense",
            "merchant": "OverdueMerchant",
        },
    )

    old_tx = _create_tx(
        client,
        {
            "occurred_at": (datetime.utcnow() - timedelta(days=65)).replace(microsecond=0).isoformat(),
            "account_id": account_id,
            "category_id": category_id,
            "direction": "expense",
            "transaction_type": "expense",
            "amount": 88,
            "currency": "CNY",
            "merchant": "OverdueMerchant",
        },
    )

    mark = client.post(f"/api/ledger/recurring/{overdue_rule['id']}/match/{old_tx['id']}")
    assert mark.status_code == 200

    reminders = client.get("/api/ledger/recurring/reminders")
    assert reminders.status_code == 200
    payload = reminders.json()

    upcoming_ids = {x["rule_id"] for x in payload["upcoming"]}
    overdue_ids = {x["rule_id"] for x in payload["overdue"]}
    anomaly_ids = {x["rule_id"] for x in payload["amount_anomaly"]}

    assert upcoming_rule["id"] in upcoming_ids
    assert overdue_rule["id"] in overdue_ids
    assert anomaly_rule["id"] in anomaly_ids

    overview = client.get("/api/ledger/recurring/overview")
    assert overview.status_code == 200
    overview_payload = overview.json()
    assert overview_payload["upcoming_count"] >= 1
    assert overview_payload["overdue_count"] >= 1
    assert overview_payload["anomaly_count"] >= 1
