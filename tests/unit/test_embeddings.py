"""Unit tests for ai/embeddings.py — chunking pipeline, vector storage, error handling."""

import uuid
import pytest
from unittest.mock import MagicMock
from sqlalchemy import text
from contextlib import contextmanager


def _fake_session_factory(db_session):
    @contextmanager
    def fake_session():
        yield db_session
    return fake_session


def _make_version(db_session, test_post, content, version_number=1):
    """Creates a real PostVersion row to satisfy the FK post_embeddings.version_id → post_versions.id."""
    from backend.vault.models import PostVersion
    v = PostVersion(
        id=uuid.uuid4(),
        post_id=test_post.id,
        version_number=version_number,
        content=content,
        source="manual",
        char_count=len(content),
    )
    db_session.add(v)
    db_session.flush()
    return v


def _call_embed(db_session, mock_embeddings, test_post, test_user,
                content="Hello world content.", version_number=1):
    """Calls embed_and_store_version (sync) with real post/version/user IDs to satisfy all FK constraints."""
    import backend.ai.embeddings as emb_mod

    version = _make_version(db_session, test_post, content, version_number)
    original = emb_mod.SessionLocal
    emb_mod.SessionLocal = _fake_session_factory(db_session)

    try:
        emb_mod.embed_and_store_version(
            version_id=str(version.id),
            post_id=str(test_post.id),
            user_id=str(test_user.id),
            content=content,
        )
    finally:
        emb_mod.SessionLocal = original

    return version.id


class TestEmbedAndStoreVersion:
    def test_inserts_chunks(self, db_session, mock_embeddings, test_post, test_user):
        _call_embed(db_session, mock_embeddings, test_post, test_user)

        rows = db_session.execute(
            text("SELECT chunk_index FROM post_embeddings WHERE post_id = :pid ORDER BY chunk_index"),
            {"pid": str(test_post.id)},
        ).fetchall()
        assert len(rows) >= 1
        assert rows[0].chunk_index == 0

    def test_multi_chunk_long_content(self, db_session, mock_embeddings, test_post, test_user):
        long_content = "A " * 400  # well over 650 chars → at least 2 chunks
        mock_embeddings.embed_documents.return_value = [[0.1] * 768, [0.2] * 768]

        _call_embed(db_session, mock_embeddings, test_post, test_user, content=long_content)

        rows = db_session.execute(
            text("SELECT chunk_index FROM post_embeddings WHERE post_id = :pid ORDER BY chunk_index"),
            {"pid": str(test_post.id)},
        ).fetchall()
        assert len(rows) == 2
        assert rows[1].chunk_index == 1

    def test_replaces_existing_chunks(self, db_session, mock_embeddings, test_post, test_user):
        import backend.ai.embeddings as emb_mod

        v1 = _make_version(db_session, test_post, "First version content.", version_number=1)
        v2 = _make_version(db_session, test_post, "Second version content.", version_number=2)

        original = emb_mod.SessionLocal
        emb_mod.SessionLocal = _fake_session_factory(db_session)

        try:
            emb_mod.embed_and_store_version(
                version_id=str(v1.id), post_id=str(test_post.id),
                user_id=str(test_user.id), content="First version content."
            )
            emb_mod.embed_and_store_version(
                version_id=str(v2.id), post_id=str(test_post.id),
                user_id=str(test_user.id), content="Second version content."
            )
        finally:
            emb_mod.SessionLocal = original

        rows = db_session.execute(
            text("SELECT id FROM post_embeddings WHERE post_id = :pid"),
            {"pid": str(test_post.id)},
        ).fetchall()
        # Second call replaces first — only one chunk should remain
        assert len(rows) == 1

    def test_empty_content_no_rows_inserted(self, db_session, mock_embeddings, test_post, test_user):
        mock_embeddings.embed_documents.return_value = []
        _call_embed(db_session, mock_embeddings, test_post, test_user, content="")

        rows = db_session.execute(
            text("SELECT id FROM post_embeddings WHERE post_id = :pid"),
            {"pid": str(test_post.id)},
        ).fetchall()
        assert len(rows) == 0

    def test_exception_does_not_propagate(self, db_session, monkeypatch, test_post, test_user):
        import backend.ai.embeddings as emb_mod

        v = _make_version(db_session, test_post, "Some content", version_number=1)

        mock = MagicMock()
        mock.embed_documents.side_effect = RuntimeError("Gemini API down")
        monkeypatch.setattr(emb_mod, "_embeddings", mock)

        original = emb_mod.SessionLocal
        emb_mod.SessionLocal = _fake_session_factory(db_session)
        try:
            # Must not raise
            emb_mod.embed_and_store_version(
                version_id=str(v.id),
                post_id=str(test_post.id),
                user_id=str(test_user.id),
                content="Some content"
            )
        finally:
            emb_mod.SessionLocal = original
