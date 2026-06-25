def test_notes_core_flow(admin_login):
    client = admin_login

    notebook = client.post("/api/notebooks", json={"name": "Test NB", "description": "d", "icon": "N", "sort_order": 0})
    assert notebook.status_code == 200
    nb_id = notebook.json()["id"]

    note = client.post(
        "/api/notes",
        json={
            "notebook_id": nb_id,
            "title": "hello",
            "content": "world",
            "note_type": "doc",
        },
    )
    assert note.status_code == 200
    created_note = note.json()
    note_id = created_note.get("id")
    if note_id is None:
        listing_after_create = client.get("/api/notes")
        assert listing_after_create.status_code == 200
        note_id = next(x["id"] for x in listing_after_create.json() if x.get("title") == "hello")

    fetched = client.get(f"/api/notes/{note_id}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "hello"

    listing = client.get("/api/notes")
    assert listing.status_code == 200
    assert any(x["id"] == note_id for x in listing.json())


def test_trading_research_scope_isolated(admin_login):
    client = admin_login

    notebook = client.post(
        "/api/notebooks",
        json={"name": "Research NB", "description": "r", "icon": "R", "sort_order": 0, "module_scope": "trading"},
    )
    assert notebook.status_code == 200
    nb_id = notebook.json()["id"]

    note = client.post(
        "/api/notes",
        json={
            "notebook_id": nb_id,
            "title": "alpha research",
            "content": "isolated scope",
            "note_type": "doc",
            "module_scope": "trading",
        },
    )
    assert note.status_code == 200
    note_id = note.json().get("id")
    if note_id is None:
        trading_listing_after_create = client.get("/api/notes", params={"module_scope": "trading", "note_type": "doc"})
        assert trading_listing_after_create.status_code == 200
        note_id = next(x["id"] for x in trading_listing_after_create.json() if x.get("title") == "alpha research")

    trading_notes = client.get("/api/notes", params={"module_scope": "trading", "note_type": "doc"})
    assert trading_notes.status_code == 200
    assert any(item["id"] == note_id for item in trading_notes.json())

    notes_scope = client.get("/api/notes", params={"module_scope": "notes", "note_type": "doc"})
    assert notes_scope.status_code == 200
    assert all(item["id"] != note_id for item in notes_scope.json())

    trading_note = client.get(f"/api/notes/{note_id}", params={"module_scope": "trading"})
    assert trading_note.status_code == 200
    assert trading_note.json()["title"] == "alpha research"

    hidden_from_notes = client.get(f"/api/notes/{note_id}", params={"module_scope": "notes"})
    assert hidden_from_notes.status_code == 404
