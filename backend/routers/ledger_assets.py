from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.deps import db_session, get_current_role
from schemas.ledger_assets import LedgerAssetCreate, LedgerAssetEventCreate, LedgerAssetUpdate
from services.ledger import assets_service

router = APIRouter(prefix="/api/ledger/assets", tags=["ledger"])


@router.get("")
def list_assets(
    keyword: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    asset_type: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    include_deleted: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return assets_service.list_assets(
        db,
        role=role,
        keyword=keyword,
        status=status,
        asset_type=asset_type,
        category=category,
        tag=tag,
        include_deleted=include_deleted,
        limit=limit,
        offset=offset,
    )


@router.post("")
def create_asset(
    payload: LedgerAssetCreate,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return assets_service.create_asset(db, role=role, payload=payload)


@router.get("/summary")
def get_asset_summary(
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return assets_service.get_asset_summary(db, role=role)


@router.get("/{asset_id}")
def get_asset(
    asset_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return assets_service.get_asset(db, role=role, asset_id=asset_id)


@router.put("/{asset_id}")
def update_asset(
    asset_id: int,
    payload: LedgerAssetUpdate,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return assets_service.update_asset(db, role=role, asset_id=asset_id, payload=payload)


@router.delete("/{asset_id}")
def delete_asset(
    asset_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return assets_service.soft_delete_asset(db, role=role, asset_id=asset_id)


@router.get("/{asset_id}/events")
def list_asset_events(
    asset_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return assets_service.list_asset_events(db, role=role, asset_id=asset_id)


@router.post("/{asset_id}/events")
def add_asset_event(
    asset_id: int,
    payload: LedgerAssetEventCreate,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return assets_service.add_asset_event(db, role=role, asset_id=asset_id, payload=payload)


@router.delete("/{asset_id}/events/{event_id}")
def delete_asset_event(
    asset_id: int,
    event_id: int,
    db: Session = Depends(db_session),
    role: str = Depends(get_current_role),
):
    return assets_service.delete_asset_event(db, role=role, asset_id=asset_id, event_id=event_id)
