from fastapi import APIRouter

from services import notes_service

router = APIRouter(prefix="/api/notebooks", tags=["notebook"])

router.get("")(notes_service.list_notebooks)
router.post("")(notes_service.create_notebook)
router.put("/{nb_id}")(notes_service.update_notebook)
router.delete("/{nb_id}")(notes_service.delete_notebook)
