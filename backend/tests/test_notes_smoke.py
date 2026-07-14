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
    assert created_note["title"] == "hello"
    assert created_note["content"] == "world"
    assert created_note["note_type"] == "doc"
    note_id = created_note["id"]

    fetched = client.get(f"/api/notes/{note_id}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "hello"

    listing = client.get("/api/notes")
    assert listing.status_code == 200
    assert any(x["id"] == note_id for x in listing.json())

    backlinks = client.get(f"/api/notes/{note_id}/backlinks")
    assert backlinks.status_code == 404


def test_notes_api_no_longer_opens_trading_scope(admin_login):
    client = admin_login

    notebook = client.post(
        "/api/notebooks",
        json={"name": "Research NB", "description": "r", "icon": "R", "sort_order": 0, "module_scope": "trading"},
    )
    assert notebook.status_code == 200
    assert notebook.json()["module_scope"] == "notes"
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

    listing = client.get("/api/notes", params={"module_scope": "trading", "note_type": "doc"})
    assert listing.status_code == 200
    assert any(item["title"] == "alpha research" and item["module_scope"] == "notes" for item in listing.json())
