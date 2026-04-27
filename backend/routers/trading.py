from fastapi import APIRouter

from trading import broker_service, trade_service

router = APIRouter(prefix="/api", tags=["trading"])

router.post("/trades/import-paste")(trade_service.import_trades_from_paste)
router.get("/trades/positions")(trade_service.list_trade_positions)
router.get("/trades")(trade_service.list_trades)
router.get("/trades/search-options")(trade_service.list_trade_search_options)
router.get("/trades/count")(trade_service.count_trades)
router.get("/trades/statistics")(trade_service.get_statistics)
router.get("/trades/analytics")(trade_service.get_trade_analytics)
router.post("/trades")(trade_service.create_trade)
router.get("/trades/{trade_id:int}")(trade_service.get_trade)
router.put("/trades/{trade_id:int}")(trade_service.update_trade)
router.delete("/trades/{trade_id:int}")(trade_service.delete_trade)
router.get("/trades/sources")(trade_service.list_trade_sources)
router.get("/trades/symbols")(trade_service.list_trade_symbols)
router.get("/trade-review-taxonomy")(trade_service.get_trade_review_taxonomy)
router.get("/trades/{trade_id:int}/review")(trade_service.get_trade_review)
router.put("/trades/{trade_id:int}/review")(trade_service.upsert_trade_review)
router.delete("/trades/{trade_id:int}/review")(trade_service.delete_trade_review)
router.get("/trades/{trade_id:int}/source-metadata")(trade_service.get_trade_source_metadata)
router.put("/trades/{trade_id:int}/source-metadata")(trade_service.upsert_trade_source_metadata)
router.get("/trade-brokers")(broker_service.list_trade_brokers)
router.post("/trade-brokers")(broker_service.create_trade_broker)
router.put("/trade-brokers/{broker_id}")(broker_service.update_trade_broker)
router.delete("/trade-brokers/{broker_id}")(broker_service.delete_trade_broker)
