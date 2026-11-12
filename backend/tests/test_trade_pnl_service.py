from trading.pnl_service import normalize_pnl_amount


def test_normalize_pnl_amount_supports_legacy_english_directions_and_flat_prices():
    assert normalize_pnl_amount(-20, direction="long", open_price=100, close_price=110) == 20
    assert normalize_pnl_amount(20, direction="short", open_price=100, close_price=110) == -20
    assert normalize_pnl_amount(20, direction="做多", open_price=100, close_price=100) == 0
