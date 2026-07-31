import logging
from datetime import datetime, timezone

from langgraph.store.postgres import AsyncPostgresStore
from pydantic import BaseModel

logger = logging.getLogger(__name__)

_TITLE_MAX_LEN = 60
_FALLBACK_TITLE = "New chat"
_NAMESPACE_ROOT = "chat_sessions"
# Must match factory.py's _SESSION_TTL_MINUTES — kept as a separate constant here
# (not imported) to avoid a checkpointing.factory <-> checkpointing.session_memory_store
# import cycle; this is an application-level display/list filter, not the Store's
# own TTL config, see list_active()'s docstring.
_SESSION_TTL_SECONDS = 60 * 24 * 7 * 60


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def derive_title(prompt: str) -> str:
    """Session display title — the truncated first prompt, or a fallback for an
    empty/whitespace-only prompt (e.g. a blank submit, or /draft-from-topic
    without a free-text prompt)."""
    cleaned = " ".join(prompt.split())
    if not cleaned:
        return _FALLBACK_TITLE
    if len(cleaned) <= _TITLE_MAX_LEN:
        return cleaned
    return cleaned[:_TITLE_MAX_LEN].rstrip() + "…"


class ChatSessionRecord(BaseModel):
    """Shape of a chat_sessions Store value. Deliberately holds no message/draft
    content — that stays in the checkpointer. Just enough to list and search a
    user's sessions in the sidebar."""

    title: str
    last_active_at: datetime
    thread_ids: list[str]


class SessionMemoryService:
    """All chat_sessions namespace reads/writes. Encapsulates the namespace/key
    shape, the TTL/index quirks (title-only indexing, "New chat" exclusion,
    read-modify-write upserts — the Store has no partial merge), and a belt-
    and-suspenders expiry filter so list_active() never shows a session that's
    expired-but-not-yet-swept (the Store's own aget/asearch SQL does not filter
    on expires_at — confirmed by reading the installed package directly)."""

    def __init__(self, store: AsyncPostgresStore):
        self._store = store

    def _namespace(self, user_id: str) -> tuple[str, str]:
        return (_NAMESPACE_ROOT, user_id)

    async def get(self, user_id: str, session_id: str) -> ChatSessionRecord | None:
        item = await self._store.aget(self._namespace(user_id), session_id)
        if item is None:
            return None
        return ChatSessionRecord.model_validate(item.value)

    async def start_or_touch(
        self, user_id: str, session_id: str, thread_id: str, first_prompt: str
    ) -> None:
        """Called from ThreadSessionService.start() — a brand-new session gets
        created, an existing one gets a new thread_id appended and its activity
        clock bumped. Both cases refresh the 7-day TTL (put() refreshes on
        write, per the Store's own documented TTL semantics)."""
        namespace = self._namespace(user_id)
        existing = await self.get(user_id, session_id)

        if existing is None:
            title = derive_title(first_prompt)
            record = ChatSessionRecord(
                title=title, last_active_at=_utcnow(), thread_ids=[thread_id]
            )
            # "New chat" sessions are excluded from semantic indexing (index=False)
            # so they never surface as false-positive matches for unrelated
            # recall_past_sessions queries — see plan's edge case E1.
            index = False if title == _FALLBACK_TITLE else ["title"]
            await self._store.aput(
                namespace, session_id, record.model_dump(mode="json"), index=index
            )
            logger.debug(
                "SessionMemoryService: created session_id=%s user_id=%s title=%r",
                session_id, user_id, title,
            )
            return

        record = existing.model_copy(
            update={
                "last_active_at": _utcnow(),
                "thread_ids": [*existing.thread_ids, thread_id],
            }
        )
        index = False if record.title == _FALLBACK_TITLE else ["title"]
        await self._store.aput(
            namespace, session_id, record.model_dump(mode="json"), index=index
        )

    async def touch_existing(self, user_id: str, session_id: str) -> None:
        """Called from ThreadSessionService.resume_config() — the user acted on
        a paused thread (approve/edit/reject, angle pick/expand/none_fit).
        No-op if the session record is somehow missing (e.g. pre-dates this
        feature) — resuming the underlying thread must never fail because of
        this side channel."""
        existing = await self.get(user_id, session_id)
        if existing is None:
            logger.warning(
                "SessionMemoryService.touch_existing: no chat_sessions record for "
                "session_id=%s user_id=%s — skipping (thread resume proceeds regardless)",
                session_id, user_id,
            )
            return
        record = existing.model_copy(update={"last_active_at": _utcnow()})
        index = False if record.title == _FALLBACK_TITLE else ["title"]
        await self._store.aput(
            self._namespace(user_id), session_id, record.model_dump(mode="json"), index=index
        )

    async def list_active(
        self, user_id: str, limit: int = 50
    ) -> list[tuple[str, ChatSessionRecord]]:
        """Most-recently-active first. Applies its own last_active_at cutoff
        rather than trusting the Store to have physically swept expired rows
        yet (sweep_interval_minutes=60 means up to an hour of lag) — see plan's
        edge case E4."""
        items = await self._store.asearch(self._namespace(user_id), limit=limit)
        cutoff = _utcnow().timestamp() - _SESSION_TTL_SECONDS
        results = []
        for item in items:
            record = ChatSessionRecord.model_validate(item.value)
            if record.last_active_at.timestamp() >= cutoff:
                results.append((item.key, record))
        results.sort(key=lambda pair: pair[1].last_active_at, reverse=True)
        return results

    async def search(
        self, user_id: str, query: str, limit: int = 3
    ) -> list[tuple[str, ChatSessionRecord, float]]:
        """Semantic search over this user's session titles only — namespace-
        scoped, so no cross-user leakage. "New chat" sessions were never
        indexed (see start_or_touch) so they can't appear here."""
        items = await self._store.asearch(self._namespace(user_id), query=query, limit=limit)
        return [
            (item.key, ChatSessionRecord.model_validate(item.value), item.score or 0.0)
            for item in items
        ]
