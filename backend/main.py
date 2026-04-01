from fastapi import FastAPI, Depends, HTTPException, Query, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
import json
import os
import uuid
import shutil
import threading
import time as _time
from datetime import datetime
from collections import deque

import psutil

DEV_MODE = os.environ.get("DEV_MODE", "0") == "1"

from database import engine, get_db, Base, SessionLocal
from models import Trade, Review, Notebook, Note
from schemas import (
    TradeCreate, TradeUpdate, TradeResponse,
    ReviewCreate, ReviewUpdate, ReviewResponse,
    NotebookCreate, NotebookUpdate, NotebookResponse,
    NoteCreate, NoteUpdate, NoteResponse,
)
from auth import load_credentials, save_credentials, check_login, create_token, verify_token

Base.metadata.create_all(bind=engine)


def _init_default_notebooks():
    db = SessionLocal()
    try:
        if db.query(Notebook).count() == 0:
            db.add_all([
                Notebook(name="日记本", icon="📔", sort_order=0),
                Notebook(name="文档", icon="📄", sort_order=1),
            ])
            db.commit()
    finally:
        db.close()


_init_default_notebooks()

app = FastAPI(title="交易记录系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AUTH_COOKIE = "session_token"
AUTH_WHITELIST = {"/api/auth/login", "/api/auth/check", "/api/auth/setup"}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if DEV_MODE:
            return await call_next(request)
        if request.url.path.startswith("/api/") and request.url.path not in AUTH_WHITELIST:
            token = request.cookies.get(AUTH_COOKIE)
            if not token or not verify_token(token):
                return JSONResponse(status_code=401, content={"detail": "未登录"})
        return await call_next(request)


app.add_middleware(AuthMiddleware)


class LoginBody(BaseModel):
    username: str
    password: str


@app.get("/api/auth/check")
def auth_check(request: Request):
    token = request.cookies.get(AUTH_COOKIE)
    if token and verify_token(token):
        return {"authenticated": True, "username": verify_token(token)}
    return {"authenticated": False}


@app.post("/api/auth/setup")
def auth_setup(body: LoginBody):
    if load_credentials():
        raise HTTPException(400, "账号已存在，无法重复初始化")
    save_credentials(body.username, body.password)
    return {"ok": True}


@app.post("/api/auth/login")
def auth_login(body: LoginBody, response: Response):
    if not load_credentials():
        raise HTTPException(400, "请先初始化账号 (POST /api/auth/setup)")
    if not check_login(body.username, body.password):
        raise HTTPException(401, "用户名或密码错误")
    token = create_token(body.username)
    response.set_cookie(
        AUTH_COOKIE, token,
        max_age=7 * 86400, httponly=True, samesite="lax", path="/",
    )
    return {"ok": True, "username": body.username}


@app.post("/api/auth/logout")
def auth_logout(response: Response):
    response.delete_cookie(AUTH_COOKIE, path="/")
    return {"ok": True}


# ── Upload ──

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支持的文件格式: {ext}")
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"url": f"/api/uploads/{filename}"}


@app.get("/api/uploads/{filename}")
def get_upload(filename: str):
    safe = os.path.basename(filename)
    path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path)


# ── Trade ──


@app.get("/api/trades", response_model=List[TradeResponse])
def list_trades(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    instrument_type: Optional[str] = None,
    symbol: Optional[str] = None,
    direction: Optional[str] = None,
    status: Optional[str] = None,
    strategy_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Trade)
    if date_from:
        q = q.filter(Trade.trade_date >= date_from)
    if date_to:
        q = q.filter(Trade.trade_date <= date_to)
    if instrument_type:
        q = q.filter(Trade.instrument_type == instrument_type)
    if symbol:
        q = q.filter(Trade.symbol == symbol)
    if direction:
        q = q.filter(Trade.direction == direction)
    if status:
        q = q.filter(Trade.status == status)
    if strategy_type:
        q = q.filter(Trade.strategy_type == strategy_type)
    return q.order_by(Trade.open_time.desc()).offset((page - 1) * size).limit(size).all()


