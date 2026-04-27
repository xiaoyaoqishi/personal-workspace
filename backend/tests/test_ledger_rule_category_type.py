import io

from models import LedgerCategory, LedgerRule


def _post_file(client, filename: str, content: bytes, mime: str = "text/csv") -> int:
    files = {"file": (filename, io.BytesIO(content), mime)}
    resp = client.post("/api/ledger/import-batches", files=files)
    assert resp.status_code == 200
    return int(resp.json()["id"])


def _run_to_reprocess(client, batch_id: int) -> None:
    assert client.post(f"/api/ledger/import-batches/{batch_id}/parse").status_code == 200
    assert client.post(f"/api/ledger/import-batches/{batch_id}/reprocess").status_code == 200


def _session():
    import core.db as core_db

    return core_db.SessionLocal()


def test_review_generate_rule_infers_income_category_type(admin_login):
    csv_text = """摘要,交易日期,交易金额,账户余额,交易地点/附言
收入,2026-03-01,5000.00,20000.00,工资入账
"""
    batch_id = _post_file(admin_login, "income.csv", csv_text.encode("utf-8"))
    _run_to_reprocess(admin_login, batch_id)

    rows = admin_login.get(f"/api/ledger/import-batches/{batch_id}/review-rows").json()["items"]
    resp = admin_login.post(
        f"/api/ledger/import-batches/{batch_id}/review/generate-rule",
        json={
            "row_ids": [int(rows[0]["id"])],
            "rule_kind": "category",
            "match_text": "工资入账",
            "target_category_name": "工资收入",
            "priority": 30,
        },
    )
    assert resp.status_code == 200
    assert resp.json()["created_rule_ids"]

    with _session() as db:
        category = db.query(LedgerCategory).filter(LedgerCategory.name == "工资收入").first()
        assert category is not None
        assert category.category_type == "income"


def test_review_generate_rule_rejects_ambiguous_new_category_type(admin_login):
    csv_text = """摘要,交易日期,交易金额,账户余额,交易地点/附言
收入,2026-03-01,5000.00,20000.00,工资入账
消费,2026-03-02,-50.00,19950.00,财付通-微信支付-便利店
"""
    batch_id = _post_file(admin_login, "mixed.csv", csv_text.encode("utf-8"))
    _run_to_reprocess(admin_login, batch_id)

    rows = admin_login.get(f"/api/ledger/import-batches/{batch_id}/review-rows").json()["items"]
    row_ids = [int(row["id"]) for row in rows]
    resp = admin_login.post(
        f"/api/ledger/import-batches/{batch_id}/review/generate-rule",
        json={
            "row_ids": row_ids,
            "rule_kind": "category",
            "match_text": "测试样本",
            "target_category_name": "待人工判断",
            "priority": 30,
        },
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ambiguous_category_type"


def test_category_rule_auto_create_uses_income_direction_not_expense(admin_login):
    csv_text = """摘要,交易日期,交易金额,账户余额,交易地点/附言
收入,2026-03-03,1888.00,21888.00,绩效奖金到账
"""
    batch_id = _post_file(admin_login, "bonus.csv", csv_text.encode("utf-8"))
    _run_to_reprocess(admin_login, batch_id)

    with _session() as db:
        db.add(
            LedgerRule(
                owner_role="admin",
                rule_type="category",
                priority=25,
                enabled=True,
                match_mode="contains",
                pattern="绩效奖金",
                direction_condition="income",
                target_scene="绩效奖金收入",
                confidence_score=0.9,
                explain_text="收入规则自动建类",
            )
        )
        db.commit()

    replay_resp = admin_login.post(f"/api/ledger/import-batches/{batch_id}/reprocess")
    assert replay_resp.status_code == 200

    rows = admin_login.get(f"/api/ledger/import-batches/{batch_id}/review-rows").json()["items"]
    assert len(rows) == 1
    assert rows[0]["category_id"] is not None

    with _session() as db:
        category = db.query(LedgerCategory).filter(LedgerCategory.name == "绩效奖金收入").first()
        assert category is not None
        assert category.category_type == "income"
