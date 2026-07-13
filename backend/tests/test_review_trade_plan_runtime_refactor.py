from services import utility_runtime


def test_removed_review_routes_are_not_registered(admin_login):
    client = admin_login
    assert client.get("/api/reviews").status_code == 404
    assert client.get("/api/review-sessions").status_code == 404
    assert client.get("/api/recycle/review-sessions").status_code == 404


def test_trade_plan_no_longer_exposes_review_session_flow(admin_login):
    client = admin_login
    created = client.post(
        "/api/trade-plans",
        json={"title": "standalone-plan", "plan_date": "2026-04-27", "tags": ["plan"]},
    )
    assert created.status_code == 200
    plan_id = created.json()["id"]
    assert "review_session_links" not in created.json()
    assert client.post(f"/api/trade-plans/{plan_id}/create-followup-review-session").status_code == 404


def test_poem_and_upload_routes(admin_login, tmp_path):
    client = admin_login
    utility_runtime.UPLOAD_DIR = str(tmp_path)

    poem = client.get("/api/poem/daily")
    assert poem.status_code == 200
    poem_payload = poem.json()
    assert poem_payload["title"]
    assert poem_payload["text"]
    assert poem_payload["source"]

    upload = client.post(
        "/api/upload",
        files={"file": ("proof.png", b"split-runtime", "image/png")},
    )
    assert upload.status_code == 200
    upload_url = upload.json()["url"]
    assert upload_url.startswith("/api/uploads/")

    downloaded = client.get(upload_url)
    assert downloaded.status_code == 200
    assert downloaded.content == b"split-runtime"
