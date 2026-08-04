from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from core.db import get_db
from models import Trade, TradeInstrument
from models.review import TradePlan
from schemas import TradeInstrumentCreate, TradeInstrumentUpdate


DEFAULT_FUTURES_INSTRUMENTS = {
    "IF": "沪深300股指", "IH": "上证50股指", "IC": "中证500股指", "IM": "中证1000股指",
    "T": "10年国债", "TF": "5年国债", "TS": "2年国债", "TL": "30年国债",
    "AU": "沪金", "AG": "沪银", "CU": "沪铜", "AL": "沪铝", "ZN": "沪锌", "PB": "沪铅",
    "NI": "沪镍", "SN": "沪锡", "SS": "不锈钢", "RB": "螺纹钢", "HC": "热卷",
    "FU": "燃料油", "BU": "沥青", "RU": "橡胶", "SP": "纸浆", "BR": "丁二烯橡胶",
    "SC": "原油", "NR": "20号胶", "LU": "低硫燃料油", "BC": "国际铜", "EB": "苯乙烯",
    "EG": "乙二醇", "SA": "纯碱", "PF": "短纤", "UR": "尿素", "TA": "PTA", "MA": "甲醇",
    "FG": "玻璃", "ZC": "动力煤", "SR": "白糖", "CF": "棉花", "CY": "棉纱", "AP": "苹果",
    "CJ": "红枣", "PK": "花生", "OI": "菜油", "RM": "菜粕", "SF": "硅铁", "SM": "锰硅",
    "PR": "瓶片", "PS": "多晶硅", "PX": "对二甲苯", "C": "玉米", "CS": "玉米淀粉",
    "A": "豆一", "B": "豆二", "M": "豆粕", "Y": "豆油", "P": "棕榈油", "I": "铁矿石",
    "J": "焦炭", "JM": "焦煤", "L": "聚乙烯", "PP": "聚丙烯", "V": "PVC",
    "PG": "液化石油气", "LH": "生猪", "JD": "鸡蛋", "RR": "粳米", "BB": "胶合板",
    "FB": "纤维板", "SI": "工业硅", "LC": "碳酸锂",
}


def _clean_code(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def _clean_required(value: Optional[str], label: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(400, f"{label}不能为空")
    return cleaned


def seed_default_trade_instruments(db: Session) -> None:
    if db.query(TradeInstrument.id).first():
        return
    defaults = [
        TradeInstrument(code=code, name=name, instrument_type="期货")
        for code, name in DEFAULT_FUTURES_INSTRUMENTS.items()
    ]
    if defaults:
        db.add_all(defaults)
        db.commit()


def list_trade_instruments(db: Session = Depends(get_db)):
    return db.query(TradeInstrument).filter(TradeInstrument.is_active == True).order_by(  # noqa: E712
        TradeInstrument.instrument_type.asc(),
        TradeInstrument.code.asc(),
    ).all()


def create_trade_instrument(data: TradeInstrumentCreate, db: Session = Depends(get_db)):
    code = _clean_code(data.code)
    name = _clean_required(data.name, "品种名称")
    instrument_type = _clean_required(data.instrument_type, "交易类型")
    if not code:
        raise HTTPException(400, "品种代码不能为空")
    existed = db.query(TradeInstrument).filter(TradeInstrument.code == code).first()
    if existed and existed.is_active:
        raise HTTPException(400, "该品种代码已存在")
    if existed:
        existed.name = name
        existed.instrument_type = instrument_type
        existed.category = (data.category or "").strip() or None
        existed.is_active = True
        db.commit()
        db.refresh(existed)
        return existed
    obj = TradeInstrument(
        code=code,
        name=name,
        instrument_type=instrument_type,
        category=(data.category or "").strip() or None,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_trade_instrument(
    instrument_id: int,
    data: TradeInstrumentUpdate,
    db: Session = Depends(get_db),
):
    obj = db.query(TradeInstrument).filter(
        TradeInstrument.id == instrument_id,
        TradeInstrument.is_active == True,  # noqa: E712
    ).first()
    if not obj:
        raise HTTPException(404, "品种不存在")

    payload = data.model_dump(exclude_unset=True)
    old_code = obj.code
    if "code" in payload:
        code = _clean_code(payload.get("code"))
        if not code:
            raise HTTPException(400, "品种代码不能为空")
        existed = db.query(TradeInstrument).filter(
            TradeInstrument.code == code,
            TradeInstrument.id != instrument_id,
        ).first()
        if existed:
            raise HTTPException(400, "该品种代码已存在")
        obj.code = code
        if code != old_code:
            db.query(Trade).filter(Trade.symbol == old_code).update({Trade.symbol: code}, synchronize_session=False)
            db.query(TradePlan).filter(TradePlan.symbol == old_code).update(
                {TradePlan.symbol: code}, synchronize_session=False
            )
    if "name" in payload:
        obj.name = _clean_required(payload.get("name"), "品种名称")
    if "instrument_type" in payload:
        obj.instrument_type = _clean_required(payload.get("instrument_type"), "交易类型")
    if "category" in payload:
        obj.category = (payload.get("category") or "").strip() or None
    db.commit()
    db.refresh(obj)
    return obj


def delete_trade_instrument(instrument_id: int, db: Session = Depends(get_db)):
    obj = db.query(TradeInstrument).filter(
        TradeInstrument.id == instrument_id,
        TradeInstrument.is_active == True,  # noqa: E712
    ).first()
    if not obj:
        raise HTTPException(404, "品种不存在")
    obj.is_active = False
    db.commit()
    return {"ok": True}
