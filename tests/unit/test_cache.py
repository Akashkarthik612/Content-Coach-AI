"""Unit tests for core/cache.py — key helpers, async/sync ops, invalidation."""

import hashlib
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.core.cache import (
    tool_key, embed_key, style_lt_key, style_st_key, query_hash,
    async_get, async_set, async_get_json, async_set_json,
    invalidate_user_tool_cache, sync_invalidate_user_tool_cache,
)

TEST_UID = "00000000-0000-0000-0000-000000000099"


# ---------------------------------------------------------------------------
# Key helpers (pure functions — no Redis needed)
# ---------------------------------------------------------------------------

class TestKeyHelpers:
    def test_tool_key_no_extra(self):
        key = tool_key("search_vault_posts", TEST_UID)
        assert key == f"tool:search_vault_posts:{TEST_UID}"

    def test_tool_key_with_extra(self):
        key = tool_key("search", TEST_UID, "abc")
        assert key == f"tool:search:{TEST_UID}:abc"

    def test_embed_key(self):
        text  = "hello world"
        h     = hashlib.sha256(text.encode()).hexdigest()[:16]
        assert embed_key(text) == f"embed:{h}"

    def test_style_lt_key(self):
        assert style_lt_key(TEST_UID) == f"style:lt:{TEST_UID}"

    def test_style_st_key(self):
        assert style_st_key(TEST_UID) == f"style:st:{TEST_UID}"

    def test_query_hash_length(self):
        assert len(query_hash("anything")) == 16


# ---------------------------------------------------------------------------
# Async get/set (use mock_redis fixture)
# ---------------------------------------------------------------------------

class TestAsyncOps:
    async def test_async_set_and_get(self, mock_redis):
        await async_set("mykey", "myvalue", ttl=60)
        result = await async_get("mykey")
        assert result == "myvalue"

    async def test_async_get_miss_returns_none(self, mock_redis):
        result = await async_get("does_not_exist")
        assert result is None

    async def test_async_set_json_and_get_json(self, mock_redis):
        data = [{"a": 1}, {"b": 2}]
        await async_set_json("jsonkey", data, ttl=60)
        result = await async_get_json("jsonkey")
        assert result == data

    async def test_async_get_json_miss_returns_none(self, mock_redis):
        result = await async_get_json("json_miss")
        assert result is None

    async def test_async_set_respects_ttl(self, mock_redis):
        fake_async, _ = mock_redis
        await async_set("ttlkey", "val", ttl=300)
        ttl = await fake_async.ttl("ttlkey")
        assert 0 < ttl <= 300

    async def test_invalidate_user_tool_cache_deletes_tool_keys(self, mock_redis):
        await async_set(f"tool:search:{TEST_UID}", "cached", ttl=60)
        await async_set(f"tool:analytics:{TEST_UID}", "cached2", ttl=60)
        await async_set("tool:search:other-uid", "other", ttl=60)

        await invalidate_user_tool_cache(TEST_UID)

        assert await async_get(f"tool:search:{TEST_UID}") is None
        assert await async_get(f"tool:analytics:{TEST_UID}") is None
        # Other user's key must be untouched
        assert await async_get("tool:search:other-uid") == "other"

    def test_sync_invalidate_user_tool_cache(self, mock_redis):
        _, fake_sync = mock_redis
        fake_sync.set(f"tool:search:{TEST_UID}", "val")
        fake_sync.set("tool:search:other-uid", "other")

        sync_invalidate_user_tool_cache(TEST_UID)

        assert fake_sync.get(f"tool:search:{TEST_UID}") is None
        assert fake_sync.get("tool:search:other-uid") == "other"

    async def test_redis_down_async_get_returns_none(self, monkeypatch):
        from backend.core import cache
        broken = MagicMock()
        broken.get = AsyncMock(side_effect=Exception("connection refused"))
        monkeypatch.setattr(cache, "_async_redis", broken)
        result = await async_get("any_key")
        assert result is None
