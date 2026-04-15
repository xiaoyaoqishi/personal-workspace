from datetime import date


def _create_trade(client):
    payload = {
        "trade_date": "2026-04-01",
        "instrument_type": "期货",
        "symbol": "IF",
        "contract": "IF2506",
        "direction": "做多",
        "open_time": "2026-04-01T09:00:00",
        "open_price": 3500,
        "quantity": 1,
        "status": "open",
    }
    resp = client.post("/api/trades", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_trade_recycle_restore_and_purge(app_client):
    trade_id = _create_trade(app_client)

    delete_resp = app_client.delete(f"/api/trades/{trade_id}")
    assert delete_resp.status_code == 200, delete_resp.text

    get_deleted = app_client.get(f"/api/trades/{trade_id}")
    assert get_deleted.status_code == 404, get_deleted.text

    recycle_rows = app_client.get("/api/recycle/trades").json()
    assert any(row["id"] == trade_id for row in recycle_rows)

    restore_resp = app_client.post(f"/api/recycle/trades/{trade_id}/restore")
    assert restore_resp.status_code == 200, restore_resp.text

    get_restored = app_client.get(f"/api/trades/{trade_id}")
    assert get_restored.status_code == 200, get_restored.text

    delete_again = app_client.delete(f"/api/trades/{trade_id}")
    assert delete_again.status_code == 200, delete_again.text

    purge_resp = app_client.delete(f"/api/recycle/trades/{trade_id}/purge")
    assert purge_resp.status_code == 200, purge_resp.text

    restore_after_purge = app_client.post(f"/api/recycle/trades/{trade_id}/restore")
    assert restore_after_purge.status_code == 404, restore_after_purge.text


def test_recycle_bin_for_knowledge_broker_review_and_trade_plan(app_client):
    trade_id = _create_trade(app_client)

    knowledge = app_client.post(
        "/api/knowledge-items",
        json={
            "category": "pattern_dictionary",
            "title": "回收站知识",
            "status": "active",
        },
    )
    assert knowledge.status_code == 200, knowledge.text
    knowledge_id = knowledge.json()["id"]

    broker = app_client.post("/api/trade-brokers", json={"name": "回收站券商"})
    assert broker.status_code == 200, broker.text
    broker_id = broker.json()["id"]

    review_session = app_client.post(
        "/api/review-sessions",
        json={
            "title": "回收站复盘",
            "review_kind": "theme",
            "review_scope": "themed",
            "selection_mode": "manual",
            "selection_basis": "sample",
            "review_goal": "verify recycle flow",
            "trade_links": [{"trade_id": trade_id}],
        },
    )
    assert review_session.status_code == 200, review_session.text
    review_session_id = review_session.json()["id"]

    trade_plan = app_client.post(
        "/api/trade-plans",
        json={
            "title": "回收站计划",
            "plan_date": str(date.today()),
            "status": "draft",
            "trade_links": [{"trade_id": trade_id}],
        },
    )
    assert trade_plan.status_code == 200, trade_plan.text
    trade_plan_id = trade_plan.json()["id"]

    assert app_client.delete(f"/api/knowledge-items/{knowledge_id}").status_code == 200
    assert app_client.delete(f"/api/trade-brokers/{broker_id}").status_code == 200
    assert app_client.delete(f"/api/review-sessions/{review_session_id}").status_code == 200
    assert app_client.delete(f"/api/trade-plans/{trade_plan_id}").status_code == 200

    assert app_client.get(f"/api/knowledge-items/{knowledge_id}").status_code == 404
    assert app_client.get(f"/api/review-sessions/{review_session_id}").status_code == 404
    assert app_client.get(f"/api/trade-plans/{trade_plan_id}").status_code == 404

    assert any(x["id"] == knowledge_id for x in app_client.get("/api/recycle/knowledge-items").json())
    assert any(x["id"] == broker_id for x in app_client.get("/api/recycle/trade-brokers").json())
    assert any(x["id"] == review_session_id for x in app_client.get("/api/recycle/review-sessions").json())
    assert any(x["id"] == trade_plan_id for x in app_client.get("/api/recycle/trade-plans").json())

    assert app_client.post(f"/api/recycle/knowledge-items/{knowledge_id}/restore").status_code == 200
    assert app_client.post(f"/api/recycle/trade-brokers/{broker_id}/restore").status_code == 200
    assert app_client.post(f"/api/recycle/review-sessions/{review_session_id}/restore").status_code == 200
    assert app_client.post(f"/api/recycle/trade-plans/{trade_plan_id}/restore").status_code == 200

    assert app_client.get(f"/api/knowledge-items/{knowledge_id}").status_code == 200
    assert app_client.get(f"/api/review-sessions/{review_session_id}").status_code == 200
    assert app_client.get(f"/api/trade-plans/{trade_plan_id}").status_code == 200


def test_recreate_deleted_broker_will_restore_same_row(app_client):
    created = app_client.post("/api/trade-brokers", json={"name": "可恢复券商", "account": "a1"})
    assert created.status_code == 200, created.text
    broker_id = created.json()["id"]

    deleted = app_client.delete(f"/api/trade-brokers/{broker_id}")
    assert deleted.status_code == 200, deleted.text

    recreated = app_client.post("/api/trade-brokers", json={"name": "可恢复券商", "account": "a2"})
    assert recreated.status_code == 200, recreated.text
    body = recreated.json()
    assert body["id"] == broker_id
    assert body["account"] == "a2"