@app.get("/api/trades/statistics")
def get_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    instrument_type: Optional[str] = None,
    symbol: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Trade).filter(Trade.status == "closed")
    if date_from:
        q = q.filter(Trade.trade_date >= date_from)
    if date_to:
        q = q.filter(Trade.trade_date <= date_to)
    if instrument_type:
        q = q.filter(Trade.instrument_type == instrument_type)
    if symbol:
        q = q.filter(Trade.symbol == symbol)

    trades = q.all()
    empty = {
        "total": 0, "win_count": 0, "loss_count": 0,
        "win_rate": 0, "total_pnl": 0, "avg_pnl": 0,
        "max_pnl": 0, "min_pnl": 0, "avg_win": 0, "avg_loss": 0,
        "profit_loss_ratio": 0,
        "max_consecutive_wins": 0, "max_consecutive_losses": 0,
        "pnl_by_symbol": [], "pnl_by_strategy": [],
        "pnl_over_time": [], "error_tag_counts": [],
    }
    if not trades:
        return empty

    pnls = [t.pnl or 0 for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]

    max_cw = max_cl = cw = cl = 0
    for p in pnls:
        if p > 0:
            cw += 1; cl = 0; max_cw = max(max_cw, cw)
        elif p < 0:
            cl += 1; cw = 0; max_cl = max(max_cl, cl)
        else:
            cw = cl = 0

    sym_pnl: dict[str, float] = {}
    for t in trades:
        sym_pnl[t.symbol] = sym_pnl.get(t.symbol, 0) + (t.pnl or 0)

    strat: dict[str, dict] = {}
    for t in trades:
        if t.strategy_type:
            s = strat.setdefault(t.strategy_type, {"pnl": 0, "count": 0, "wins": 0})
            s["pnl"] += t.pnl or 0
            s["count"] += 1
            if (t.pnl or 0) > 0:
                s["wins"] += 1

    daily: dict[str, float] = {}
    for t in trades:
        d = str(t.trade_date)
        daily[d] = daily.get(d, 0) + (t.pnl or 0)

    cum = 0
    pnl_over_time = []
    for d in sorted(daily):
        cum += daily[d]
        pnl_over_time.append({"date": d, "daily_pnl": round(daily[d], 2), "cumulative_pnl": round(cum, 2)})

    err: dict[str, int] = {}
    for t in trades:
        if t.error_tags:
            try:
                for tag in json.loads(t.error_tags):
                    err[tag] = err.get(tag, 0) + 1
            except Exception:
                pass

    avg_w = round(sum(wins) / len(wins), 2) if wins else 0
    avg_l = round(sum(losses) / len(losses), 2) if losses else 0

    return {
        "total": len(trades),
        "win_count": len(wins),
        "loss_count": len(losses),
        "win_rate": round(len(wins) / len(trades) * 100, 2),
        "total_pnl": round(sum(pnls), 2),
        "avg_pnl": round(sum(pnls) / len(pnls), 2),
        "max_pnl": round(max(pnls), 2),
        "min_pnl": round(min(pnls), 2),
        "avg_win": avg_w,
        "avg_loss": avg_l,
        "profit_loss_ratio": round(abs(avg_w / avg_l), 2) if avg_l else 0,
        "max_consecutive_wins": max_cw,
        "max_consecutive_losses": max_cl,
        "pnl_by_symbol": [{"symbol": k, "pnl": round(v, 2)} for k, v in sorted(sym_pnl.items(), key=lambda x: x[1], reverse=True)],
        "pnl_by_strategy": [
            {"strategy": k, "pnl": round(v["pnl"], 2), "count": v["count"],
             "win_rate": round(v["wins"] / v["count"] * 100, 2)}
            for k, v in strat.items()
        ],
        "pnl_over_time": pnl_over_time,
        "error_tag_counts": [{"tag": k, "count": v} for k, v in sorted(err.items(), key=lambda x: x[1], reverse=True)],
    }


