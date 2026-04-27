from fastapi import APIRouter

from services import runtime

router = APIRouter(prefix="/api/review-sessions", tags=["review_sessions"])

router.get("")(runtime.list_review_sessions)
router.post("")(runtime.create_review_session)
router.post("/create-from-selection")(runtime.create_review_session_from_selection)
router.get("/{review_session_id}")(runtime.get_review_session)
router.put("/{review_session_id}")(runtime.update_review_session)
router.delete("/{review_session_id}")(runtime.delete_review_session)
router.put("/{review_session_id}/trade-links")(runtime.upsert_review_session_trade_links)
