"""
One-off backfill script — re-embeds all current post versions at the new chunk size.

Run from the project root:
    python -m backend.scripts.backfill_embeddings

What it does:
  - Queries every post's current version from post_versions
  - Calls embed_and_store_version() for each (which deletes old chunks then inserts new ones)
  - Skips posts with no content
  - Prints progress to stdout
"""
import sys
from backend.core.database import SessionLocal
from backend.vault.models import Post, PostVersion
from backend.ai.embeddings import embed_and_store_version


def run() -> None:
    with SessionLocal() as db:
        rows = (
            db.query(Post, PostVersion)
            .join(
                PostVersion,
                (PostVersion.post_id == Post.id)
                & (PostVersion.version_number == Post.current_version),
            )
            .all()
        )

    total = len(rows)
    if total == 0:
        print("No posts found — nothing to backfill.")
        return

    print(f"Backfilling {total} post(s) at chunk_size=650, overlap=80...\n")

    ok = 0
    failed = 0
    for i, (post, version) in enumerate(rows, 1):
        if not version.content or not version.content.strip():
            print(f"  [{i}/{total}] SKIP  {post.title!r} — empty content")
            continue
        try:
            embed_and_store_version(
                version_id=str(version.id),
                post_id=str(post.id),
                user_id=str(post.user_id),
                content=version.content,
            )
            print(f"  [{i}/{total}] OK    {post.title!r}")
            ok += 1
        except Exception as exc:
            print(f"  [{i}/{total}] FAIL  {post.title!r} — {exc}")
            failed += 1

    print(f"\nDone. {ok} embedded, {failed} failed.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    run()