@app.post("/api/trades", response_model=TradeResponse)
def create_trade(trade: TradeCreate, db: Session = Depends(get_db)):
    obj = Trade(**trade.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.get("/api/trades/{trade_id}", response_model=TradeResponse)
def get_trade(trade_id: int, db: Session = Depends(get_db)):
    t = db.query(Trade).filter(Trade.id == trade_id).first()
    if not t:
        raise HTTPException(404, "Trade not found")
    return t


@app.put("/api/trades/{trade_id}", response_model=TradeResponse)
def update_trade(trade_id: int, data: TradeUpdate, db: Session = Depends(get_db)):
    t = db.query(Trade).filter(Trade.id == trade_id).first()
    if not t:
        raise HTTPException(404, "Trade not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


@app.delete("/api/trades/{trade_id}")
def delete_trade(trade_id: int, db: Session = Depends(get_db)):
    t = db.query(Trade).filter(Trade.id == trade_id).first()
    if not t:
        raise HTTPException(404, "Trade not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


# ── Review ──


@app.get("/api/reviews", response_model=List[ReviewResponse])
def list_reviews(
    review_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(Review)
    if review_type:
        q = q.filter(Review.review_type == review_type)
    if date_from:
        q = q.filter(Review.review_date >= date_from)
    if date_to:
        q = q.filter(Review.review_date <= date_to)
    return q.order_by(Review.review_date.desc()).offset((page - 1) * size).limit(size).all()


@app.post("/api/reviews", response_model=ReviewResponse)
def create_review(review: ReviewCreate, db: Session = Depends(get_db)):
    obj = Review(**review.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.get("/api/reviews/{review_id}", response_model=ReviewResponse)
def get_review(review_id: int, db: Session = Depends(get_db)):
    r = db.query(Review).filter(Review.id == review_id).first()
    if not r:
        raise HTTPException(404, "Review not found")
    return r


@app.put("/api/reviews/{review_id}", response_model=ReviewResponse)
def update_review(review_id: int, data: ReviewUpdate, db: Session = Depends(get_db)):
    r = db.query(Review).filter(Review.id == review_id).first()
    if not r:
        raise HTTPException(404, "Review not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


@app.delete("/api/reviews/{review_id}")
def delete_review(review_id: int, db: Session = Depends(get_db)):
    r = db.query(Review).filter(Review.id == review_id).first()
    if not r:
        raise HTTPException(404, "Review not found")
    db.delete(r)
    db.commit()
    return {"ok": True}


# ── Notebook ──


@app.get("/api/notebooks", response_model=List[NotebookResponse])
def list_notebooks(db: Session = Depends(get_db)):
    return db.query(Notebook).order_by(Notebook.sort_order, Notebook.id).all()


@app.post("/api/notebooks", response_model=NotebookResponse)
def create_notebook(data: NotebookCreate, db: Session = Depends(get_db)):
    obj = Notebook(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.put("/api/notebooks/{nb_id}", response_model=NotebookResponse)
def update_notebook(nb_id: int, data: NotebookUpdate, db: Session = Depends(get_db)):
    nb = db.query(Notebook).filter(Notebook.id == nb_id).first()
    if not nb:
        raise HTTPException(404, "Notebook not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(nb, k, v)
    db.commit()
    db.refresh(nb)
    return nb


@app.delete("/api/notebooks/{nb_id}")
def delete_notebook(nb_id: int, db: Session = Depends(get_db)):
    nb = db.query(Notebook).filter(Notebook.id == nb_id).first()
    if not nb:
        raise HTTPException(404, "Notebook not found")
    db.delete(nb)
    db.commit()
    return {"ok": True}


# ── Note ──


@app.get("/api/notes", response_model=List[NoteResponse])
def list_notes(
    notebook_id: Optional[int] = None,
    note_type: Optional[str] = None,
    note_date: Optional[str] = None,
    keyword: Optional[str] = None,
    tag: Optional[str] = None,
    is_pinned: Optional[bool] = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(Note)
    if notebook_id:
        q = q.filter(Note.notebook_id == notebook_id)
    if note_type:
        q = q.filter(Note.note_type == note_type)
    if note_date:
        q = q.filter(Note.note_date == note_date)
    if keyword:
        q = q.filter(
            (Note.title.contains(keyword)) | (Note.content.contains(keyword))
        )
    if tag:
        q = q.filter(Note.tags.contains(tag))
    if is_pinned is not None:
        q = q.filter(Note.is_pinned == is_pinned)
    return (
        q.order_by(Note.is_pinned.desc(), Note.updated_at.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )


@app.get("/api/notes/stats")
def note_stats(db: Session = Depends(get_db)):
    from sqlalchemy import func as sqlfunc
    diary_count = db.query(Note).filter(Note.note_type == "diary").count()
    doc_count = db.query(Note).filter(Note.note_type == "doc").count()
    diary_words = db.query(sqlfunc.coalesce(sqlfunc.sum(Note.word_count), 0)).filter(Note.note_type == "diary").scalar()
    doc_words = db.query(sqlfunc.coalesce(sqlfunc.sum(Note.word_count), 0)).filter(Note.note_type == "doc").scalar()
    recent_docs = (
        db.query(Note)
        .filter(Note.note_type == "doc")
        .order_by(Note.updated_at.desc())
        .limit(8)
        .all()
    )
    return {
        "diary_count": diary_count,
        "doc_count": doc_count,
        "diary_word_count": diary_words,
        "doc_word_count": doc_words,
        "recent_docs": [
            {"id": n.id, "title": n.title or "无标题", "updated_at": str(n.updated_at)}
            for n in recent_docs
        ],
    }


@app.get("/api/notes/history-today")
def history_today(db: Session = Depends(get_db)):
    from datetime import date as dt_date
    from sqlalchemy import func as sqlfunc
    today = dt_date.today()
    md = today.strftime("%m-%d")
    notes = (
        db.query(Note)
        .filter(
            Note.note_type == "diary",
            Note.note_date.isnot(None),
            sqlfunc.strftime("%m-%d", Note.note_date) == md,
            sqlfunc.strftime("%Y", Note.note_date) != str(today.year),
        )
        .order_by(Note.note_date.desc())
        .all()
    )
    return [
        {"id": n.id, "title": n.title, "note_date": str(n.note_date)}
        for n in notes
    ]


@app.get("/api/notes/diary-tree")
def diary_tree(db: Session = Depends(get_db)):
    from sqlalchemy import func as sqlfunc
    notes = (
        db.query(Note.id, Note.title, Note.note_date)
        .filter(Note.note_type == "diary", Note.note_date.isnot(None))
        .order_by(Note.note_date.desc())
        .all()
    )
    tree = {}
    for n in notes:
        y = str(n.note_date.year) + "年"
        m = str(n.note_date.month) + "月"
        d = str(n.note_date.day).zfill(2) + "日"
        tree.setdefault(y, {}).setdefault(m, []).append(
            {"id": n.id, "title": n.title, "date": str(n.note_date), "day": d}
        )
    return tree


@app.get("/api/notes/calendar")
def notes_calendar(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    from sqlalchemy import extract
    dates = (
        db.query(Note.note_date)
        .filter(
            Note.note_type == "diary",
            Note.note_date.isnot(None),
            extract("year", Note.note_date) == year,
            extract("month", Note.note_date) == month,
        )
        .distinct()
        .all()
    )
    return [str(d[0]) for d in dates]


@app.post("/api/notes", response_model=NoteResponse)
def create_note(data: NoteCreate, db: Session = Depends(get_db)):
    nb = db.query(Notebook).filter(Notebook.id == data.notebook_id).first()
    if not nb:
        raise HTTPException(404, "Notebook not found")
    obj = Note(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.get("/api/notes/{note_id}", response_model=NoteResponse)
def get_note(note_id: int, db: Session = Depends(get_db)):
    n = db.query(Note).filter(Note.id == note_id).first()
    if not n:
        raise HTTPException(404, "Note not found")
    return n


@app.put("/api/notes/{note_id}", response_model=NoteResponse)
def update_note(note_id: int, data: NoteUpdate, db: Session = Depends(get_db)):
    n = db.query(Note).filter(Note.id == note_id).first()
    if not n:
        raise HTTPException(404, "Note not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(n, k, v)
    db.commit()
    db.refresh(n)
    return n


@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    n = db.query(Note).filter(Note.id == note_id).first()
    if not n:
        raise HTTPException(404, "Note not found")
    db.delete(n)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════
#  Server Monitor
# ══════════════════════════════════════════

_monitor_history: deque = deque(maxlen=720)
_prev_net = psutil.net_io_counters()
_prev_disk_io = psutil.disk_io_counters()
_prev_ts = _time.time()
_net_speed = {"up": 0.0, "down": 0.0}
_disk_speed = {"read": 0.0, "write": 0.0}


def _bytes_fmt(b):
    for u in ["B", "KB", "MB", "GB", "TB"]:
        if b < 1024:
            return f"{b:.1f} {u}"
        b /= 1024
    return f"{b:.1f} PB"


def _seconds_fmt(s):
    d, s = divmod(int(s), 86400)
    h, s = divmod(s, 3600)
    m, s = divmod(s, 60)
    parts = []
    if d:
        parts.append(f"{d}天")
    if h:
        parts.append(f"{h}小时")
    if m:
        parts.append(f"{m}分钟")
    parts.append(f"{s}秒")
    return " ".join(parts)


def _sample():
    global _prev_net, _prev_disk_io, _prev_ts, _net_speed, _disk_speed
    now = _time.time()
    dt = now - _prev_ts
    if dt <= 0:
        dt = 1

    net = psutil.net_io_counters()
    _net_speed = {
        "up": (net.bytes_sent - _prev_net.bytes_sent) / dt,
        "down": (net.bytes_recv - _prev_net.bytes_recv) / dt,
    }
    _prev_net = net

    try:
        dio = psutil.disk_io_counters()
        if dio:
            _disk_speed = {
                "read": (dio.read_bytes - _prev_disk_io.read_bytes) / dt,
                "write": (dio.write_bytes - _prev_disk_io.write_bytes) / dt,
            }
            _prev_disk_io = dio
    except Exception:
        pass

    _prev_ts = now

    cpu_pct = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory()
    _monitor_history.append({
        "ts": datetime.now().strftime("%H:%M:%S"),
        "cpu": cpu_pct,
        "mem": mem.percent,
        "net_up": round(_net_speed["up"] / 1024, 1),
        "net_down": round(_net_speed["down"] / 1024, 1),
    })


def _monitor_loop():
    psutil.cpu_percent(interval=None)
    while True:
        try:
            _sample()
        except Exception:
            pass
        _time.sleep(5)


_monitor_thread = threading.Thread(target=_monitor_loop, daemon=True)
_monitor_thread.start()


def _get_system_info():
    import platform
    boot = psutil.boot_time()
    uptime = _time.time() - boot
    hostname = platform.node()
    kernel = platform.release()
    arch = platform.machine()
    try:
        with open("/etc/os-release") as f:
            lines = f.readlines()
        distro = dict(l.strip().split("=", 1) for l in lines if "=" in l)
        os_name = distro.get("PRETTY_NAME", "").strip('"')
    except Exception:
        os_name = f"{platform.system()} {platform.version()}"
    return {
        "hostname": hostname,
        "os": os_name,
        "kernel": kernel,
        "arch": arch,
        "uptime": _seconds_fmt(uptime),
        "uptime_seconds": int(uptime),
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def _get_cpu_info():
    freq = psutil.cpu_freq()
    try:
        load = os.getloadavg()
        load_1, load_5, load_15 = round(load[0], 2), round(load[1], 2), round(load[2], 2)
    except (AttributeError, OSError):
        load_1 = load_5 = load_15 = 0.0
    temps = {}
    try:
        t = psutil.sensors_temperatures()
        if t:
            for name, entries in t.items():
                for e in entries:
                    if e.current > 0:
                        temps[e.label or name] = round(e.current, 1)
    except (AttributeError, Exception):
        pass
    return {
        "percent": psutil.cpu_percent(interval=None),
        "per_cpu": psutil.cpu_percent(interval=None, percpu=True),
        "cores_physical": psutil.cpu_count(logical=False),
        "cores_logical": psutil.cpu_count(logical=True),
        "freq_current": round(freq.current, 0) if freq else None,
        "freq_max": round(freq.max, 0) if freq and freq.max else None,
        "load_1": load_1,
        "load_5": load_5,
        "load_15": load_15,
        "temps": temps,
    }


def _get_memory_info():
    vm = psutil.virtual_memory()
    sw = psutil.swap_memory()
    return {
        "total": vm.total,
        "used": vm.used,
        "available": vm.available,
        "percent": vm.percent,
        "total_fmt": _bytes_fmt(vm.total),
        "used_fmt": _bytes_fmt(vm.used),
        "available_fmt": _bytes_fmt(vm.available),
        "swap_total": sw.total,
        "swap_used": sw.used,
        "swap_percent": sw.percent,
        "swap_total_fmt": _bytes_fmt(sw.total),
        "swap_used_fmt": _bytes_fmt(sw.used),
    }


def _get_disk_info():
    partitions = []
    for p in psutil.disk_partitions(all=False):
        try:
            u = psutil.disk_usage(p.mountpoint)
            partitions.append({
                "device": p.device,
                "mountpoint": p.mountpoint,
                "fstype": p.fstype,
                "total": u.total,
                "used": u.used,
                "free": u.free,
                "percent": u.percent,
                "total_fmt": _bytes_fmt(u.total),
                "used_fmt": _bytes_fmt(u.used),
                "free_fmt": _bytes_fmt(u.free),
            })
        except Exception:
            pass
    return {
        "partitions": partitions,
        "io_read_speed": round(_disk_speed["read"] / 1024 / 1024, 2),
        "io_write_speed": round(_disk_speed["write"] / 1024 / 1024, 2),
    }


def _get_network_info():
    net = psutil.net_io_counters()
    return {
        "bytes_sent": net.bytes_sent,
        "bytes_recv": net.bytes_recv,
        "bytes_sent_fmt": _bytes_fmt(net.bytes_sent),
        "bytes_recv_fmt": _bytes_fmt(net.bytes_recv),
        "speed_up": round(_net_speed["up"] / 1024, 1),
        "speed_down": round(_net_speed["down"] / 1024, 1),
        "speed_up_fmt": _bytes_fmt(_net_speed["up"]) + "/s",
        "speed_down_fmt": _bytes_fmt(_net_speed["down"]) + "/s",
    }


def _get_top_processes(n=10):
    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "username"]):
        try:
            info = p.info
            procs.append({
                "pid": info["pid"],
                "name": info["name"],
                "cpu": round(info["cpu_percent"] or 0, 1),
                "mem": round(info["memory_percent"] or 0, 1),
                "user": info["username"] or "",
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    procs.sort(key=lambda x: x["cpu"], reverse=True)
    return procs[:n]


def _get_services_status():
    targets = ["nginx", "uvicorn", "python"]
    result = {}
    all_names = set()
    for p in psutil.process_iter(["name", "cmdline"]):
        try:
            all_names.add(p.info["name"].lower())
            cmdline = " ".join(p.info["cmdline"] or []).lower()
            for svc in targets:
                if svc in p.info["name"].lower() or svc in cmdline:
                    result[svc] = True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    for svc in targets:
        if svc not in result:
            result[svc] = False
    return result


@app.get("/api/monitor/realtime")
def monitor_realtime():
    return {
        "system": _get_system_info(),
        "cpu": _get_cpu_info(),
        "memory": _get_memory_info(),
        "disk": _get_disk_info(),
        "network": _get_network_info(),
        "processes": _get_top_processes(),
        "services": _get_services_status(),
    }


@app.get("/api/monitor/history")
def monitor_history():
    return list(_monitor_history)
