from datetime import date
from typing import Literal, Optional
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from core.db import get_db
from schemas.discipline_screen import ScreenAppEdit, ScreenDeviceEdit, ScreenImportInput
from services.discipline_screen import analytics, collectors, store

router = APIRouter(prefix='/api/discipline/screen', tags=['discipline-screen'])


@router.get('/overview')
def overview(start: date, end: date, device: Optional[str] = Query(None, max_length=120), db: Session = Depends(get_db)):
    return analytics.overview(db, start, end, device)


@router.get('/sessions')
def sessions(start: date, end: date, device: Optional[str] = Query(None, max_length=120),
             app: Optional[str] = Query(None, max_length=250), status: Literal['normal', 'anomaly'] = 'normal',
             offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db)):
    return analytics.list_sessions(db, start, end, device, app, status, offset, limit)


@router.get('/export')
def export(start: date, end: date, device: Optional[str] = Query(None, max_length=120),
           app: Optional[str] = Query(None, max_length=250), db: Session = Depends(get_db)):
    return Response(analytics.export_csv(db, start, end, device, app), media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="screen-time-{start}-{end}.csv"'})


@router.post('/imports')
def import_records(body: ScreenImportInput, db: Session = Depends(get_db)):
    return store.import_events(db, body)


@router.put('/devices/{device_key}')
def rename_device(device_key: str, body: ScreenDeviceEdit, db: Session = Depends(get_db)):
    return store.rename_device(db, device_key, body)


@router.put('/apps')
def edit_app(body: ScreenAppEdit, db: Session = Depends(get_db)):
    return store.edit_app(db, body)


@router.get('/collectors')
def list_collectors(db: Session = Depends(get_db)):
    return collectors.list_collectors(db)


@router.post('/collectors')
def create_collector(body: ScreenDeviceEdit, db: Session = Depends(get_db)):
    return collectors.create(db, body.name)


@router.delete('/collectors/{key}')
def revoke_collector(key: str, db: Session = Depends(get_db)):
    return collectors.revoke(db, key)


@router.post('/collector/imports')
def collector_import(request: Request, body: ScreenImportInput, db: Session = Depends(get_db)):
    return store.import_events(db, body, request.state.collector_id)


@router.get('/collector/status')
def collector_status(request: Request, db: Session = Depends(get_db)):
    return collectors.status(db, request.state.collector_id)
