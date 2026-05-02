from __future__ import annotations

from datetime import date, timedelta
import uuid


def _asset_payload(name: str, **overrides):
    today = date.today()
    payload = {
        "name": name,
        "asset_type": "electronics",
        "category": "device",
        "status": "draft",
        "brand": "Apple",
        "model": "MacBook Pro",
        "purchase_channel": "apple-store",
        "purchase_date": (today - timedelta(days=10)).isoformat(),
        "purchase_price": 1000,
        "extra_cost": 50,
        "target_daily_cost": 20,
        "expected_use_days": 120,
        "usage_count": 0,
        "include_in_net_worth": True,
        "tags": ["work", "laptop"],
        "images": ["cover.png"],
        "note": "test asset",
    }
    payload.update(overrides)
    return payload


def _create_asset(client, **overrides):
    name = overrides.pop("name", f"asset-{uuid.uuid4().hex[:8]}")
    resp = client.post("/api/ledger/assets", json=_asset_payload(name=name, **overrides))
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_user_and_login(client):
    username = f"asset_user_{uuid.uuid4().hex[:8]}"
    create_user = client.post("/api/admin/users", json={"username": username, "password": "u123456"})
    assert create_user.status_code == 200
    client.post("/api/auth/logout")
    login_user = client.post("/api/auth/login", json={"username": username, "password": "u123456"})
    assert login_user.status_code == 200
    return username


def test_ledger_assets_create_list_detail_update_soft_delete_flow(admin_login):
    client = admin_login

    create_resp = _create_asset(client)
    asset_id = create_resp["id"]
    assert create_resp["tags"] == ["work", "laptop"]
    assert create_resp["images"] == ["cover.png"]

    listing = client.get("/api/ledger/assets")
    assert listing.status_code == 200
    assert any(item["id"] == asset_id for item in listing.json()["items"])

    detail = client.get(f"/api/ledger/assets/{asset_id}")
    assert detail.status_code == 200
    metrics = detail.json()["metrics"]
    assert metrics["total_cost"] == 1050.0
    assert metrics["cash_daily_cost"] is not None
    assert metrics["holding_days"] is not None

    update = client.put(
        f"/api/ledger/assets/{asset_id}",
        json={"status": "idle", "location": "desk", "tags": ["updated"], "images": ["new.png"]},
    )
    assert update.status_code == 200
    updated_payload = update.json()
    assert updated_payload["status"] == "idle"
    assert updated_payload["location"] == "desk"
    assert updated_payload["tags"] == ["updated"]
    assert updated_payload["images"] == ["new.png"]

    delete_resp = client.delete(f"/api/ledger/assets/{asset_id}")
    assert delete_resp.status_code == 200
    assert delete_resp.json()["ok"] is True

    listing_after_delete = client.get("/api/ledger/assets")
    assert listing_after_delete.status_code == 200
    assert all(item["id"] != asset_id for item in listing_after_delete.json()["items"])

    deleted_listing = client.get("/api/ledger/assets", params={"include_deleted": True})
    assert deleted_listing.status_code == 200
    assert any(item["id"] == asset_id for item in deleted_listing.json()["items"])

    deleted_detail = client.get(f"/api/ledger/assets/{asset_id}")
    assert deleted_detail.status_code == 404


def test_ledger_asset_events_update_status_cost_usage_and_delete_does_not_roll_back(admin_login):
    client = admin_login
    asset = _create_asset(client, status="draft", extra_cost=10, usage_count=2, start_use_date=None)
    asset_id = asset["id"]
    today = date.today()

    start_use = client.post(
        f"/api/ledger/assets/{asset_id}/events",
        json={"event_type": "start_use", "event_date": today.isoformat(), "title": "Start use", "metadata": {"source": "manual"}},
    )
    assert start_use.status_code == 200
    assert start_use.json()["metadata"] == {"source": "manual"}

    repair = client.post(
        f"/api/ledger/assets/{asset_id}/events",
        json={"event_type": "repair", "event_date": today.isoformat(), "title": "Repair", "amount": 30},
    )
    accessory = client.post(
        f"/api/ledger/assets/{asset_id}/events",
        json={"event_type": "accessory", "event_date": today.isoformat(), "title": "Accessory", "amount": 20},
    )
    usage = client.post(
        f"/api/ledger/assets/{asset_id}/events",
        json={"event_type": "usage", "event_date": today.isoformat(), "title": "Usage +1"},
    )
    idle = client.post(
        f"/api/ledger/assets/{asset_id}/events",
        json={"event_type": "idle", "event_date": today.isoformat(), "title": "Idle"},
    )
    assert repair.status_code == 200
    assert accessory.status_code == 200
    assert usage.status_code == 200
    assert idle.status_code == 200

    detail_after_idle = client.get(f"/api/ledger/assets/{asset_id}")
    assert detail_after_idle.status_code == 200
    payload = detail_after_idle.json()
    assert payload["status"] == "idle"
    assert payload["start_use_date"] == today.isoformat()
    assert payload["extra_cost"] == 60.0
    assert payload["usage_count"] == 3

    delete_idle = client.delete(f"/api/ledger/assets/{asset_id}/events/{idle.json()['id']}")
    assert delete_idle.status_code == 200

    detail_after_delete_idle = client.get(f"/api/ledger/assets/{asset_id}")
    assert detail_after_delete_idle.status_code == 200
    assert detail_after_delete_idle.json()["status"] == "idle"

    resume = client.post(
        f"/api/ledger/assets/{asset_id}/events",
        json={"event_type": "resume", "event_date": today.isoformat(), "title": "Resume"},
    )
    assert resume.status_code == 200

    final_detail = client.get(f"/api/ledger/assets/{asset_id}")
    assert final_detail.status_code == 200
    assert final_detail.json()["status"] == "in_use"


