from __future__ import annotations

import threading
import time
from typing import Any, Dict

import httpx
from fastapi import HTTPException


USD_CNY_RATE_URL = "https://api.frankfurter.app/latest?from=USD&to=CNY"
CRYPTO_INSTRUMENT_TYPE = "加密货币"
_RATE_CACHE_TTL_SECONDS = 6 * 60 * 60
_rate_cache: Dict[str, Any] = {}
_rate_cache_lock = threading.Lock()


def get_usd_cny_exchange_rate() -> Dict[str, Any]:
    now = time.monotonic()
    with _rate_cache_lock:
        if _rate_cache and now - float(_rate_cache["cached_at"]) < _RATE_CACHE_TTL_SECONDS:
            return {key: value for key, value in _rate_cache.items() if key != "cached_at"}

    try:
        with httpx.Client(timeout=8, follow_redirects=True) as client:
            response = client.get(USD_CNY_RATE_URL)
            response.raise_for_status()
            payload = response.json()
        rate = float(payload["rates"]["CNY"])
        if rate <= 0:
            raise ValueError("invalid rate")
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(503, "美元人民币汇率暂时无法获取，请稍后重试或手动填写") from exc

    result = {
        "base": "USD",
        "quote": "CNY",
        "rate": rate,
        "rate_date": payload.get("date"),
        "source": "Frankfurter",
    }
    with _rate_cache_lock:
        _rate_cache.clear()
        _rate_cache.update(result, cached_at=now)
    return result


def normalize_trade_currency_values(values: Dict[str, Any], *, current: Any = None) -> Dict[str, Any]:
    """Keep commission/pnl as CNY and retain crypto USDT source amounts."""
    normalized = dict(values)
    instrument_type = normalized.get("instrument_type")
    if instrument_type is None and current is not None:
        instrument_type = current.instrument_type

    if instrument_type != CRYPTO_INSTRUMENT_TYPE:
        normalized.update(commission_usdt=None, pnl_usdt=None, usd_cny_rate=None)
        return normalized

    rate = normalized.get("usd_cny_rate")
    if rate is None and current is not None:
        rate = current.usd_cny_rate

    touched_usdt_fields = [field for field in ("commission_usdt", "pnl_usdt") if field in normalized]
    non_null_usdt = [field for field in touched_usdt_fields if normalized[field] is not None]
    if non_null_usdt and (rate is None or float(rate) <= 0):
        raise HTTPException(400, "加密货币手续费或盈亏换算需要有效的美元人民币汇率")

    if "commission_usdt" in normalized:
        value = normalized["commission_usdt"]
        normalized["commission"] = round(float(value) * float(rate), 2) if value is not None else None
    elif "usd_cny_rate" in normalized and current is not None and current.commission_usdt is not None:
        normalized["commission"] = round(float(current.commission_usdt) * float(rate), 2)
    if "pnl_usdt" in normalized:
        value = normalized["pnl_usdt"]
        normalized["pnl"] = round(float(value) * float(rate), 2) if value is not None else None
    elif "usd_cny_rate" in normalized and current is not None and current.pnl_usdt is not None:
        normalized["pnl"] = round(float(current.pnl_usdt) * float(rate), 2)
    return normalized
