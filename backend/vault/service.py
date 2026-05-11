from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
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


# ── Folder ────────────────────────────────────────────────────────────────────

def create_folder(db: Session, user_id: UUID, data: FolderCreate) -> Folder:
    folder = Folder(user_id=user_id, name=data.name, description=data.description)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    
    # this function will return the newly created folder each time
    return folder


def list_folders(db: Session, user_id: UUID) -> list[Folder]:
    return db.query(Folder).filter(Folder.user_id == user_id).all()


def rename_folder(db: Session, folder_id: UUID, data: FolderRename) -> Folder:
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder.name = data.name
    db.commit()
    db.refresh(folder)
    return folder


def delete_folder(db: Session, folder_id: UUID) -> None:
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    db.delete(folder)
    db.commit()


# ── Post ──────────────────────────────────────────────────────────────────────

def create_post(db: Session, folder_id: UUID, data: PostCreate) -> Post:
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    post = Post(title=data.title, folder_id=folder_id)
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def list_posts(db: Session, folder_id: UUID) -> list[Post]:
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return db.query(Post).filter(Post.folder_id == folder_id).all()


def get_post(db: Session, post_id: UUID) -> Post:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


def rename_post(db: Session, post_id: UUID, data: PostRename) -> Post:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.title = data.title
    post.updated_at = _utcnow()
    db.commit()
    db.refresh(post)
    return post


def delete_post(db: Session, post_id: UUID) -> None:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(post)
    db.commit()


# ── Version ───────────────────────────────────────────────────────────────────

def save_version(db: Session, post_id: UUID, data: VersionSave) -> PostVersion:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

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
        db.flush()  # persist version row within transaction before updating post

        post.current_version = next_number
        post.updated_at = _utcnow()

        db.commit()
        db.refresh(version)
    except Exception:
        db.rollback()
        raise

    return version


def delete_version(db: Session, version_id: UUID) -> None:
    version = db.get(PostVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
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


def rename_version(db: Session, version_id: UUID, data: VersionRename) -> PostVersion:
    version = db.get(PostVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    version.change_summary = data.version_label
    db.commit()
    db.refresh(version)
    return version


def list_versions(db: Session, post_id: UUID) -> list[PostVersion]:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return (
        db.query(PostVersion)
        .filter(PostVersion.post_id == post_id)
        .order_by(PostVersion.version_number)
        .all()
    )


def get_version(db: Session, version_id: UUID) -> PostVersion:
    version = db.get(PostVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


# ── Search ────────────────────────────────────────────────────────────────────

def search_posts(db: Session, query: str) -> list[SearchResult]:
    like = f"%{query}%"

    title_matches = db.query(Post).filter(Post.title.ilike(like)).all()

    # posts whose any version content matches — one row per post (deduped below)
    content_rows = (
        db.query(Post, PostVersion)
        .join(PostVersion, PostVersion.post_id == Post.id)
        .filter(PostVersion.content.ilike(like))
        .all()
    )

    seen: set[UUID] = set()
    results: list[SearchResult] = []

    for post in title_matches:
        if post.id not in seen:
            seen.add(post.id)
            results.append(
                SearchResult(
                    post_id=post.id,
                    title=post.title,
                    folder_id=post.folder_id,
                    matched_version_id=None,
                    updated_at=post.updated_at,
                )
            )

    for post, version in content_rows:
        if post.id not in seen:
            seen.add(post.id)
            results.append(
                SearchResult(
                    post_id=post.id,
                    title=post.title,
                    folder_id=post.folder_id,
                    matched_version_id=version.id,
                    updated_at=post.updated_at,
                )
            )

    return results
