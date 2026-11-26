from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.db import get_db
from schemas.discipline import PlanWrite
from services import discipline_service as service

router = APIRouter(prefix='/api/discipline', tags=['discipline'])


@router.get('/calendar')
def get_calendar(year: int = Query(..., ge=1970, le=2100), month: int = Query(..., ge=1, le=12), db: Session = Depends(get_db)):
    return service.month_summary(db, year, month)


@router.get('/template')
def get_template(db: Session = Depends(get_db)):
    return service.read_plan(db, 'template')


@router.get('/template/history')
def get_template_history(offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    return service.list_template_versions(db, offset, limit)


@router.get('/template/history/{revision}')
def get_template_version(revision: int, db: Session = Depends(get_db)):
    return service.get_template_version(db, revision)


@router.put('/template')
def put_template(body: PlanWrite, db: Session = Depends(get_db)):
    return service.save_plan(db, 'template', body)


@router.get('/days/{day}')
def get_day(day: date, db: Session = Depends(get_db)):
    return service.read_plan(db, day.isoformat())


@router.put('/days/{day}')
def put_day(day: date, body: PlanWrite, db: Session = Depends(get_db)):
    return service.save_plan(db, day.isoformat(), body)
