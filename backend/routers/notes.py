from fastapi import APIRouter

from services import notes_service

router = APIRouter(prefix="/api/notes", tags=["notes"])

router.get("")(notes_service.list_notes)
router.get("/stats")(notes_service.note_stats)
router.get("/history-today")(notes_service.history_today)
router.get("/diary-tree")(notes_service.diary_tree)
router.get("/search")(notes_service.search_notes)
router.get("/resolve-link")(notes_service.resolve_note_link)
router.get("/{note_id}/backlinks")(notes_service.note_backlinks)
router.get("/diary-summaries")(notes_service.diary_summaries)
router.get("/calendar")(notes_service.notes_calendar)
router.post("")(notes_service.create_note)
router.get("/{note_id}")(notes_service.get_note)
router.put("/{note_id}")(notes_service.update_note)
router.delete("/{note_id}")(notes_service.delete_note)
