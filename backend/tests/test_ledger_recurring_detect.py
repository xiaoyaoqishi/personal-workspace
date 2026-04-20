from datetime import datetime, timedelta


def _create_account(client, name):
    r = client.post(
        "/api/ledger/accounts",
        json={"name": name, "account_type": "cash", "currency": "CNY", "initial_balance": 0},
    )
    assert r.status_code == 200
    return r.json()["id"]


def _create_category(client, name="detect-cat"):
    r = client.post(
        "/api/ledger/categories",
        json={"name": name, "category_type": "expense", "sort_order": 1, "is_active": True},
    )
    assert r.status_code == 200
    return r.json()["id"]


def test_ledger_recurring_detect_candidates(admin_login):
    client = admin_login
    account_id = _create_account(client, "detect-a1")
    category_id = _create_category(client)

    base = datetime.utcnow().replace(microsecond=0) - timedelta(days=70)
    for i in range(6):
        occurred = base + timedelta(days=7 * i)
        tx = client.post(
            "/api/ledger/transactions",
            json={
                "occurred_at": occurred.isoformat(),
                "account_id": account_id,
                "category_id": category_id,
                "direction": "expense",
                "transaction_type": "expense",
                "amount": 29.9,
                "currency": "CNY",
                "merchant": "MusicPlus",
            },
        )
        assert tx.status_code == 200

    detect = client.post(
        "/api/ledger/recurring/detect",
        json={
            "lookback_days": 180,
            "min_occurrences": 3,
            "account_id": account_id,
            "direction": "expense",
            "transaction_type": "expense",
        },
    )
    assert detect.status_code == 200
    candidates = detect.json()["candidates"]
    assert len(candidates) >= 1

    target = next((x for x in candidates if x["merchant"] == "MusicPlus"), None)
    assert target is not None
    assert target["estimated_frequency"] == "weekly"
    assert target["occurrences"] >= 6
    assert target["account_id"] == account_id
