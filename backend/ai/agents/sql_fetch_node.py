from uuid import UUID

from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.vault.models import Folder, Post, PostStatus, PostVersion

AI_DRAFTS_FOLDER_NAME = "AI Drafts"


def _get_or_create_ai_drafts_folder(db: Session, user_id: UUID) -> Folder:
    """
    Get-or-create the per-user "AI Drafts" folder that AI-approved drafts are
    saved into. Every post must have a folder_id to ever surface in the vault —
    MyWorkPage only ever lists posts per-folder (getFolders() -> getPostsInFolder()),
    there is no "all posts" view — so an unfoldered post is invisible, not missing.
    """
    folder = (
        db.query(Folder)
        .filter(Folder.user_id == user_id, Folder.name == AI_DRAFTS_FOLDER_NAME)
        .first()
    )
    if folder is None:
        folder = Folder(user_id=user_id, name=AI_DRAFTS_FOLDER_NAME)
        db.add(folder)
        db.flush()
    return folder


def save_draft_to_vault(user_id: str, draft: str, query: str) -> str:
    """
    Persists an AI-generated draft as a new post (version 1) in the vault.

    Title is derived from the first non-empty line of the draft (max 80 chars).
    Falls back to the first 60 chars of the user's query if the draft has no
    usable first line.

    Returns the saved post title so human_approval_node can include it in the
    answer message.
    """
    uid = UUID(user_id)

    first_line = next((ln.strip() for ln in draft.splitlines() if ln.strip()), "")
    title = first_line[:80] or query[:60] or "AI Draft"

    with SessionLocal() as db:
        folder = _get_or_create_ai_drafts_folder(db, uid)

        post = Post(
            user_id=uid,
            folder_id=folder.id,
            title=title,
            status=PostStatus.draft,
            current_version=1,
        )
        db.add(post)
        db.flush()

        version = PostVersion(
            post_id=post.id,
            version_number=1,
            content=draft,
            source="ai_writer",
            change_summary="AI-generated draft",
            char_count=len(draft),
        )
        db.add(version)
        db.commit()

    return title
