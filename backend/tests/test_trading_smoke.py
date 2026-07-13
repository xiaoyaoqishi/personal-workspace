def test_trading_read_write(admin_login):
    client = admin_login
    create_payload = {
        "instrument_type": "futures",
        "symbol": "IF",
        "direction": "long",
        "open_time": "2026-04-20T09:30:00",
        "open_price": 3500,
        "stop_loss_point": 3480,
        "target_point": 3550,
        "capital_percentage": 12.5,
    }
    created = client.post("/api/trades", json=create_payload)
    assert created.status_code == 200
    trade_id = created.json()["id"]

    one = client.get(f"/api/trades/{trade_id}")
    assert one.status_code == 200
    assert one.json()["symbol"] == "IF"
    assert one.json()["trade_date"] == "2026-04-20"

    history = client.get(f"/api/trades/{trade_id}/risk-point-history")
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["stop_loss_point"] == 3480
    assert history.json()[0]["target_point"] == 3550
    assert history.json()[0]["capital_percentage"] == 12.5
    assert history.json()[0]["recorded_at"].endswith("+08:00")

    updated = client.put(
        f"/api/trades/{trade_id}",
        json={"stop_loss_point": 3490, "target_point": 3560, "capital_percentage": 18},
    )
    assert updated.status_code == 200
    assert updated.json()["stop_loss_point"] == 3490

    updated_history = client.get(f"/api/trades/{trade_id}/risk-point-history")
    assert updated_history.status_code == 200
    assert len(updated_history.json()) == 2
    assert updated_history.json()[0]["stop_loss_point"] == 3490
    assert updated_history.json()[0]["target_point"] == 3560
    assert updated_history.json()[0]["capital_percentage"] == 18
    assert updated_history.json()[1]["stop_loss_point"] == 3480
    assert updated_history.json()[1]["target_point"] == 3550
    assert updated_history.json()[1]["capital_percentage"] == 12.5

    unchanged = client.put(
        f"/api/trades/{trade_id}",
        json={"stop_loss_point": 3490, "target_point": 3560, "capital_percentage": 18},
    )
    assert unchanged.status_code == 200
    unchanged_history = client.get(f"/api/trades/{trade_id}/risk-point-history")
    assert len(unchanged_history.json()) == 2

    capital_only_update = client.put(
        f"/api/trades/{trade_id}",
        json={"capital_percentage": 22},
    )
    assert capital_only_update.status_code == 200
    capital_history = client.get(f"/api/trades/{trade_id}/risk-point-history")
    assert len(capital_history.json()) == 3
    assert capital_history.json()[0]["stop_loss_point"] == 3490
    assert capital_history.json()[0]["target_point"] == 3560
    assert capital_history.json()[0]["capital_percentage"] == 22

    listing = client.get("/api/trades")
    assert listing.status_code == 200
    assert isinstance(listing.json(), list)
    assert any(x["id"] == trade_id for x in listing.json())


def test_trade_requires_initial_risk_points(admin_login):
    response = admin_login.post(
        "/api/trades",
        json={
            "trade_date": "2026-04-20",
            "instrument_type": "futures",
            "symbol": "IF",
            "direction": "long",
            "open_time": "2026-04-20T09:30:00",
            "open_price": 3500,
            "stop_loss_point": 3480,
            "target_point": 3550,
        },
    )
    assert response.status_code == 422

    invalid_percentage = admin_login.post(
        "/api/trades",
        json={
            "instrument_type": "futures",
            "symbol": "IF",
            "direction": "long",
            "open_time": "2026-04-20T09:30:00",
            "open_price": 3500,
            "stop_loss_point": 3480,
            "target_point": 3550,
            "capital_percentage": 101,
        },
    )
    assert invalid_percentage.status_code == 422
