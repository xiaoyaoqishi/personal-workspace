from __future__ import annotations

import re
from datetime import datetime
from html import unescape
from typing import Optional

from fastapi import Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.db import get_db
from models import (
    Note,
    Notebook,
    TradingResearchDocument,
    TradingResearchFolder,
    TradingResearchLink,
)
from schemas.trading_research import (
    TradingResearchDocumentCreate,
    TradingResearchDocumentUpdate,
    TradingResearchFolderCreate,
    TradingResearchFolderUpdate,
)
from services import runtime as legacy_runtime
from trading.tag_service import normalize_tag_list, serialize_legacy_tags


WIKI_LINK_RE = re.compile(r"\[\[([^\]#|]+)(?:#([^\]|]+))?(?:\|[^\]]+)?\]\]")


def _plain_text(content: Optional[str]) -> str:
    text = re.sub(r"<[^>]+>", " ", content or "")
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _word_count(content: Optional[str]) -> int:
    text = _plain_text(content)
    if not text:
        return 0
    chinese = len(re.findall(r"[\u4e00-\u9fff]", text))
    words = len(re.findall(r"[A-Za-z0-9_]+", text))
    return chinese + words


def _folder_or_404(db: Session, folder_id: int) -> TradingResearchFolder:
    row = db.query(TradingResearchFolder).filter(TradingResearchFolder.id == folder_id).first()
    if not row:
        raise HTTPException(404, "Research folder not found")
    return row


def _document_or_404(db: Session, document_id: int, include_deleted: bool = False) -> TradingResearchDocument:
    q = db.query(TradingResearchDocument).filter(TradingResearchDocument.id == document_id)
    if not include_deleted:
        q = q.filter(TradingResearchDocument.is_deleted == False)  # noqa: E712
    row = q.first()
    if not row:
        raise HTTPException(404, "Research document not found")
    return row


def _attach_folder_fields(db: Session, rows: list[TradingResearchFolder]):
    if not rows:
        return rows
    ids = [row.id for row in rows]
    counts = dict(
        db.query(TradingResearchDocument.folder_id, func.count(TradingResearchDocument.id))
        .filter(TradingResearchDocument.folder_id.in_(ids), TradingResearchDocument.is_deleted == False)  # noqa: E712
        .group_by(TradingResearchDocument.folder_id)
        .all()
    )
    for row in rows:
        setattr(row, "document_count", int(counts.get(row.id, 0)))
    return rows


def _attach_document_fields(rows: list[TradingResearchDocument]):
    for row in rows:
        setattr(row, "tags", normalize_tag_list(row.tags_text))
    return rows


def _resolve_target_id(db: Session, name: str) -> Optional[int]:
    row = (
        db.query(TradingResearchDocument.id)
        .filter(
            TradingResearchDocument.title == name.strip(),
            TradingResearchDocument.is_deleted == False,  # noqa: E712
        )
        .first()
    )
    return row[0] if row else None


def _index_document_links(db: Session, document: TradingResearchDocument) -> None:
    db.query(TradingResearchLink).filter(TradingResearchLink.source_document_id == document.id).delete()
    seen = set()
    for target_name, target_heading in WIKI_LINK_RE.findall(document.content or ""):
        name = target_name.strip()
        heading = target_heading.strip() or None
        key = (name, heading)
        if not name or key in seen:
            continue
        seen.add(key)
        db.add(
            TradingResearchLink(
                source_document_id=document.id,
                target_document_id=_resolve_target_id(db, name),
                target_name=name,
                target_heading=heading,
            )
        )


def _refresh_link_targets(db: Session) -> None:
    accessible_ids = [row[0] for row in db.query(TradingResearchDocument.id).all()]
    if not accessible_ids:
        return
    for link in db.query(TradingResearchLink).filter(TradingResearchLink.source_document_id.in_(accessible_ids)).all():
        link.target_document_id = _resolve_target_id(db, link.target_name)


