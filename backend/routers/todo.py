from fastapi import APIRouter

from services import notes_service

router = APIRouter(prefix="/api/todos", tags=["todo"])

router.get("")(notes_service.list_todos)
router.post("")(notes_service.create_todo)
router.put("/{todo_id}")(notes_service.update_todo)
router.delete("/{todo_id}")(notes_service.delete_todo)
