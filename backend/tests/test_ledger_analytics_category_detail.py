from datetime import datetime

import core.db as core_db
from models import LedgerCategory, LedgerMerchant, LedgerTransaction
from services.ledger import analytics_service


def _session():
    return core_db.SessionLocal()


def test_get_category_detail_returns_subcategories_and_transactions(app):
    with _session() as db:
        parent = LedgerCategory(name="餐饮", category_type="expense", owner_role="admin", is_deleted=False)
        sub = LedgerCategory(name="午餐", category_type="expense", owner_role="admin", is_deleted=False)
        db.add_all([parent, sub])
        db.flush()
        sub.parent_id = parent.id
        db.add_all([
            LedgerTransaction(
                occurred_at=datetime(2026, 3, 10, 12, 0, 0),
                amount=28.5,
                direction="expense",
                owner_role="admin",
                category_id=parent.id,
                subcategory_id=sub.id,
                merchant_normalized="食堂A",
                description="午饭",
                is_deleted=False,
            ),
            LedgerTransaction(
                occurred_at=datetime(2026, 3, 11, 18, 30, 0),
                amount=36.0,
                direction="expense",
                owner_role="admin",
                category_id=parent.id,
                merchant_normalized="餐馆B",
                description="晚饭",
                is_deleted=False,
            ),
            LedgerTransaction(
                occurred_at=datetime(2026, 3, 12, 9, 0, 0),
                amount=80.0,
                direction="expense",
                owner_role="admin",
                category_id=parent.id,
                merchant_raw="国泰君安期货",
                description="期货保证金",
                is_deleted=False,
            ),
        ])
        db.commit()

        detail = analytics_service.get_category_detail(
            db,
            role="admin",
            date_from=datetime(2026, 3, 1).date(),
            date_to=datetime(2026, 3, 31).date(),
            category_name="餐饮",
        )

    assert detail["subcategories"]
    names = {item["name"] for item in detail["subcategories"]}
    assert "午餐" in names
    assert len(detail["transactions"]) == 2
    assert all("期货" not in (item["merchant"] or "") for item in detail["transactions"])
    assert all(item["amount"] > 0 for item in detail["transactions"])
    assert detail["total_count"] == 2


def test_analytics_excludes_futures_merchant_dictionary_from_income_and_expense(app):
    with _session() as db:
        futures_merchant = LedgerMerchant(
            canonical_name="中信期货",
            aliases_json="[]",
            tags_json="[]",
            owner_role="admin",
            is_deleted=False,
        )
        db.add(futures_merchant)
        db.flush()
        db.add_all([
            LedgerTransaction(
                occurred_at=datetime(2026, 4, 1, 9, 0, 0),
                amount=100.0,
                direction="expense",
                owner_role="admin",
                merchant_normalized="普通商户",
                is_deleted=False,
            ),
            LedgerTransaction(
                occurred_at=datetime(2026, 4, 2, 9, 0, 0),
                amount=30.0,
                direction="income",
                owner_role="admin",
                merchant_normalized="普通收入商户",
                is_deleted=False,
            ),
            LedgerTransaction(
                occurred_at=datetime(2026, 4, 3, 9, 0, 0),
                amount=800.0,
                direction="expense",
                owner_role="admin",
                merchant_id=futures_merchant.id,
                is_deleted=False,
            ),
            LedgerTransaction(
                occurred_at=datetime(2026, 4, 4, 9, 0, 0),
                amount=500.0,
                direction="income",
                owner_role="admin",
                merchant_id=futures_merchant.id,
                is_deleted=False,
            ),
        ])
        db.commit()

        summary = analytics_service.get_summary(
            db,
            role="admin",
            date_from=datetime(2026, 4, 1).date(),
            date_to=datetime(2026, 4, 30).date(),
        )

    assert summary["transaction_count"] == 2
    assert summary["total_expense"] == 100.0
    assert summary["total_income"] == 30.0
