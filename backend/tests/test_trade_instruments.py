def test_trade_instrument_crud_and_code_update(admin_login):
    client = admin_login
    listed = client.get("/api/trade-instruments")
    assert listed.status_code == 200
    assert any(item["code"] == "JM" and item["name"] == "焦煤" for item in listed.json())

    created = client.post(
        "/api/trade-instruments",
        json={"code": "demo", "name": "测试品种", "instrument_type": "期货", "category": "其他"},
    )
    assert created.status_code == 200
    item = created.json()
    assert item["code"] == "DEMO"

    trade = client.post(
        "/api/trades",
        json={
            "instrument_type": "期货", "symbol": "DEMO", "direction": "做多",
            "open_time": "2026-08-04T09:00:00", "open_price": 100,
            "stop_loss_point": 90, "target_point": 120, "capital_percentage": 1,
        },
    )
    assert trade.status_code == 200

    updated = client.put(
        f"/api/trade-instruments/{item['id']}",
        json={"code": "demo2", "name": "测试品种二", "category": "黑色"},
    )
    assert updated.status_code == 200
    assert updated.json()["code"] == "DEMO2"
    assert client.get(f"/api/trades/{trade.json()['id']}").json()["symbol"] == "DEMO2"

    deleted = client.delete(f"/api/trade-instruments/{item['id']}")
    assert deleted.status_code == 200
    assert all(row["code"] != "DEMO2" for row in client.get("/api/trade-instruments").json())
