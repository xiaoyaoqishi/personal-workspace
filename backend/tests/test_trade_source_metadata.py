def _create_trade(client, notes=None):
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
        "notes": notes,
    }
    resp = client.post("/api/trades", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_source_metadata_fallback_from_legacy_notes(app_client):
    trade_id = _create_trade(
        app_client,
        notes="来源券商: 宏源期货 | 来源: 日结单粘贴导入 | 其他备注: test",
    )
    resp = app_client.get(f"/api/trades/{trade_id}/source-metadata")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["exists_in_db"] is False
    assert body["trade_id"] == trade_id
    assert body["broker_name"] == "宏源期货"
    assert body["source_label"] == "日结单粘贴导入"
    assert body["derived_from_notes"] is True


def test_source_metadata_upsert_and_sources_endpoint_visibility(app_client):
    trade_id = _create_trade(app_client, notes="legacy note only")
    put_resp = app_client.put(
        f"/api/trades/{trade_id}/source-metadata",
        json={
            "broker_name": "MetaBroker",
            "source_label": "MetaSource",
            "import_channel": "manual_backfill",
            "source_note_snapshot": "legacy note only",
            "parser_version": "v1",
            "derived_from_notes": False,
        },
    )
    assert put_resp.status_code == 200, put_resp.text
    put_body = put_resp.json()
    assert put_body["exists_in_db"] is True
    assert put_body["broker_name"] == "MetaBroker"
    assert put_body["source_label"] == "MetaSource"
    assert put_body["derived_from_notes"] is False

    get_resp = app_client.get(f"/api/trades/{trade_id}/source-metadata")
    assert get_resp.status_code == 200, get_resp.text
    get_body = get_resp.json()
    assert get_body["id"] == put_body["id"]
    assert get_body["exists_in_db"] is True
    assert get_body["import_channel"] == "manual_backfill"

    source_resp = app_client.get("/api/trades/sources")
    assert source_resp.status_code == 200, source_resp.text
    items = source_resp.json()["items"]
    assert "MetaBroker" in items
    assert "MetaSource" in items


def test_trade_sources_merges_broker_metadata_and_legacy_notes(app_client):
    broker_resp = app_client.post("/api/trade-brokers", json={"name": "BrokerFromTable"})
    assert broker_resp.status_code == 200, broker_resp.text

    legacy_trade_id = _create_trade(
        app_client,
        notes="来源券商: LegacyBroker | 来源: LegacySource | 备注: x",
    )
    assert legacy_trade_id > 0

    meta_trade_id = _create_trade(app_client, notes="no source in notes")
    meta_put = app_client.put(
        f"/api/trades/{meta_trade_id}/source-metadata",
        json={"broker_name": "MetaBroker2", "source_label": "MetaSource2"},
    )
    assert meta_put.status_code == 200, meta_put.text

    source_resp = app_client.get("/api/trades/sources")
    assert source_resp.status_code == 200, source_resp.text
    items = source_resp.json()["items"]
    assert "BrokerFromTable" in items
    assert "LegacyBroker" in items
    assert "LegacySource" in items
    assert "MetaBroker2" in items
    assert "MetaSource2" in items


def test_list_count_filter_supports_explicit_source_metadata(app_client):
    trade_id = _create_trade(app_client, notes="legacy note")
    put_resp = app_client.put(
        f"/api/trades/{trade_id}/source-metadata",
        json={"broker_name": "FilterMetaBroker", "source_label": "FilterMetaSource"},
    )
    assert put_resp.status_code == 200, put_resp.text

    list_broker = app_client.get("/api/trades", params={"source_keyword": "FilterMetaBroker", "size": 200})
    count_broker = app_client.get("/api/trades/count", params={"source_keyword": "FilterMetaBroker"})
    assert list_broker.status_code == 200, list_broker.text
    assert count_broker.status_code == 200, count_broker.text
    assert len(list_broker.json()) == 1
    assert count_broker.json()["total"] == 1

    list_source = app_client.get("/api/trades", params={"source_keyword": "FilterMetaSource", "size": 200})
    count_source = app_client.get("/api/trades/count", params={"source_keyword": "FilterMetaSource"})
    assert len(list_source.json()) == 1
    assert count_source.json()["total"] == 1


def test_list_count_filter_keeps_legacy_notes_compatibility(app_client):
    _create_trade(
        app_client,
        notes="来源券商: LegacyFilterBroker | 来源: LegacyFilterSource",
    )

    list_broker = app_client.get("/api/trades", params={"source_keyword": "LegacyFilterBroker", "size": 200})
    count_broker = app_client.get("/api/trades/count", params={"source_keyword": "LegacyFilterBroker"})
    assert list_broker.status_code == 200, list_broker.text
    assert count_broker.status_code == 200, count_broker.text
    assert len(list_broker.json()) == 1
    assert count_broker.json()["total"] == 1

    list_source = app_client.get("/api/trades", params={"source_keyword": "LegacyFilterSource", "size": 200})
    count_source = app_client.get("/api/trades/count", params={"source_keyword": "LegacyFilterSource"})
    assert len(list_source.json()) == 1
    assert count_source.json()["total"] == 1


def test_paste_import_source_compatibility_stays_unchanged(app_client):
    header = "\t".join(
        [
            "交易日期",
            "合约",
            "买/卖",
            "投机（一般）/套保/套利",
            "成交价",
            "手数",
            "成交额",
            "开/平",
            "手续费",
            "平仓盈亏",
        ]
    )
    row = "2026-04-01\tIF2506\t买\t投机\t3500\t1\t0\t开\t1\t0"
    import_resp = app_client.post(
        "/api/trades/import-paste",
        json={"raw_text": f"{header}\n{row}", "broker": "PasteBroker"},
    )
    assert import_resp.status_code == 200, import_resp.text
    result = import_resp.json()
    assert result["inserted"] == 1
    assert result["errors"] == []

    list_broker = app_client.get("/api/trades", params={"source_keyword": "PasteBroker", "size": 200})
    count_broker = app_client.get("/api/trades/count", params={"source_keyword": "PasteBroker"})
    assert len(list_broker.json()) == 1
    assert count_broker.json()["total"] == 1
    imported_trade = list_broker.json()[0]
    assert "来源券商: PasteBroker" in (imported_trade.get("notes") or "")
    assert "来源: 日结单粘贴导入" in (imported_trade.get("notes") or "")

    list_source = app_client.get("/api/trades", params={"source_keyword": "日结单粘贴导入", "size": 200})
    count_source = app_client.get("/api/trades/count", params={"source_keyword": "日结单粘贴导入"})
    assert len(list_source.json()) == 1
    assert count_source.json()["total"] == 1

    metadata_resp = app_client.get(f"/api/trades/{imported_trade['id']}/source-metadata")
    assert metadata_resp.status_code == 200, metadata_resp.text
    metadata = metadata_resp.json()
    assert metadata["exists_in_db"] is True
    assert metadata["broker_name"] == "PasteBroker"
    assert metadata["source_label"] == "日结单粘贴导入"
    assert metadata["import_channel"] == "paste_import"
    assert metadata["parser_version"] == "paste_v1"

    sources_resp = app_client.get("/api/trades/sources")
    assert sources_resp.status_code == 200, sources_resp.text
    items = sources_resp.json()["items"]
    assert "PasteBroker" in items
    assert "日结单粘贴导入" in items


def test_paste_import_close_match_backfills_metadata_for_legacy_open_row(app_client):
    legacy_open_id = _create_trade(
        app_client,
        notes="来源券商: LegacyPasteBroker | 来源: 日结单粘贴导入 | 旧数据",
    )
    before = app_client.get(f"/api/trades/{legacy_open_id}/source-metadata")
    assert before.status_code == 200, before.text
    assert before.json()["exists_in_db"] is False

    close_row = "2026-04-02\tIF2506\t卖\t投机\t3510\t1\t0\t平\t1\t30"
    import_resp = app_client.post(
        "/api/trades/import-paste",
        json={"raw_text": close_row, "broker": "LegacyPasteBroker"},
    )
    assert import_resp.status_code == 200, import_resp.text
    assert import_resp.json()["errors"] == []

    after = app_client.get(f"/api/trades/{legacy_open_id}/source-metadata")
    assert after.status_code == 200, after.text
    body = after.json()
    assert body["exists_in_db"] is True
    assert body["broker_name"] == "LegacyPasteBroker"
    assert body["source_label"] == "日结单粘贴导入"
    assert body["import_channel"] == "paste_import"
    assert body["parser_version"] == "paste_v1"


def test_positions_and_statistics_support_metadata_source_filter(app_client):
    open_trade_id = _create_trade(app_client, notes="open-trade")
    put_open = app_client.put(
        f"/api/trades/{open_trade_id}/source-metadata",
        json={"broker_name": "MetaStatsBroker", "source_label": "MetaStatsSource"},
    )
    assert put_open.status_code == 200, put_open.text

    closed_payload = {
        "trade_date": "2026-04-02",
        "instrument_type": "期货",
        "symbol": "IF",
        "contract": "IF2506",
        "direction": "做多",
        "open_time": "2026-04-02T09:00:00",
        "close_time": "2026-04-02T15:00:00",
        "open_price": 3500,
        "close_price": 3510,
        "quantity": 1,
        "status": "closed",
        "pnl": 10,
        "commission": 1,
        "notes": "closed-trade",
    }
    closed_resp = app_client.post("/api/trades", json=closed_payload)
    assert closed_resp.status_code == 200, closed_resp.text
    closed_trade_id = closed_resp.json()["id"]
    put_closed = app_client.put(
        f"/api/trades/{closed_trade_id}/source-metadata",
        json={"broker_name": "MetaStatsBroker", "source_label": "MetaStatsSource"},
    )
    assert put_closed.status_code == 200, put_closed.text

    pos_resp = app_client.get("/api/trades/positions", params={"source_keyword": "MetaStatsBroker"})
    assert pos_resp.status_code == 200, pos_resp.text
    positions = pos_resp.json()
    assert len(positions) == 1
    assert positions[0]["net_quantity"] == 1

    stats_resp = app_client.get("/api/trades/statistics", params={"source_keyword": "MetaStatsBroker"})
    assert stats_resp.status_code == 200, stats_resp.text
    stats = stats_resp.json()
    assert stats["total"] == 1
    assert stats["total_pnl"] == 10


def test_trade_list_source_fields_are_metadata_first_with_notes_fallback(app_client):
    trade_id = _create_trade(
        app_client,
        notes="来源券商: LegacyBrokerForDisplay | 来源: LegacySourceForDisplay",
    )
    rows_resp = app_client.get("/api/trades", params={"size": 200})
    assert rows_resp.status_code == 200, rows_resp.text
    row = next((x for x in rows_resp.json() if x["id"] == trade_id), None)
    assert row is not None
    assert row["source_broker_name"] == "LegacyBrokerForDisplay"
    assert row["source_label"] == "LegacySourceForDisplay"
    assert row["source_display"] == "LegacyBrokerForDisplay / LegacySourceForDisplay"
    assert row["source_is_metadata"] is False

    put_resp = app_client.put(
        f"/api/trades/{trade_id}/source-metadata",
        json={"broker_name": "MetaBrokerForDisplay", "source_label": "MetaSourceForDisplay"},
    )
    assert put_resp.status_code == 200, put_resp.text

    rows_resp2 = app_client.get("/api/trades", params={"size": 200})
    assert rows_resp2.status_code == 200, rows_resp2.text
    row2 = next((x for x in rows_resp2.json() if x["id"] == trade_id), None)
    assert row2 is not None
    assert row2["source_broker_name"] == "MetaBrokerForDisplay"
    assert row2["source_label"] == "MetaSourceForDisplay"
    assert row2["source_display"] == "MetaBrokerForDisplay / MetaSourceForDisplay"
    assert row2["source_is_metadata"] is True


def test_trade_list_exposes_trade_review_presence(app_client):
    trade_id = _create_trade(app_client, notes="review-presence")
    rows_before = app_client.get("/api/trades", params={"size": 200}).json()
    row_before = next((x for x in rows_before if x["id"] == trade_id), None)
    assert row_before is not None
    assert row_before["has_trade_review"] is False

    upsert_resp = app_client.put(
        f"/api/trades/{trade_id}/review",
        json={"review_conclusion": "need_more_evidence"},
    )
    assert upsert_resp.status_code == 200, upsert_resp.text

    rows_after = app_client.get("/api/trades", params={"size": 200}).json()
    row_after = next((x for x in rows_after if x["id"] == trade_id), None)
    assert row_after is not None
    assert row_after["has_trade_review"] is True
