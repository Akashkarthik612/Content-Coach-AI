"""
Redis cache layer.

Two clients:
  _async_redis — used by async tool functions (aioredis, non-blocking)
  _sync_redis  — used by sync FastAPI background tasks (blocking, simple)

Key namespaces:
  tool:{tool_name}:{user_id}[:{query_hash}]  — tool result strings, TTL 30 min
  embed:{query_hash}                          — query embedding vectors, TTL 24 h
  style:lt:{user_id}                          — long-term style JSON, TTL 24 h
  style:st:{user_id}                          — short-term style JSON, TTL 1 h
"""
import hashlib
import json
import logging

import redis
import redis.asyncio as aioredis

from backend.core.config import settings

logger = logging.getLogger(__name__)

# TTLs
_TOOL_TTL       = 1800   # 30 minutes — safety net; invalidated actively on save
_EMBED_TTL      = 86400  # 24 hours   — content-addressed; same text = same vector
_LT_STYLE_TTL   = 86400  # 24 hours   — long-term style; replaced on LT analysis run
_ST_STYLE_TTL   = 3600   # 1 hour     — short-term style; replaced on ST analysis run


# ── Lazy singletons ───────────────────────────────────────────────────────────

_async_redis: aioredis.Redis | None = None
_sync_redis:  redis.Redis    | None = None


def _get_async() -> aioredis.Redis:
    global _async_redis
    if _async_redis is None:
        _async_redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _async_redis


def _get_sync() -> redis.Redis:
    global _sync_redis
    if _sync_redis is None:
        _sync_redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _sync_redis


# ── Key helpers ───────────────────────────────────────────────────────────────

def query_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def tool_key(tool_name: str, user_id: str, extra: str = "") -> str:
    base = f"tool:{tool_name}:{user_id}"
    return f"{base}:{extra}" if extra else base


def embed_key(query: str) -> str:
    return f"embed:{query_hash(query)}"


def style_lt_key(user_id: str) -> str:
    return f"style:lt:{user_id}"


def style_st_key(user_id: str) -> str:
    return f"style:st:{user_id}"


# ── Async helpers (used by @tool functions) ───────────────────────────────────

async def async_get(key: str) -> str | None:
    try:
        return await _get_async().get(key)
    except Exception:
        logger.warning("Redis async_get failed for key %s", key)
        return None


async def async_set(key: str, value: str, ttl: int = _TOOL_TTL) -> None:
    try:
        await _get_async().setex(key, ttl, value)
    except Exception:
        logger.warning("Redis async_set failed for key %s", key)


async def async_get_json(key: str) -> list | None:
    raw = await async_get(key)
    return json.loads(raw) if raw else None


async def async_set_json(key: str, value: list, ttl: int = _EMBED_TTL) -> None:
    await async_set(key, json.dumps(value), ttl=ttl)


async def invalidate_user_tool_cache(user_id: str) -> None:
    """Delete all tool result cache entries for a user (called after save_version)."""
    try:
        r = _get_async()
        keys = await r.keys(f"tool:*:{user_id}*")
        if keys:
            await r.delete(*keys)
            logger.debug("Invalidated %d cache key(s) for user %s", len(keys), user_id)
    except Exception:
        logger.warning("Redis cache invalidation failed for user %s", user_id)


# ── Sync helpers (used by BackgroundTask from sync vault routes) ──────────────

def sync_invalidate_user_tool_cache(user_id: str) -> None:
    """Sync version — called as BackgroundTask from sync FastAPI routes."""
    try:
        r = _get_sync()
        keys = r.keys(f"tool:*:{user_id}*")
        if keys:
            r.delete(*keys)
            logger.debug("Invalidated %d cache key(s) for user %s", len(keys), user_id)
    except Exception:
        logger.warning("Redis sync cache invalidation failed for user %s", user_id)


def sync_get_json(key: str) -> dict | None:
    """Sync Redis get, parses JSON. Returns None on miss or error."""
    try:
        raw = _get_sync().get(key)
        return json.loads(raw) if raw else None
    except Exception:
        logger.warning("Redis sync_get_json failed for key %s", key)
        return None


def sync_set_json(key: str, value: dict, ttl: int) -> None:
    """Sync Redis set with JSON serialisation. Silent on error."""
    try:
        _get_sync().setex(key, ttl, json.dumps(value))
    except Exception:
        logger.warning("Redis sync_set_json failed for key %s", key)
