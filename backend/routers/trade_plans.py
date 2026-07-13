from fastapi import APIRouter

from services import runtime

router = APIRouter(prefix="/api/trade-plans", tags=["trade_plans"])

router.get("")(runtime.list_trade_plans)
router.post("")(runtime.create_trade_plan)
router.get("/{trade_plan_id}")(runtime.get_trade_plan)
router.put("/{trade_plan_id}")(runtime.update_trade_plan)
router.delete("/{trade_plan_id}")(runtime.delete_trade_plan)
router.put("/{trade_plan_id}/trade-links")(runtime.upsert_trade_plan_trade_links)
