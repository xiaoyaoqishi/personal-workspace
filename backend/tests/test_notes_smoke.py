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


def test_documents_can_be_reordered_and_moved_between_notebooks(admin_login):
    client = admin_login
    source_id = client.post("/api/notebooks", json={"name": "Drag Source"}).json()["id"]
    target_id = client.post("/api/notebooks", json={"name": "Drag Target"}).json()["id"]

    first = client.post(
        "/api/notes",
        json={"notebook_id": source_id, "title": "first", "note_type": "doc"},
    ).json()
    second = client.post(
        "/api/notes",
        json={"notebook_id": source_id, "title": "second", "note_type": "doc"},
    ).json()
    target = client.post(
        "/api/notes",
        json={"notebook_id": target_id, "title": "target", "note_type": "doc"},
    ).json()

    reordered = client.post(
        "/api/notes/reorder",
        json={
            "note_id": second["id"],
            "target_notebook_id": source_id,
            "target_note_id": first["id"],
            "placement": "before",
        },
    )
    assert reordered.status_code == 200

    source_listing = client.get("/api/notes", params={"notebook_id": source_id, "note_type": "doc"})
    assert [row["id"] for row in source_listing.json()] == [second["id"], first["id"]]

    moved = client.post(
        "/api/notes/reorder",
        json={
            "note_id": first["id"],
            "target_notebook_id": target_id,
            "target_note_id": target["id"],
            "placement": "after",
        },
    )
    assert moved.status_code == 200
    assert moved.json()["notebook_id"] == target_id

    target_listing = client.get("/api/notes", params={"notebook_id": target_id, "note_type": "doc"})
    assert [row["id"] for row in target_listing.json()] == [target["id"], first["id"]]


def test_notebooks_can_be_reordered_and_moved(admin_login):
    client = admin_login
    first = client.post("/api/notebooks", json={"name": "Folder One"}).json()
    second = client.post("/api/notebooks", json={"name": "Folder Two"}).json()
    third = client.post("/api/notebooks", json={"name": "Folder Three"}).json()
    created_ids = {first["id"], second["id"], third["id"]}

    reordered = client.post(
        "/api/notebooks/reorder",
        json={
            "notebook_id": third["id"],
            "target_parent_id": None,
            "target_notebook_id": first["id"],
            "placement": "before",
        },
    )
    assert reordered.status_code == 200
    roots = [
        row
        for row in client.get("/api/notebooks").json()
        if row["parent_id"] is None and row["id"] in created_ids
    ]
    assert [row["id"] for row in roots] == [third["id"], first["id"], second["id"]]

    moved = client.post(
        "/api/notebooks/reorder",
        json={"notebook_id": second["id"], "target_parent_id": first["id"], "placement": "end"},
    )
    assert moved.status_code == 200
    assert moved.json()["parent_id"] == first["id"]

    cycle = client.post(
        "/api/notebooks/reorder",
        json={"notebook_id": first["id"], "target_parent_id": second["id"], "placement": "end"},
    )
    assert cycle.status_code == 400

    moved_to_root = client.post(
        "/api/notebooks/reorder",
        json={
            "notebook_id": second["id"],
            "target_parent_id": None,
            "target_notebook_id": first["id"],
            "placement": "before",
        },
    )
    assert moved_to_root.status_code == 200
    assert moved_to_root.json()["parent_id"] is None
