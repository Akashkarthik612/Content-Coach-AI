"""Unit tests for ai/style_memory.py — thresholds, Redis caching, DB persistence."""

import uuid
import json
import pytest
from unittest.mock import MagicMock, patch

from backend.vault.models import Post, PostStatus, PostVersion, Folder


# ---------------------------------------------------------------------------
# Helpers to seed published posts in the test DB
# ---------------------------------------------------------------------------

def _seed_published_posts(db_session, user_id, count: int):
    folder = Folder(id=uuid.uuid4(), user_id=user_id, name="Style Test Folder")
    db_session.add(folder)
    db_session.flush()

    for i in range(count):
        post = Post(
            id=uuid.uuid4(),
            user_id=user_id,
            folder_id=folder.id,
            title=f"Post {i}",
            status=PostStatus.published,
            current_version=1,
        )
        db_session.add(post)
        db_session.flush()
        version = PostVersion(
            id=uuid.uuid4(),
            post_id=post.id,
            version_number=1,
            content=f"Content for post {i}. " * 20,
            source="manual",
            char_count=100,
        )
        db_session.add(version)
        db_session.flush()


# ---------------------------------------------------------------------------
# get_style_memory
# ---------------------------------------------------------------------------

class TestGetStyleMemory:
    async def test_redis_hit_skips_db(self, db_session, mock_redis, test_user, monkeypatch):
        from backend.ai import style_memory as sm

        fake_lt = {"hook_style": "bold", "tone": "casual"}
        fake_async, _ = mock_redis

        lt_key = sm.style_lt_key(str(test_user.id))
        await fake_async.set(lt_key, json.dumps(fake_lt))

        # Patch DB read to fail if called
        monkeypatch.setattr(sm, "_read_db_memory", MagicMock(side_effect=AssertionError("DB should not be called")))

        result = await sm.get_style_memory(str(test_user.id))
        assert result is not None
        assert result["long_term"]["hook_style"] == "bold"

    async def test_db_fallback_when_redis_miss(self, db_session, mock_redis, test_user, monkeypatch):
        from backend.ai import style_memory as sm
        import json
        from sqlalchemy import text

        db_session.execute(
            text("""
                INSERT INTO user_style_memory
                    (user_id, long_term, long_term_post_count, short_term, short_term_post_count)
                VALUES
                    (CAST(:uid AS uuid), CAST(:lt AS jsonb), :lt_count, NULL, 0)
            """),
            {"uid": str(test_user.id), "lt": json.dumps({"hook_style": "question"}), "lt_count": 5},
        )
        db_session.flush()

        # Patch SessionLocal inside style_memory to use test db_session
        import backend.ai.style_memory as sm_mod
        from contextlib import contextmanager

        @contextmanager
        def fake_session():
            yield db_session

        monkeypatch.setattr(sm_mod, "SessionLocal", fake_session)

        result = await sm.get_style_memory(str(test_user.id))
        assert result is not None
        assert result["long_term"]["hook_style"] == "question"

    async def test_no_row_returns_none(self, db_session, mock_redis, test_user, monkeypatch):
        import backend.ai.style_memory as sm_mod
        from contextlib import contextmanager

        @contextmanager
        def fake_session():
            yield db_session

        monkeypatch.setattr(sm_mod, "SessionLocal", fake_session)

        result = await sm_mod.get_style_memory(str(test_user.id))
        assert result is None


# ---------------------------------------------------------------------------
# sync_check_and_refresh_style_memory
# ---------------------------------------------------------------------------

class TestSyncCheckAndRefresh:
    def test_no_action_below_threshold(self, db_session, test_user, monkeypatch):
        import backend.ai.style_memory as sm_mod
        from contextlib import contextmanager

        @contextmanager
        def fake_session():
            yield db_session

        monkeypatch.setattr(sm_mod, "SessionLocal", fake_session)

        mock_analyze = MagicMock(return_value={"hook_style": "bold"})
        monkeypatch.setattr(sm_mod, "analyze_style", mock_analyze)

        _seed_published_posts(db_session, test_user.id, 2)  # below ST threshold of 3
        sm_mod.sync_check_and_refresh_style_memory(str(test_user.id))

        mock_analyze.assert_not_called()

    def test_triggers_st_at_threshold(self, db_session, test_user, monkeypatch):
        import backend.ai.style_memory as sm_mod
        from contextlib import contextmanager

        @contextmanager
        def fake_session():
            yield db_session

        monkeypatch.setattr(sm_mod, "SessionLocal", fake_session)

        mock_analyze = MagicMock(return_value={"hook_style": "question", "tone": "formal",
                                               "sentence_rhythm": "short", "paragraph_structure": "dense",
                                               "emoji_usage": "none", "cta_style": "soft",
                                               "vocabulary_level": "intermediate",
                                               "structural_patterns": "listicle",
                                               "recurring_themes": "leadership"})
        monkeypatch.setattr(sm_mod, "analyze_style", mock_analyze)

        _seed_published_posts(db_session, test_user.id, 3)  # exactly ST threshold
        sm_mod.sync_check_and_refresh_style_memory(str(test_user.id))

        mock_analyze.assert_called_once()

        from sqlalchemy import text
        row = db_session.execute(
            text("SELECT short_term FROM user_style_memory WHERE user_id = CAST(:uid AS uuid)"),
            {"uid": str(test_user.id)},
        ).fetchone()
        assert row is not None
        assert row.short_term is not None

    def test_triggers_lt_at_threshold(self, db_session, test_user, monkeypatch):
        import backend.ai.style_memory as sm_mod
        from contextlib import contextmanager

        @contextmanager
        def fake_session():
            yield db_session

        monkeypatch.setattr(sm_mod, "SessionLocal", fake_session)

        style_dict = {"hook_style": "q", "tone": "f", "sentence_rhythm": "s",
                      "paragraph_structure": "d", "emoji_usage": "n", "cta_style": "s",
                      "vocabulary_level": "i", "structural_patterns": "l", "recurring_themes": "l"}
        monkeypatch.setattr(sm_mod, "analyze_style", MagicMock(return_value=style_dict))

        _seed_published_posts(db_session, test_user.id, 10)  # LT threshold
        sm_mod.sync_check_and_refresh_style_memory(str(test_user.id))

        from sqlalchemy import text
        row = db_session.execute(
            text("SELECT long_term FROM user_style_memory WHERE user_id = CAST(:uid AS uuid)"),
            {"uid": str(test_user.id)},
        ).fetchone()
        assert row is not None
        assert row.long_term is not None


# ---------------------------------------------------------------------------
# format_style_memory_for_writer
# ---------------------------------------------------------------------------

class TestFormatStyleMemory:
    def test_output_contains_header(self):
        from backend.ai.style_memory import format_style_memory_for_writer
        memory = {
            "long_term": {"hook_style": "bold question", "tone": "casual"},
            "short_term": None,
        }
        result = format_style_memory_for_writer(memory)
        assert "style" in result.lower() or "writing" in result.lower()
        assert "bold question" in result
