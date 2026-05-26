from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_, case, null
from sqlalchemy.orm import Session

from backend.vault.models import Folder, Post, PostVersion, _utcnow
from backend.vault.schemas import (
    FolderCreate,
    FolderRename,
    PostCreate,
    PostRename,
    SearchResult,
    VersionRename,
    VersionSave,
)


def _own_folder(db: Session, user_id: UUID, folder_id: UUID) -> Folder:
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return folder


def _own_post(db: Session, user_id: UUID, post_id: UUID) -> Post:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return post


def _own_version(db: Session, user_id: UUID, version_id: UUID) -> PostVersion:
    version = db.get(PostVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    _own_post(db, user_id, version.post_id)
    return version


# ── Folder ────────────────────────────────────────────────────────────────────

def create_folder(db: Session, user_id: UUID, data: FolderCreate) -> Folder:
    folder = Folder(user_id=user_id, name=data.name, description=data.description)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def list_folders(db: Session, user_id: UUID) -> list[Folder]:
    return db.query(Folder).filter(Folder.user_id == user_id).all()


def rename_folder(db: Session, user_id: UUID, folder_id: UUID, data: FolderRename) -> Folder:
    folder = _own_folder(db, user_id, folder_id)
    folder.name = data.name
    db.commit()
    db.refresh(folder)
    return folder


def delete_folder(db: Session, user_id: UUID, folder_id: UUID) -> None:
    folder = _own_folder(db, user_id, folder_id)
    db.delete(folder)
    db.commit()


# ── Post ──────────────────────────────────────────────────────────────────────

def create_post(db: Session, user_id: UUID, folder_id: UUID, data: PostCreate) -> Post:
    _own_folder(db, user_id, folder_id)
    post = Post(user_id=user_id, title=data.title, folder_id=folder_id)
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def list_posts(db: Session, user_id: UUID, folder_id: UUID) -> list[Post]:
    _own_folder(db, user_id, folder_id)
    return db.query(Post).filter(Post.folder_id == folder_id, Post.user_id == user_id).all()


def get_post(db: Session, user_id: UUID, post_id: UUID) -> Post:
    return _own_post(db, user_id, post_id)


def rename_post(db: Session, user_id: UUID, post_id: UUID, data: PostRename) -> Post:
    post = _own_post(db, user_id, post_id)
    post.title = data.title
    post.updated_at = _utcnow()
    db.commit()
    db.refresh(post)
    return post


def delete_post(db: Session, user_id: UUID, post_id: UUID) -> None:
    post = _own_post(db, user_id, post_id)
    db.delete(post)
    db.commit()


def pin_post(db: Session, user_id: UUID, post_id: UUID, pinned: bool) -> Post:
    post = _own_post(db, user_id, post_id)
    post.is_pinned = pinned
    post.updated_at = _utcnow()
    db.commit()
    db.refresh(post)
    return post


# ── Version ───────────────────────────────────────────────────────────────────

def save_version(db: Session, user_id: UUID, post_id: UUID, data: VersionSave) -> PostVersion:
    post = _own_post(db, user_id, post_id)

    max_num = (
        db.query(func.max(PostVersion.version_number))
        .filter(PostVersion.post_id == post_id)
        .scalar()
    )
    next_number = (max_num or 0) + 1

    try:
        version = PostVersion(
            post_id=post_id,
            version_number=next_number,
            content=data.content,
            source=data.source,
            change_summary=data.version_label,
            char_count=len(data.content),
        )
        db.add(version)
        db.flush()

        post.current_version = next_number
        post.updated_at = _utcnow()

        db.commit()
        db.refresh(version)
    except Exception:
        db.rollback()
        raise

    return version


def list_versions(db: Session, user_id: UUID, post_id: UUID) -> list[PostVersion]:
    _own_post(db, user_id, post_id)
    return (
        db.query(PostVersion)
        .filter(PostVersion.post_id == post_id)
        .order_by(PostVersion.version_number)
        .all()
    )


def get_version(db: Session, user_id: UUID, version_id: UUID) -> PostVersion:
    return _own_version(db, user_id, version_id)


def rename_version(db: Session, user_id: UUID, version_id: UUID, data: VersionRename) -> PostVersion:
    version = _own_version(db, user_id, version_id)
    version.change_summary = data.version_label
    db.commit()
    db.refresh(version)
    return version


def delete_version(db: Session, user_id: UUID, version_id: UUID) -> None:
    version = _own_version(db, user_id, version_id)
    post = db.get(Post, version.post_id)
    db.delete(version)
    db.flush()
    max_num = (
        db.query(func.max(PostVersion.version_number))
        .filter(PostVersion.post_id == post.id)
        .scalar()
    )
    post.current_version = max_num or 0
    db.commit()


# ── Search ────────────────────────────────────────────────────────────────────

def search_posts(db: Session, user_id: UUID, query: str) -> list[SearchResult]:
    like = f"%{query}%"

    # Title matches take priority: when the post title satisfies the pattern,
    # matched_version_id is NULL. When only a version's content satisfies it,
    # matched_version_id carries that version's id.
    matched_version_id_expr = case(
        (Post.title.ilike(like), null()),
        else_=PostVersion.id,
    ).label("matched_version_id")

    rows = (
        db.query(Post, matched_version_id_expr)
        .outerjoin(PostVersion, PostVersion.post_id == Post.id)
        .filter(
            Post.user_id == user_id,
            or_(Post.title.ilike(like), PostVersion.content.ilike(like)),
        )
        # DISTINCT ON (Post.id) — deduplication happens in PostgreSQL, not Python.
        # ORDER BY must lead with Post.id to satisfy DISTINCT ON semantics; the
        # secondary sort on version_number ensures we pick the earliest matching
        # version for content-only hits.
        .distinct(Post.id)
        .order_by(Post.id, PostVersion.version_number)
        .all()
    )

    return [
        SearchResult(
            post_id=row.Post.id,
            title=row.Post.title,
            folder_id=row.Post.folder_id,
            matched_version_id=row.matched_version_id,
            updated_at=row.Post.updated_at,
        )
        for row in rows
    ]
