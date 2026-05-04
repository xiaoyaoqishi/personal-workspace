from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from core.deps import db_session, get_current_role
from core.errors import AppError
from models import LedgerRule
from schemas.ledger import (
    LedgerMerchantCreate,
    LedgerMerchantMergeRequest,
    LedgerMerchantUpdate,
    LedgerReviewBulkCategoryRequest,
    LedgerReviewBulkConfirmRequest,
    LedgerReviewBulkMerchantRequest,
    LedgerReviewGenerateRuleRequest,
    LedgerRuleCreate,
    LedgerRuleDryRunRequest,
    LedgerRuleToggleRequest,
    LedgerRuleUpdate,
)
from services.ledger import analytics_service, category_service, ensure_row_visible
from services.ledger.imports import pipeline
from services.ledger.merchants_service import (
    create_merchant as create_merchant_service,
    delete_merchant as delete_merchant_service,
    list_merchants as list_merchants_service,
    merge_merchants as merge_merchants_service,
    update_merchant as update_merchant_service,
)
from services.ledger.rules.dry_run import dry_run_rule

router = APIRouter(prefix="/api/ledger", tags=["ledger"])


@router.get("/categories")
def list_categories(
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    payload = category_service.list_categories(db, role=role)
    items = payload.get("items") or []
    by_id = {int(x["id"]): {**x, "children": []} for x in items if x.get("id") is not None}
    roots = []
    for item in by_id.values():
        parent_id = item.get("parent_id")
        if parent_id and int(parent_id) in by_id:
            by_id[int(parent_id)]["children"].append(item)
        else:
            roots.append(item)
    return {"items": roots, "total": len(roots)}


@router.post("/import-batches")
def create_import_batch(
    file: UploadFile = File(...),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.create_import_batch(db, role=role, file_name=file.filename or "upload.csv", file_bytes=file.file.read())


@router.get("/import-batches")
def list_import_batches(
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.list_import_batches(db, role=role)


@router.get("/import-batches/{batch_id}")
def get_import_batch(
    batch_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.get_import_batch(db, role=role, batch_id=batch_id)


@router.delete("/import-batches/{batch_id}")
def delete_import_batch(
    batch_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.delete_import_batch(db, role=role, batch_id=batch_id)


@router.post("/import-batches/{batch_id}/parse")
def parse_import_batch(
    batch_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.parse_import_batch(db, role=role, batch_id=batch_id)


@router.post("/import-batches/{batch_id}/classify")
def classify_import_batch(
    batch_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.classify_import_batch(db, role=role, batch_id=batch_id)


@router.post("/import-batches/{batch_id}/dedupe")
def dedupe_import_batch(
    batch_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.dedupe_import_batch(db, role=role, batch_id=batch_id)


@router.post("/import-batches/{batch_id}/reprocess")
def reprocess_import_batch(
    batch_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.reprocess_import_batch(db, role=role, batch_id=batch_id)


@router.get("/import-batches/{batch_id}/review-rows")
def list_review_rows(
    batch_id: int,
    status: Optional[str] = Query(default=None),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.list_review_rows(db, role=role, batch_id=batch_id, status=status)


@router.get("/import-batches/{batch_id}/review-insights")
def get_review_insights(
    batch_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.get_review_insights(db, role=role, batch_id=batch_id)


@router.post("/import-batches/{batch_id}/review/bulk-category")
def review_bulk_set_category(
    batch_id: int,
    payload: LedgerReviewBulkCategoryRequest,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.review_bulk_set_category(db, role=role, batch_id=batch_id, payload=payload)


@router.post("/import-batches/{batch_id}/review/bulk-merchant")
def review_bulk_set_merchant(
    batch_id: int,
    payload: LedgerReviewBulkMerchantRequest,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.review_bulk_set_merchant(db, role=role, batch_id=batch_id, payload=payload)


@router.post("/import-batches/{batch_id}/review/bulk-confirm")
def review_bulk_confirm(
    batch_id: int,
    payload: LedgerReviewBulkConfirmRequest,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.review_bulk_confirm(db, role=role, batch_id=batch_id, payload=payload)


@router.post("/import-batches/{batch_id}/review/reclassify-pending")
def review_reclassify_pending(
    batch_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.review_reclassify_pending(db, role=role, batch_id=batch_id)


@router.post("/import-batches/{batch_id}/review/generate-rule")
def review_generate_rule(
    batch_id: int,
    payload: LedgerReviewGenerateRuleRequest,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.review_generate_rule(db, role=role, batch_id=batch_id, payload=payload)


@router.post("/import-batches/{batch_id}/commit")
def commit_import_batch(
    batch_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.commit_import_batch(db, role=role, batch_id=batch_id)


@router.get("/merchants")
def list_merchants(
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return list_merchants_service(db, role=role)


@router.post("/merchants")
def create_merchant(
    payload: LedgerMerchantCreate,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return create_merchant_service(db, role=role, payload=payload)


@router.post("/merchants/merge")
def merge_merchants(
    payload: LedgerMerchantMergeRequest,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return merge_merchants_service(db, role=role, source_ids=payload.source_ids, target_id=payload.target_id)


@router.put("/merchants/{merchant_id}")
def update_merchant(
    merchant_id: int,
    payload: LedgerMerchantUpdate,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return update_merchant_service(db, role=role, merchant_id=merchant_id, payload=payload)


@router.delete("/merchants/{merchant_id}")
def delete_merchant(
    merchant_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return delete_merchant_service(db, role=role, merchant_id=merchant_id)


@router.get("/rules")
def list_rules(
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.list_rules(db, role=role)


@router.post("/rules")
def create_rule(
    payload: LedgerRuleCreate,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.create_rule(db, role=role, payload=payload)


@router.post("/rules/dry-run")
def rule_dry_run(
    payload: LedgerRuleDryRunRequest,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return dry_run_rule(db, role=role, payload=payload, limit=payload.limit)


@router.put("/rules/{rule_id}")
def update_rule(
    rule_id: int,
    payload: LedgerRuleUpdate,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.update_rule(db, role=role, rule_id=rule_id, payload=payload)


@router.post("/rules/{rule_id}/toggle")
def toggle_rule(
    rule_id: int,
    payload: LedgerRuleToggleRequest,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    try:
        row = db.query(LedgerRule).filter(
            LedgerRule.id == rule_id,
            LedgerRule.is_deleted == False,  # noqa: E712
        ).first()
        if not row:
            raise AppError("not_found", "规则不存在", status_code=404)
        ensure_row_visible(row.owner_role, role)
        row.enabled = payload.enabled
        db.commit()
        return {"ok": True, "id": rule_id, "enabled": bool(row.enabled)}
    except AppError:
        raise
    except Exception as exc:
        db.rollback()
        raise AppError("toggle_rule_failed", f"切换规则状态失败: {exc}", status_code=500)


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return pipeline.delete_rule(db, role=role, rule_id=rule_id)


@router.get("/analytics/summary")
def analytics_summary(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return analytics_service.get_summary(db, role=role, date_from=date_from, date_to=date_to)


@router.get("/analytics/category-breakdown")
def analytics_category_breakdown(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return analytics_service.get_category_breakdown(db, role=role, date_from=date_from, date_to=date_to)


@router.get("/analytics/platform-breakdown")
def analytics_platform_breakdown(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return analytics_service.get_platform_breakdown(db, role=role, date_from=date_from, date_to=date_to)


@router.get("/analytics/top-merchants")
def analytics_top_merchants(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return analytics_service.get_top_merchants(db, role=role, date_from=date_from, date_to=date_to, limit=limit)


@router.get("/analytics/monthly-trend")
def analytics_monthly_trend(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    granularity: str = Query("month"),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return analytics_service.get_monthly_trend(db, role=role, date_from=date_from, date_to=date_to, granularity=granularity)


@router.get("/analytics/unrecognized-breakdown")
def analytics_unrecognized_breakdown(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return analytics_service.get_unrecognized_breakdown(db, role=role, date_from=date_from, date_to=date_to)


@router.get("/analytics/daily-heatmap")
def analytics_daily_heatmap(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return analytics_service.get_daily_heatmap(db, role=role, date_from=date_from, date_to=date_to)


@router.get("/analytics/category-detail")
def analytics_category_detail(
    category_name: str = Query(...),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return analytics_service.get_category_detail(db, role=role, date_from=date_from, date_to=date_to, category_name=category_name)
