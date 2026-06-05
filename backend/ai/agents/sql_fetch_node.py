from uuid import UUID

from backend.core.database import SessionLocal
from backend.vault.models import Post, PostStatus, PostVersion


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
        post = Post(
            user_id=uid,
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
