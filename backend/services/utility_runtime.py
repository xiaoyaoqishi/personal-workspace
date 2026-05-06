from __future__ import annotations

import os
import random
import shutil
import threading
import time as _time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Set

import httpx
from fastapi import File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from core.config import settings


UPLOAD_DIR = str(settings.upload_dir)
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"}
UPLOAD_URL_RE = r'/(?:api/)?uploads/([^"\'\s)<>]+)'


async def upload_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支持的文件格式: {ext}")
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as output:
        shutil.copyfileobj(file.file, output)
    return {"url": f"/api/uploads/{filename}"}


def get_upload(filename: str):
    safe = os.path.basename(filename)
    path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path)


def extract_upload_filenames(text: Optional[str]) -> Set[str]:
    import re

    filenames: Set[str] = set()
    for match in re.finditer(UPLOAD_URL_RE, str(text or "")):
        safe = os.path.basename(match.group(1))
        if safe:
            filenames.add(safe)
    return filenames


def _referenced_upload_filenames(db) -> Set[str]:
    from models import KnowledgeItem, Review, ReviewSession, TradePlan, TradeReview

    referenced: Set[str] = set()
    query_specs = [
        (KnowledgeItem, (KnowledgeItem.content,)),
        (TradeReview, (TradeReview.research_notes,)),
        (Review, (Review.content, Review.research_notes)),
        (ReviewSession, (ReviewSession.content, ReviewSession.research_notes)),
        (TradePlan, (TradePlan.research_notes,)),
    ]
    for _model, columns in query_specs:
        for row in db.query(*columns).all():
            values = tuple(row)
            for value in values:
                referenced.update(extract_upload_filenames(value))
    return referenced


def cleanup_unreferenced_uploads(db, *content_values: Optional[str]) -> Set[str]:
    candidates: Set[str] = set()
    for value in content_values:
        candidates.update(extract_upload_filenames(value))
    if not candidates:
        return set()

    referenced = _referenced_upload_filenames(db)
    removable = candidates - referenced
    deleted: Set[str] = set()
    upload_dir = Path(UPLOAD_DIR).resolve()
    for filename in removable:
        path = (upload_dir / os.path.basename(filename)).resolve()
        if path.parent != upload_dir or not path.exists() or not path.is_file():
            continue
        path.unlink()
        deleted.add(filename)
    return deleted


def _build_poem_payload(entry: dict, source: str) -> dict:
    title = (entry.get("title") or "").strip() or "无题"
    author = (entry.get("author") or "").strip() or "佚名"
    text_value = (entry.get("text") or "").strip()
    if not text_value:
        raise ValueError("poem text empty")
    return {
        "title": title,
        "author": author,
        "text": text_value,
        "source": source,
        "fetched_at": datetime.now().isoformat(timespec="seconds"),
    }


def _fetch_remote_poem() -> dict:
    headers = {"User-Agent": "Mozilla/5.0"}
    if JINRISHICI_TOKEN:
        headers["X-User-Token"] = JINRISHICI_TOKEN
    with httpx.Client(timeout=8) as client:
        response = client.get(POEM_REMOTE_URL, headers=headers)
    response.raise_for_status()
    raw = response.json()
    data = raw.get("data") if isinstance(raw, dict) else {}
    origin = data.get("origin") if isinstance(data, dict) else {}
    lines = origin.get("content") if isinstance(origin, dict) else None
    if isinstance(lines, list):
        text_value = "\n".join(str(item).strip() for item in lines if str(item).strip()).strip()
    else:
        text_value = (data.get("content") or "").strip()
    return _build_poem_payload(
        {
            "title": origin.get("title") if isinstance(origin, dict) else None,
            "author": origin.get("author") if isinstance(origin, dict) else None,
            "text": text_value,
        },
        "今日诗词",
    )


def _fallback_poem(refresh: bool = False, exclude_title: Optional[str] = None) -> dict:
    candidates = POEM_FALLBACKS
    if refresh and exclude_title:
        filtered = [item for item in POEM_FALLBACKS if (item.get("title") or "").strip() != exclude_title]
        if filtered:
            candidates = filtered
    if refresh:
        pick = random.choice(candidates)
    else:
        index = int(datetime.now().strftime("%j")) % len(candidates)
        pick = candidates[index]
    return _build_poem_payload(pick, "本地兜底")


def get_daily_poem(refresh: bool = Query(False)):
    now_ts = _time.time()
    previous_title = None
    if not refresh:
        with _poem_lock:
            updated_at = _poem_cache["updated_at"]
            payload = _poem_cache["payload"]
            if payload and updated_at and (now_ts - updated_at) < POEM_CACHE_TTL:
                return payload
    else:
        with _poem_lock:
            old_payload = _poem_cache.get("payload") or {}
            previous_title = (old_payload.get("title") or "").strip() or None
    try:
        payload = _fetch_remote_poem()
    except Exception:
        payload = _fallback_poem(refresh=refresh, exclude_title=previous_title)
    with _poem_lock:
        _poem_cache["updated_at"] = now_ts
        _poem_cache["payload"] = payload
    return payload


_poem_lock = threading.Lock()
_poem_cache = {"updated_at": None, "payload": None}
POEM_CACHE_TTL = int(os.environ.get("POEM_CACHE_TTL", "1800"))
POEM_REMOTE_URL = os.environ.get("POEM_REMOTE_URL", "https://v2.jinrishici.com/sentence")
JINRISHICI_TOKEN = os.environ.get("JINRISHICI_TOKEN", "").strip()
POEM_FALLBACKS = [
    {
        "title": "望岳",
        "author": "杜甫",
        "text": "岱宗夫如何？齐鲁青未了。\n造化钟神秀，阴阳割昏晓。\n荡胸生曾云，决眦入归鸟。\n会当凌绝顶，一览众山小。",
    },
    {
        "title": "水调歌头",
        "author": "苏轼",
        "text": "明月几时有？把酒问青天。\n不知天上宫阙，今夕是何年。\n我欲乘风归去，又恐琼楼玉宇，高处不胜寒。\n起舞弄清影，何似在人间。\n转朱阁，低绮户，照无眠。\n不应有恨，何事长向别时圆？\n人有悲欢离合，月有阴晴圆缺，此事古难全。\n但愿人长久，千里共婵娟。",
    },
    {
        "title": "沁园春·雪",
        "author": "毛泽东",
        "text": "北国风光，千里冰封，万里雪飘。\n望长城内外，惟余莽莽；大河上下，顿失滔滔。\n山舞银蛇，原驰蜡象，欲与天公试比高。\n须晴日，看红装素裹，分外妖娆。\n江山如此多娇，引无数英雄竞折腰。\n惜秦皇汉武，略输文采；唐宗宋祖，稍逊风骚。\n一代天骄，成吉思汗，只识弯弓射大雕。\n俱往矣，数风流人物，还看今朝。",
    },
]
