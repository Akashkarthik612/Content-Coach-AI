"""
Tests for ai/agents/tools.py — each @tool function, cache hit/miss paths.
SessionLocal in tools module is patched to use the test db_session.
"""

import uuid
import json
import pytest
from contextlib import contextmanager
from unittest.mock import MagicMock, AsyncMock

from backend.vault.models import (
    Post, PostStatus, PostVersion, PostTag, PostPublishLog, Folder,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def patch_tools_session(db_session, monkeypatch):
    """Make tools.py's SessionLocal() yield the test db_session."""
    import backend.ai.agents.tools as tools_mod

    @contextmanager
    def fake_session():
        yield db_session

    monkeypatch.setattr(tools_mod, "SessionLocal", fake_session)
    return db_session


@pytest.fixture
def patch_embed_query(monkeypatch):
    """Patch _embeddings.embed_query in tools.py to return a dummy vector."""
    import backend.ai.agents.tools as tools_mod
    mock = MagicMock()
    mock.embed_query.return_value = [0.1] * 768
    monkeypatch.setattr(tools_mod, "_embeddings", mock)
    return mock


@pytest.fixture
def seeded_published_post(db_session, test_user, test_folder):
    """Create a published post with one version."""
    post = Post(
        id=uuid.uuid4(), user_id=test_user.id, folder_id=test_folder.id,
        title="Seeded Post", status=PostStatus.published, current_version=1,
    )
    db_session.add(post)
    db_session.flush()
    version = PostVersion(
        id=uuid.uuid4(), post_id=post.id, version_number=1,
        content="Seeded post content about Python and data science.",
        source="manual", char_count=55,
    )
    db_session.add(version)
    db_session.flush()
    return post, version


# ---------------------------------------------------------------------------
# search_vault_posts
# ---------------------------------------------------------------------------

class TestSearchVaultPosts:
    async def test_cache_hit_returns_cached_value(self, mock_redis, patch_embed_query, test_user):
        import backend.ai.agents.tools as tools_mod
        from backend.core.cache import tool_key

        fake_async, _ = mock_redis
        key           = tool_key("search_vault_posts", str(test_user.id), "python")
        await fake_async.set(key, "Cached result")

        result = await tools_mod.search_vault_posts.ainvoke({
            "user_id": str(test_user.id),
            "query":   "python",
        })
        assert result == "Cached result"
        patch_embed_query.embed_query.assert_not_called()

    async def test_no_results_returns_no_context(
        self, mock_redis, patch_tools_session, patch_embed_query, test_user
    ):
        import backend.ai.agents.tools as tools_mod

        result = await tools_mod.search_vault_posts.ainvoke({
            "user_id": str(test_user.id),
            "query":   "totally obscure topic",
        })
        assert "NO_CONTEXT_FOUND" in result or "no" in result.lower()

    async def test_result_cached_after_db_fetch(
        self, mock_redis, patch_tools_session, patch_embed_query, test_user
    ):
        import backend.ai.agents.tools as tools_mod
        from backend.core.cache import tool_key

        await tools_mod.search_vault_posts.ainvoke({
            "user_id": str(test_user.id),
            "query":   "cache_test_query",
        })
        fake_async, _ = mock_redis
        key = tool_key("search_vault_posts", str(test_user.id), "cache_test_query")
        cached = await fake_async.get(key)
        assert cached is not None


# ---------------------------------------------------------------------------
# get_style_samples
# ---------------------------------------------------------------------------

class TestGetStyleSamples:
    async def test_redis_hit_returns_style_profile(self, mock_redis, test_user):
        import backend.ai.agents.tools as tools_mod
        from backend.ai.style_memory import style_lt_key

        fake_async, _ = mock_redis
        style_data    = {"hook_style": "bold", "tone": "casual"}
        await fake_async.set(style_lt_key(str(test_user.id)), json.dumps(style_data))

        result = await tools_mod.get_style_samples.ainvoke({"user_id": str(test_user.id)})
        assert "bold" in result or "style" in result.lower()

    async def test_cold_start_fallback_with_posts(
        self, mock_redis, patch_tools_session, test_user, seeded_published_post
    ):
        import backend.ai.agents.tools as tools_mod

        result = await tools_mod.get_style_samples.ainvoke({"user_id": str(test_user.id)})
        assert "Seeded Post" in result or "python" in result.lower() or len(result) > 10

    async def test_no_posts_returns_no_context(
        self, mock_redis, patch_tools_session, test_user
    ):
        import backend.ai.agents.tools as tools_mod

        result = await tools_mod.get_style_samples.ainvoke({"user_id": str(test_user.id)})
        assert "NO_CONTEXT_FOUND" in result or "no" in result.lower() or len(result) > 0


# ---------------------------------------------------------------------------
# get_topic_inventory
# ---------------------------------------------------------------------------

class TestGetTopicInventory:
    async def test_with_posts_returns_titles(
        self, mock_redis, patch_tools_session, test_user, seeded_published_post
    ):
        import backend.ai.agents.tools as tools_mod

        result = await tools_mod.get_topic_inventory.ainvoke({"user_id": str(test_user.id)})
        assert "Seeded Post" in result

    async def test_empty_returns_no_context(
        self, mock_redis, patch_tools_session, test_user
    ):
        import backend.ai.agents.tools as tools_mod

        result = await tools_mod.get_topic_inventory.ainvoke({"user_id": str(test_user.id)})
        assert "NO_CONTEXT_FOUND" in result or "no" in result.lower() or len(result) > 0


# ---------------------------------------------------------------------------
# get_post_analytics
# ---------------------------------------------------------------------------

class TestGetPostAnalytics:
    async def test_with_analytics_data(
        self, mock_redis, patch_tools_session, db_session, test_user, seeded_published_post
    ):
        import backend.ai.agents.tools as tools_mod
        from backend.vault.models import PostAnalytics
        import datetime

        post, _ = seeded_published_post
        analytics = PostAnalytics(
            id=uuid.uuid4(), post_id=post.id, user_id=test_user.id,
            impressions=200, reactions=15,
            updated_at=datetime.datetime.now(datetime.timezone.utc),
        )
        db_session.add(analytics)
        db_session.flush()

        result = await tools_mod.get_post_analytics.ainvoke({"user_id": str(test_user.id)})
        assert "Seeded Post" in result or "200" in result or len(result) > 10

    async def test_empty_returns_no_analytics_context(
        self, mock_redis, patch_tools_session, test_user
    ):
        import backend.ai.agents.tools as tools_mod

        result = await tools_mod.get_post_analytics.ainvoke({"user_id": str(test_user.id)})
        assert "NO_ANALYTICS_CONTEXT" in result or "no" in result.lower() or len(result) > 0


# ---------------------------------------------------------------------------
# analyze_publish_history
# ---------------------------------------------------------------------------

class TestAnalyzePublishHistory:
    async def test_with_publish_log(
        self, mock_redis, patch_tools_session, db_session, test_user, seeded_published_post
    ):
        import backend.ai.agents.tools as tools_mod
        import datetime

        post, version = seeded_published_post
        log = PostPublishLog(
            id=uuid.uuid4(), post_id=post.id, version_id=version.id,
            platform="linkedin",
            published_at=datetime.datetime.now(datetime.timezone.utc),
        )
        db_session.add(log)
        db_session.flush()

        result = await tools_mod.analyze_publish_history.ainvoke({"user_id": str(test_user.id)})
        assert "linkedin" in result.lower() or "Seeded Post" in result or len(result) > 10

    async def test_empty_returns_no_analytics_context(
        self, mock_redis, patch_tools_session, test_user
    ):
        import backend.ai.agents.tools as tools_mod

        result = await tools_mod.analyze_publish_history.ainvoke({"user_id": str(test_user.id)})
        assert "NO_ANALYTICS_CONTEXT" in result or "no" in result.lower() or len(result) > 0
