def test_trading_research_crud_links_and_recycle(admin_login):
    client = admin_login

    folder = client.post("/api/trades/research/folders", json={"name": "策略研究"})
    assert folder.status_code == 200
    folder_id = folder.json()["id"]

    child_folder = client.post(
        "/api/trades/research/folders",
        json={"name": "证据", "parent_id": folder_id},
    )
    assert child_folder.status_code == 200
    cycle = client.put(
        f"/api/trades/research/folders/{folder_id}",
        json={"parent_id": child_folder.json()["id"]},
    )
    assert cycle.status_code == 400

    alpha = client.post(
        "/api/trades/research/documents",
        json={
            "folder_id": folder_id,
            "title": "Alpha 假设",
            "content": "<p>验证 [[Beta 证据]]</p>",
            "tags": ["假设", "趋势"],
            "is_pinned": True,
        },
    )
    assert alpha.status_code == 200
    alpha_id = alpha.json()["id"]
    assert alpha.json()["tags"] == ["假设", "趋势"]

    beta = client.post(
        "/api/trades/research/documents",
        json={"folder_id": folder_id, "title": "Beta 证据", "content": "<p>样本证据</p>"},
    )
    assert beta.status_code == 200
    beta_id = beta.json()["id"]

    backlinks = client.get(f"/api/trades/research/documents/{beta_id}/backlinks")
    assert backlinks.status_code == 200
    assert backlinks.json()[0]["document_id"] == alpha_id

    searched = client.get("/api/trades/research/documents", params={"keyword": "Alpha"})
    assert searched.status_code == 200
    assert searched.json()["total"] == 1

    updated = client.put(
        f"/api/trades/research/documents/{alpha_id}",
        json={"title": "Alpha 验证", "is_pinned": False},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Alpha 验证"

    deleted = client.delete(f"/api/trades/research/documents/{alpha_id}")
    assert deleted.status_code == 200
    assert client.get(f"/api/trades/research/documents/{alpha_id}").status_code == 404

    recycle = client.get("/api/trades/research/recycle")
    assert recycle.status_code == 200
    assert any(item["id"] == alpha_id for item in recycle.json())

    restored = client.post(f"/api/trades/research/recycle/{alpha_id}/restore")
    assert restored.status_code == 200
    assert client.get(f"/api/trades/research/documents/{alpha_id}").status_code == 200


def test_legacy_trading_notes_are_migrated_idempotently(admin_login):
    import core.db as core_db
    from models import Note, Notebook, TradingResearchDocument, TradingResearchFolder
    from trading.research_service import migrate_legacy_trading_research

    db = core_db.SessionLocal()
    try:
        legacy_folder = Notebook(name="旧研究", module_scope="trading", owner_role="admin")
        db.add(legacy_folder)
        db.flush()
        legacy_document = Note(
            notebook_id=legacy_folder.id,
            title="旧研究内容",
            content="<p>需要迁移</p>",
            note_type="doc",
            module_scope="trading",
            owner_role="admin",
        )
        db.add(legacy_document)
        db.commit()
        legacy_folder_id = legacy_folder.id
        legacy_document_id = legacy_document.id
    finally:
        db.close()

    migrate_legacy_trading_research()
    migrate_legacy_trading_research()

    db = core_db.SessionLocal()
    try:
        assert db.query(TradingResearchFolder).filter_by(legacy_notebook_id=legacy_folder_id).count() == 1
        migrated = db.query(TradingResearchDocument).filter_by(legacy_note_id=legacy_document_id).one()
        assert migrated.title == "旧研究内容"
        assert migrated.content == "<p>需要迁移</p>"
    finally:
        db.close()
