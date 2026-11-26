from datetime import date
from typing import Literal, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.db import get_db
from schemas.discipline_ai import AIGenerate, AISettings
from services.discipline_ai import service

router = APIRouter(prefix='/api/discipline/ai', tags=['discipline-ai'])


@router.get('/overview')
def overview(period: Literal['day', 'week'], anchor: date, db: Session = Depends(get_db)):
    return service.overview(db, period, anchor)


@router.post('/reports')
def generate(body: AIGenerate, db: Session = Depends(get_db)):
    return service.create_report(db, body)


@router.get('/reports/{key}')
def report(key: str, db: Session = Depends(get_db)):
    return service.report_view(db, key)


@router.get('/history')
def history(period: Optional[Literal['day', 'week']] = None, limit: int = Query(20, ge=1, le=50), db: Session = Depends(get_db)):
    return service.history(db, period, limit)


@router.get('/settings')
def settings(db: Session = Depends(get_db)):
    return service.settings_view(db)


@router.put('/settings')
def save_settings(body: AISettings, db: Session = Depends(get_db)):
    return service.save_settings(db, body)
