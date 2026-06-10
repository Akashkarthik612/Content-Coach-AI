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


def _call_embed(db_session, mock_embeddings, content="Hello world content."):
    """Calls embed_and_store_version (sync) with patched SessionLocal."""
    import backend.ai.embeddings as emb_mod

    original = emb_mod.SessionLocal
    emb_mod.SessionLocal = _fake_session_factory(db_session)

    post_id    = uuid.uuid4()
    version_id = uuid.uuid4()
    user_id    = uuid.uuid4()

    try:
        emb_mod.embed_and_store_version(
            version_id=str(version_id),
            post_id=str(post_id),
            user_id=str(user_id),
            content=content,
        )
    finally:
        emb_mod.SessionLocal = original

    return post_id, version_id, user_id


class TestEmbedAndStoreVersion:
    def test_inserts_chunks(self, db_session, mock_embeddings):
        post_id, _, _ = _call_embed(db_session, mock_embeddings)

        rows = db_session.execute(
            text("SELECT chunk_index FROM post_embeddings WHERE post_id = :pid ORDER BY chunk_index"),
            {"pid": str(post_id)},
        ).fetchall()
        assert len(rows) >= 1
        assert rows[0].chunk_index == 0

    def test_multi_chunk_long_content(self, db_session, mock_embeddings):
        long_content = "A " * 400  # well over 650 chars → at least 2 chunks
        mock_embeddings.embed_documents.return_value = [[0.1] * 768, [0.2] * 768]

        post_id, _, _ = _call_embed(db_session, mock_embeddings, content=long_content)

        rows = db_session.execute(
            text("SELECT chunk_index FROM post_embeddings WHERE post_id = :pid ORDER BY chunk_index"),
            {"pid": str(post_id)},
        ).fetchall()
        assert len(rows) == 2
        assert rows[1].chunk_index == 1

    def test_replaces_existing_chunks(self, db_session, mock_embeddings):
        import backend.ai.embeddings as emb_mod

        original = emb_mod.SessionLocal
        emb_mod.SessionLocal = _fake_session_factory(db_session)

        post_id = uuid.uuid4()
        user_id = uuid.uuid4()

        try:
            emb_mod.embed_and_store_version(
                version_id=str(uuid.uuid4()), post_id=str(post_id),
                user_id=str(user_id), content="First version content."
            )
            emb_mod.embed_and_store_version(
                version_id=str(uuid.uuid4()), post_id=str(post_id),
                user_id=str(user_id), content="Second version content."
            )
        finally:
            emb_mod.SessionLocal = original

        rows = db_session.execute(
            text("SELECT id FROM post_embeddings WHERE post_id = :pid"),
            {"pid": str(post_id)},
        ).fetchall()
        assert len(rows) == 1

    def test_empty_content_no_rows_inserted(self, db_session, mock_embeddings):
        mock_embeddings.embed_documents.return_value = []
        post_id, _, _ = _call_embed(db_session, mock_embeddings, content="")

        rows = db_session.execute(
            text("SELECT id FROM post_embeddings WHERE post_id = :pid"),
            {"pid": str(post_id)},
        ).fetchall()
        assert len(rows) == 0

    def test_exception_does_not_propagate(self, db_session, monkeypatch):
        import backend.ai.embeddings as emb_mod

        mock = MagicMock()
        mock.embed_documents.side_effect = RuntimeError("Gemini API down")
        monkeypatch.setattr(emb_mod, "_embeddings", mock)

        original = emb_mod.SessionLocal
        emb_mod.SessionLocal = _fake_session_factory(db_session)
        try:
            # Must not raise
            emb_mod.embed_and_store_version(
                version_id=str(uuid.uuid4()), post_id=str(uuid.uuid4()),
                user_id=str(uuid.uuid4()), content="Some content"
            )
        finally:
            emb_mod.SessionLocal = original
