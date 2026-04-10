from typing import Optional


def _create_trade(
    client,
    *,
    trade_date: str,
    symbol: str,
    contract: str,
    direction: str = "做多",
    status: str = "open",
    open_price: float = 3500,
    quantity: float = 1,
    notes: Optional[str] = None,
):
    payload = {
        "trade_date": trade_date,
        "instrument_type": "期货",
        "symbol": symbol,
        "contract": contract,
        "direction": direction,
        "open_time": f"{trade_date}T09:00:00",
        "open_price": open_price,
        "quantity": quantity,
        "status": status,
    }
    if status == "closed":
        payload["close_time"] = f"{trade_date}T15:00:00"
        payload["close_price"] = open_price + 10
        payload["pnl"] = 10
    if notes is not None:
        payload["notes"] = notes
    resp = client.post("/api/trades", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_trade_search_options_supports_keyword_and_review_fields(app_client):
    trade = _create_trade(
        app_client,
        trade_date="2026-04-01",
        symbol="IF",
        contract="IF2506",
        notes="来源券商: 宏源期货 | 来源: 日结单粘贴导入",
    )
    trade_id = trade["id"]

    source_resp = app_client.put(
        f"/api/trades/{trade_id}/source-metadata",
        json={"broker_name": "宏源期货", "source_label": "日结单粘贴导入"},
    )
    assert source_resp.status_code == 200, source_resp.text

    review_resp = app_client.put(
        f"/api/trades/{trade_id}/review",
        json={"review_conclusion": "valid_pattern_valid_trade"},
    )
    assert review_resp.status_code == 200, review_resp.text

    search_resp = app_client.get("/api/trades/search-options", params={"q": "IF2506"})
    assert search_resp.status_code == 200, search_resp.text
    items = search_resp.json()["items"]
    assert len(items) == 1
    row = items[0]
    assert row["trade_id"] == trade_id
    assert row["symbol"] == "IF"
    assert row["source_display"] == "宏源期货 / 日结单粘贴导入"
    assert row["has_trade_review"] is True
    assert row["review_conclusion"] == "valid_pattern_valid_trade"


def test_trade_search_options_supports_date_status_symbol_filters(app_client):
    _create_trade(app_client, trade_date="2026-04-01", symbol="IF", contract="IF2506", status="open")
    matched = _create_trade(app_client, trade_date="2026-04-02", symbol="IC", contract="IC2506", status="closed")
    _create_trade(app_client, trade_date="2026-04-03", symbol="IC", contract="IC2509", status="open")

    resp = app_client.get(
        "/api/trades/search-options",
        params={
            "symbol": "IC",
            "status": "closed",
            "date_from": "2026-04-01",
            "date_to": "2026-04-02",
        },
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["trade_id"] == matched["id"]


def test_trade_search_options_include_ids_can_backfill_selected_items(app_client):
    matched = _create_trade(app_client, trade_date="2026-04-01", symbol="IF", contract="IF2506")
    extra = _create_trade(app_client, trade_date="2026-04-02", symbol="AU", contract="AU2506")

    resp = app_client.get(
        "/api/trades/search-options",
        params={
            "symbol": "IF",
            "include_ids": str(extra["id"]),
        },
    )
    assert resp.status_code == 200, resp.text
    ids = [x["trade_id"] for x in resp.json()["items"]]
    assert matched["id"] in ids
    assert extra["id"] in ids


def test_trade_search_options_limit_upper_bound(app_client):
    resp = app_client.get("/api/trades/search-options", params={"limit": 51})
    assert resp.status_code == 422, resp.text
