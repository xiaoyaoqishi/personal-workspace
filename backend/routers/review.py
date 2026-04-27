from fastapi import APIRouter

from services import runtime

router = APIRouter(prefix="/api/reviews", tags=["review"])

router.get("")(runtime.list_reviews)
router.post("")(runtime.create_review)
router.get("/{review_id}")(runtime.get_review)
router.put("/{review_id}")(runtime.update_review)
router.delete("/{review_id}")(runtime.delete_review)
router.put("/{review_id}/trade-links")(runtime.upsert_review_trade_links)