def test_ledger_asset_valuation_route_and_event_type_removed(admin_login):
    client = admin_login
    asset = _create_asset(client)
    asset_id = asset["id"]
    today = date.today().isoformat()

    valuation_route = client.get(f"/api/ledger/assets/{asset_id}/valuations")
    assert valuation_route.status_code == 404

    valuation_event = client.post(
        f"/api/ledger/assets/{asset_id}/events",
        json={"event_type": "valuation", "event_date": today, "title": "Valuation"},
    )
    assert valuation_event.status_code == 422


def test_ledger_asset_sell_event_updates_sale_state_and_metrics(admin_login):
    client = admin_login
    today = date.today()
    asset = _create_asset(
        client,
        purchase_date=(today - timedelta(days=20)).isoformat(),
        start_use_date=(today - timedelta(days=10)).isoformat(),
        purchase_price=1000,
        extra_cost=100,
    )
    asset_id = asset["id"]

    sell = client.post(
        f"/api/ledger/assets/{asset_id}/events",
        json={"event_type": "sell", "event_date": today.isoformat(), "title": "Sold", "amount": 900},
    )
    assert sell.status_code == 200

    detail = client.get(f"/api/ledger/assets/{asset_id}")
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["status"] == "sold"
    assert payload["sale_price"] == 900.0
    assert payload["end_date"] == today.isoformat()
    assert payload["metrics"]["profit_loss"] == -200.0
    assert payload["metrics"]["realized_consumption_cost"] == 200.0
    assert payload["metrics"]["realized_daily_cost"] is not None


def test_ledger_asset_dispose_and_lost_events_only_update_status_and_end_date(admin_login):
    client = admin_login
    today = date.today()
    dispose_asset = _create_asset(client)
    lost_asset = _create_asset(client)

    dispose = client.post(
        f"/api/ledger/assets/{dispose_asset['id']}/events",
        json={"event_type": "dispose", "event_date": today.isoformat(), "title": "Dispose"},
    )
    lost = client.post(
        f"/api/ledger/assets/{lost_asset['id']}/events",
        json={"event_type": "lost", "event_date": today.isoformat(), "title": "Lost"},
    )
    assert dispose.status_code == 200
    assert lost.status_code == 200

    dispose_detail = client.get(f"/api/ledger/assets/{dispose_asset['id']}")
    lost_detail = client.get(f"/api/ledger/assets/{lost_asset['id']}")
    assert dispose_detail.json()["status"] == "disposed"
    assert dispose_detail.json()["end_date"] == today.isoformat()
    assert lost_detail.json()["status"] == "lost"
    assert lost_detail.json()["end_date"] == today.isoformat()


def test_ledger_asset_summary_returns_expected_totals(admin_login):
    client = admin_login
    baseline = client.get("/api/ledger/assets/summary")
    assert baseline.status_code == 200
    before = baseline.json()

    _create_asset(client, purchase_price=100, extra_cost=20, status="in_use", category="device")
    _create_asset(client, purchase_price=200, extra_cost=30, status="idle", category="device")
    _create_asset(client, purchase_price=300, extra_cost=10, sale_price=240, status="sold", category="resale")

    summary = client.get("/api/ledger/assets/summary")
    assert summary.status_code == 200
    payload = summary.json()

    assert payload["total_assets"] >= before["total_assets"] + 3
    assert payload["active_assets"] >= before["active_assets"] + 1
    assert payload["idle_assets"] >= before["idle_assets"] + 1
    assert payload["sold_assets"] >= before["sold_assets"] + 1
    assert payload["total_purchase_cost"] >= before["total_purchase_cost"] + 600.0
    assert payload["total_extra_cost"] >= before["total_extra_cost"] + 60.0
    assert payload["total_cost"] >= before["total_cost"] + 660.0
    assert payload["total_realized_profit_loss"] <= before["total_realized_profit_loss"] - 70.0
    assert "status_breakdown" in payload
    assert "category_breakdown" in payload
    assert "top_daily_cost_assets" in payload
    assert "top_idle_assets" in payload
    assert "top_extra_cost_assets" in payload


def test_ledger_assets_owner_role_isolation(admin_login):
    client = admin_login
    admin_asset = _create_asset(client, name=f"admin-scope-{uuid.uuid4().hex[:6]}")
    admin_asset_id = admin_asset["id"]

    _create_user_and_login(client)
    user_asset = _create_asset(client, name=f"user-scope-{uuid.uuid4().hex[:6]}")

    user_list = client.get("/api/ledger/assets")
    assert user_list.status_code == 200
    ids = [item["id"] for item in user_list.json()["items"]]
    assert user_asset["id"] in ids
    assert admin_asset_id not in ids

    hidden_detail = client.get(f"/api/ledger/assets/{admin_asset_id}")
    assert hidden_detail.status_code == 404

    user_summary = client.get("/api/ledger/assets/summary")
    assert user_summary.status_code == 200
    assert user_summary.json()["total_assets"] >= 1