def list_research_folders(owner_role: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(TradingResearchFolder)
    role_filter = legacy_runtime._owner_role_filter_for_admin(TradingResearchFolder, owner_role)
    if role_filter is not None:
        q = q.filter(role_filter)
    return _attach_folder_fields(db, q.order_by(TradingResearchFolder.sort_order, TradingResearchFolder.id).all())


def create_research_folder(data: TradingResearchFolderCreate, db: Session = Depends(get_db)):
    payload = data.model_dump()
    payload["name"] = payload["name"].strip()
    if not payload["name"]:
        raise HTTPException(400, "Folder name is required")
    if payload.get("parent_id"):
        _folder_or_404(db, payload["parent_id"])
    row = TradingResearchFolder(**payload, owner_role=legacy_runtime._owner_role_value_for_create())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _attach_folder_fields(db, [row])[0]


def update_research_folder(folder_id: int, data: TradingResearchFolderUpdate, db: Session = Depends(get_db)):
    row = _folder_or_404(db, folder_id)
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates:
        updates["name"] = (updates["name"] or "").strip()
        if not updates["name"]:
            raise HTTPException(400, "Folder name is required")
    if updates.get("parent_id"):
        if updates["parent_id"] == folder_id:
            raise HTTPException(400, "Folder cannot be its own parent")
        parent = _folder_or_404(db, updates["parent_id"])
        visited = {folder_id}
        while parent:
            if parent.id in visited:
                raise HTTPException(400, "Folder hierarchy cannot contain a cycle")
            visited.add(parent.id)
            parent = _folder_or_404(db, parent.parent_id) if parent.parent_id else None
    for key, value in updates.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _attach_folder_fields(db, [row])[0]


def delete_research_folder(folder_id: int, db: Session = Depends(get_db)):
    row = _folder_or_404(db, folder_id)
    if db.query(TradingResearchFolder).filter(TradingResearchFolder.parent_id == folder_id).first():
        raise HTTPException(409, "Delete child folders first")
    if db.query(TradingResearchDocument).filter(TradingResearchDocument.folder_id == folder_id).first():
        raise HTTPException(409, "Move or delete documents in this folder first")
    db.delete(row)
    db.commit()
    return {"ok": True}


def list_research_documents(
    folder_id: Optional[int] = None,
    keyword: Optional[str] = None,
    tag: Optional[str] = None,
    owner_role: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=300),
    db: Session = Depends(get_db),
):
    q = db.query(TradingResearchDocument).filter(TradingResearchDocument.is_deleted == False)  # noqa: E712
    role_filter = legacy_runtime._owner_role_filter_for_admin(TradingResearchDocument, owner_role)
    if role_filter is not None:
        q = q.filter(role_filter)
    if folder_id:
        q = q.filter(TradingResearchDocument.folder_id == folder_id)
    if keyword and keyword.strip():
        needle = f"%{keyword.strip()}%"
        q = q.filter(or_(TradingResearchDocument.title.ilike(needle), TradingResearchDocument.content.ilike(needle)))
    if tag and tag.strip():
        q = q.filter(TradingResearchDocument.tags_text.contains(tag.strip()))
    total = q.count()
    rows = (
        q.order_by(TradingResearchDocument.is_pinned.desc(), TradingResearchDocument.updated_at.desc(), TradingResearchDocument.id.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )
    return {"items": _attach_document_fields(rows), "total": total}


def create_research_document(data: TradingResearchDocumentCreate, db: Session = Depends(get_db)):
    folder = _folder_or_404(db, data.folder_id)
    payload = data.model_dump()
    tags = payload.pop("tags", None)
    payload["title"] = payload["title"].strip()
    if not payload["title"]:
        raise HTTPException(400, "Document title is required")
    payload["word_count"] = _word_count(payload.get("content"))
    row = TradingResearchDocument(**payload, owner_role=folder.owner_role or legacy_runtime._owner_role_value_for_create())
    row.tags_text = serialize_legacy_tags(normalize_tag_list(tags))
    db.add(row)
    db.flush()
    _index_document_links(db, row)
    _refresh_link_targets(db)
    db.commit()
    db.refresh(row)
    return _attach_document_fields([row])[0]


def get_research_document(document_id: int, db: Session = Depends(get_db)):
    return _attach_document_fields([_document_or_404(db, document_id)])[0]


def update_research_document(document_id: int, data: TradingResearchDocumentUpdate, db: Session = Depends(get_db)):
    row = _document_or_404(db, document_id)
    updates = data.model_dump(exclude_unset=True)
    tags = updates.pop("tags", None) if "tags" in updates else None
    old_title = row.title
    if "folder_id" in updates:
        _folder_or_404(db, updates["folder_id"])
    if "title" in updates:
        updates["title"] = (updates["title"] or "").strip()
        if not updates["title"]:
            raise HTTPException(400, "Document title is required")
    if "content" in updates:
        updates["word_count"] = _word_count(updates["content"])
    for key, value in updates.items():
        setattr(row, key, value)
    if tags is not None:
        row.tags_text = serialize_legacy_tags(normalize_tag_list(tags))
    _index_document_links(db, row)
    if row.title != old_title:
        _refresh_link_targets(db)
    db.commit()
    db.refresh(row)
    return _attach_document_fields([row])[0]


def delete_research_document(document_id: int, db: Session = Depends(get_db)):
    row = _document_or_404(db, document_id)
    row.is_deleted = True
    row.deleted_at = datetime.now()
    db.query(TradingResearchLink).filter(TradingResearchLink.source_document_id == row.id).delete()
    db.query(TradingResearchLink).filter(TradingResearchLink.target_document_id == row.id).update({"target_document_id": None})
    db.commit()
    return {"ok": True}


def list_research_recycle(db: Session = Depends(get_db)):
    rows = (
        db.query(TradingResearchDocument)
        .filter(TradingResearchDocument.is_deleted == True)  # noqa: E712
        .order_by(TradingResearchDocument.deleted_at.desc(), TradingResearchDocument.id.desc())
        .all()
    )
    return _attach_document_fields(rows)


def restore_research_document(document_id: int, db: Session = Depends(get_db)):
    row = _document_or_404(db, document_id, include_deleted=True)
    if not row.is_deleted:
        raise HTTPException(409, "Document is not deleted")
    row.is_deleted = False
    row.deleted_at = None
    _index_document_links(db, row)
    db.commit()
    db.refresh(row)
    return _attach_document_fields([row])[0]


def purge_research_document(document_id: int, db: Session = Depends(get_db)):
    row = _document_or_404(db, document_id, include_deleted=True)
    db.query(TradingResearchLink).filter(
        or_(TradingResearchLink.source_document_id == row.id, TradingResearchLink.target_document_id == row.id)
    ).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
    return {"ok": True}


def clear_research_recycle(db: Session = Depends(get_db)):
    rows = db.query(TradingResearchDocument).filter(TradingResearchDocument.is_deleted == True).all()  # noqa: E712
    for row in rows:
        db.query(TradingResearchLink).filter(
            or_(TradingResearchLink.source_document_id == row.id, TradingResearchLink.target_document_id == row.id)
        ).delete(synchronize_session=False)
        db.delete(row)
    db.commit()
    return {"ok": True, "cleared": len(rows)}


def resolve_research_link(name: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    target_id = _resolve_target_id(db, name)
    if not target_id:
        raise HTTPException(404, "Research document not found")
    return {"document_id": target_id, "title": name.strip()}


def list_research_backlinks(document_id: int, db: Session = Depends(get_db)):
    _document_or_404(db, document_id)
    rows = (
        db.query(TradingResearchLink, TradingResearchDocument)
        .join(TradingResearchDocument, TradingResearchDocument.id == TradingResearchLink.source_document_id)
        .filter(
            TradingResearchLink.target_document_id == document_id,
            TradingResearchDocument.is_deleted == False,  # noqa: E712
        )
        .order_by(TradingResearchDocument.updated_at.desc())
        .all()
    )
    return [
        {"document_id": document.id, "title": document.title, "target_heading": link.target_heading}
        for link, document in rows
    ]


def migrate_legacy_trading_research() -> None:
    from core import db as core_db

    db = core_db.SessionLocal()
    try:
        legacy_folders = db.query(Notebook).filter(Notebook.module_scope == "trading").order_by(Notebook.id).all()
        if not legacy_folders:
            if db.query(TradingResearchFolder).count() == 0:
                db.add(TradingResearchFolder(name="研究资料", sort_order=0, owner_role="admin"))
                db.commit()
            return

        folder_map: dict[int, TradingResearchFolder] = {}
        for legacy in legacy_folders:
            target = db.query(TradingResearchFolder).filter(TradingResearchFolder.legacy_notebook_id == legacy.id).first()
            if not target:
                target = TradingResearchFolder(
                    name=legacy.name,
                    sort_order=legacy.sort_order or 0,
                    owner_role=legacy.owner_role or "admin",
                    legacy_notebook_id=legacy.id,
                    created_at=legacy.created_at,
                    updated_at=legacy.updated_at,
                )
                db.add(target)
                db.flush()
            folder_map[legacy.id] = target
        for legacy in legacy_folders:
            target = folder_map[legacy.id]
            target.parent_id = folder_map.get(legacy.parent_id).id if legacy.parent_id in folder_map else None

        legacy_documents = db.query(Note).filter(Note.module_scope == "trading").order_by(Note.id).all()
        for legacy in legacy_documents:
            folder = folder_map.get(legacy.notebook_id)
            if not folder:
                continue
            target = db.query(TradingResearchDocument).filter(TradingResearchDocument.legacy_note_id == legacy.id).first()
            if not target:
                target = TradingResearchDocument(
                    folder_id=folder.id,
                    title=legacy.title,
                    content=legacy.content or "",
                    tags_text=legacy.tags,
                    is_pinned=bool(legacy.is_pinned),
                    word_count=legacy.word_count or _word_count(legacy.content),
                    owner_role=legacy.owner_role or folder.owner_role,
                    is_deleted=bool(legacy.is_deleted),
                    deleted_at=legacy.deleted_at,
                    legacy_note_id=legacy.id,
                    created_at=legacy.created_at,
                    updated_at=legacy.updated_at,
                )
                db.add(target)
                db.flush()
                _index_document_links(db, target)
        _refresh_link_targets(db)
        db.commit()
    finally:
        db.close()
