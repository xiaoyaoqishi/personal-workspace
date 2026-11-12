from __future__ import annotations

from typing import Any, Dict

from trading.currency_service import CRYPTO_INSTRUMENT_TYPE


_LONG_DIRECTIONS = {"做多", "多", "long", "buy", "买入"}
_SHORT_DIRECTIONS = {"做空", "空", "short", "sell", "卖出"}
_PNL_SIGN_INPUT_FIELDS = {
    "instrument_type",
    "direction",
    "open_price",
    "close_price",
    "pnl",
    "pnl_usdt",
}


def _direction_multiplier(direction: Any) -> int | None:
    normalized = str(direction or "").strip().lower()
    if normalized in _LONG_DIRECTIONS:
        return 1
    if normalized in _SHORT_DIRECTIONS:
        return -1
    return None


def normalize_pnl_amount(
    amount: Any,
    *,
    direction: Any,
    open_price: Any,
    close_price: Any,
) -> float | None:
    """Infer a trade PnL amount's sign from its direction and price movement."""
    if amount is None:
        return None

    direction_multiplier = _direction_multiplier(direction)
    if direction_multiplier is None or open_price is None or close_price is None:
        return float(amount)

    price_move = (float(close_price) - float(open_price)) * direction_multiplier
    magnitude = abs(float(amount))
    if price_move > 0:
        return magnitude
    if price_move < 0:
        return -magnitude
    return 0.0


def normalize_trade_pnl_values(values: Dict[str, Any], *, current: Any = None) -> Dict[str, Any]:
    """Normalize CNY/USDT PnL signs for a create or a relevant partial update."""
    normalized = dict(values)
    if current is not None and not (_PNL_SIGN_INPUT_FIELDS & normalized.keys()):
        return normalized

    instrument_type = normalized.get("instrument_type")
    direction = normalized.get("direction")
    open_price = normalized.get("open_price")
    close_price = normalized.get("close_price")
    if current is not None:
        instrument_type = instrument_type if instrument_type is not None else current.instrument_type
        direction = direction if direction is not None else current.direction
        open_price = open_price if open_price is not None else current.open_price
        close_price = close_price if "close_price" in normalized else current.close_price

    if close_price is None:
        return normalized

    amount_field = "pnl_usdt" if instrument_type == CRYPTO_INSTRUMENT_TYPE else "pnl"
    amount = normalized.get(amount_field)
    if amount_field not in normalized and current is not None:
        amount = getattr(current, amount_field)
    if amount is None:
        return normalized

    normalized[amount_field] = normalize_pnl_amount(
        amount,
        direction=direction,
        open_price=open_price,
        close_price=close_price,
    )
    return normalized
