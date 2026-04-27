from services import runtime
from services import trade_analytics_runtime
from services import trade_broker_runtime
from services import trade_import_runtime
from services import trading_runtime
from trading import broker_service, trade_service


def test_trading_routes_still_registered(app):
    paths = {route.path for route in app.routes}
    assert "/api/trades" in paths
    assert "/api/trades/import-paste" in paths
    assert "/api/trades/search-options" in paths
    assert "/api/trade-brokers" in paths
    assert "/api/trade-review-taxonomy" in paths


def test_trading_services_and_runtime_exports_remain_stable():
    assert trade_service.import_trades_from_paste is trade_import_runtime.import_trades_from_paste
    assert trade_service.list_trades is trading_runtime.list_trades
    assert trade_service.count_trades is trade_analytics_runtime.count_trades
    assert trade_service.get_trade_analytics is trade_analytics_runtime.get_trade_analytics
    assert trade_service.get_trade_source_metadata is trading_runtime.get_trade_source_metadata

    assert broker_service.list_trade_brokers is trade_broker_runtime.list_trade_brokers
    assert broker_service.delete_trade_broker is trade_broker_runtime.delete_trade_broker

    assert runtime.import_trades_from_paste is trade_import_runtime.import_trades_from_paste
    assert runtime.list_trade_positions is trading_runtime.list_trade_positions
    assert runtime.list_trade_search_options is trading_runtime.list_trade_search_options
    assert runtime.count_trades is trade_analytics_runtime.count_trades
    assert runtime.get_statistics is trade_analytics_runtime.get_statistics
    assert runtime.list_trade_brokers is trade_broker_runtime.list_trade_brokers
    assert runtime._attach_trade_view_fields is trading_runtime._attach_trade_view_fields
    assert runtime._build_position_state_from_db is trading_runtime._build_position_state_from_db
