"""Persistent multiplayer turns, with short row locks and attempt-fenced background writes."""

import logging
import re
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select

from backend.agents.models import AgentConfiguration
from backend.workspaces.models import ChatMessage, Conversation
from backend.workspaces.runtime import (
    AGENT_TIMEOUT_S,
    attributed_history,
    database,
    error_code,
    execute_agent,
)
from backend.workspaces.service import fail, get_agent, member, version_for

logger = logging.getLogger(__name__)
MENTION = re.compile(r"^\s*@([a-z0-9][a-z0-9-]{1,29})(?![a-z0-9-])", re.IGNORECASE)


def conversation(db, workspace_id, conversation_id, lock=False):
    query = select(Conversation).where(
        Conversation.id == conversation_id, Conversation.workspace_id == workspace_id
    )
    row = db.scalar(query.with_for_update() if lock else query)
    if row is None:
        fail(404, "conversation_not_found")
    return row


def expire_messages(db, conversation_id):
    cutoff = datetime.now(UTC) - timedelta(seconds=AGENT_TIMEOUT_S + 120)
    rows = db.scalars(
        select(ChatMessage)
        .where(
            ChatMessage.conversation_id == conversation_id,
            ChatMessage.status == "running",
            ChatMessage.started_at < cutoff,
        )
        .with_for_update()
    ).all()
    for row in rows:
        row.status, row.error_code, row.finished_at = "failed", "stale_job", datetime.now(UTC)
    db.flush()


def message_json(row):
    return {
        k: getattr(row, k)
        for k in (
            "id",
            "conversation_id",
            "seq",
            "role",
            "employee_id",
            "agent_id",
            "agent_version_id",
            "agent_handle",
            "status",
            "content",
            "sources",
            "steps",
            "usage",
            "error_code",
            "started_at",
            "finished_at",
            "created_at",
        )
    }


def start_turn(db, workspace_id, user_id, conversation_id, text):
    member(db, workspace_id, user_id)
    chat = conversation(db, workspace_id, conversation_id, lock=True)
    expire_messages(db, chat.id)
    if db.scalar(
        select(ChatMessage.id).where(ChatMessage.conversation_id == chat.id, ChatMessage.status == "running")
    ):
        fail(409, "conversation_busy")
    if chat.next_seq > 400:
        fail(409, "conversation_message_limit")
    mention = MENTION.match(text)
    if mention:
        agent = db.scalar(
            select(AgentConfiguration).where(
                AgentConfiguration.workspace_id == workspace_id,
                AgentConfiguration.handle == mention.group(1).lower(),
                AgentConfiguration.archived_at.is_(None),
            )
        )
        if agent is None:
            fail(404, "agent_not_found")
    else:
        last = db.scalar(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == chat.id, ChatMessage.role == "assistant")
            .order_by(ChatMessage.seq.desc())
            .limit(1)
        )
        if not last or not last.agent_id:
            fail(422, "start_with_agent_mention")
        agent = get_agent(db, workspace_id, last.agent_id)
    version = version_for(db, agent)
    question = ChatMessage(
        conversation_id=chat.id,
        seq=chat.next_seq,
        role="user",
        employee_id=user_id,
        content=text,
        status="ok",
    )
    answer = ChatMessage(
        conversation_id=chat.id,
        seq=chat.next_seq + 1,
        role="assistant",
        employee_id=user_id,
        agent_id=agent.id,
        agent_version_id=version.id,
        agent_handle=agent.handle,
        status="running",
        attempt_id=uuid4(),
        started_at=datetime.now(UTC),
    )
    chat.next_seq += 2
    chat.updated_at = datetime.now(UTC)
    db.add_all([question, answer])
    db.flush()
    return answer.id, answer.attempt_id


def retry_turn(db, workspace_id, user_id, conversation_id):
    member(db, workspace_id, user_id)
    chat = conversation(db, workspace_id, conversation_id, lock=True)
    expire_messages(db, chat.id)
    last = db.scalar(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == chat.id)
        .order_by(ChatMessage.seq.desc())
        .limit(1)
    )
    if last is None or last.role != "assistant" or last.status != "failed":
        fail(409, "no_failed_turn")
    get_agent(db, workspace_id, last.agent_id)
    last.status, last.error_code, last.finished_at = "running", None, None
    last.attempt_id, last.started_at, last.employee_id = uuid4(), datetime.now(UTC), user_id
    last.steps, last.usage = [], {}
    return last.id, last.attempt_id


def _job_context(db, message_id, attempt_id):
    answer = db.get(ChatMessage, message_id)
    if not answer or answer.attempt_id != attempt_id or answer.status != "running":
        return None
    chat = db.get(Conversation, answer.conversation_id)
    member(db, chat.workspace_id, answer.employee_id)
    rows = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == chat.id, ChatMessage.seq < answer.seq)
        .order_by(ChatMessage.seq.desc())
        .limit(40)
    ).all()
    history = []
    for row in reversed(rows):
        item = message_json(row)
        for key in ("agent_id", "employee_id"):
            item[key] = str(item[key]) if item[key] else None
        history.append(item)
    return chat.workspace_id, answer.employee_id, answer.agent_id, answer.agent_version_id, history


def _event(db, message_id, attempt_id, event, data):
    row = db.scalar(select(ChatMessage).where(ChatMessage.id == message_id).with_for_update())
    if not row or row.status != "running" or row.attempt_id != attempt_id:
        fail(409, "turn_no_longer_running")
    row.steps = [*row.steps, {"event": event, "at": datetime.now(UTC).isoformat(), **data}]
    if "usage" in data:
        row.usage = data["usage"]


def _finish(db, message_id, attempt_id, result=None, code=None):
    row = db.scalar(select(ChatMessage).where(ChatMessage.id == message_id).with_for_update())
    if not row or row.attempt_id != attempt_id or row.status != "running":
        return
    row.status, row.error_code, row.finished_at = "failed" if code else "ok", code, datetime.now(UTC)
    if result:
        row.content = result["content"] + (f"\n\nNote: {result['note']}" if result.get("note") else "")
        row.sources, row.usage = result["sources"], result["usage"]


async def run_turn(knowledge, message_id, attempt_id):
    try:
        context = await database(_job_context, message_id, attempt_id)
        if context is None:
            return
        workspace_id, user_id, agent_id, version_id, history = context

        async def event(name, data):
            await database(_event, message_id, attempt_id, name, data)

        context_sources = {}
        result = await execute_agent(
            knowledge,
            workspace_id,
            user_id,
            version_id,
            [],
            event,
            context_builder=lambda allowed: attributed_history(history, allowed, agent_id, context_sources),
        )
        # Preserve provenance through context-only replies, so a later specialist cannot
        # receive source-derived content that has lost its original document permissions.
        context_sources.update({s["document_id"]: s for s in result["sources"]})
        result["sources"] = list(context_sources.values())
        await database(_finish, message_id, attempt_id, result)
    except Exception as exc:  # noqa: BLE001 - background boundary persists a sanitized failure state
        logger.warning("workspace_chat_failed message_id=%s error_code=%s", message_id, error_code(exc))
        await database(_finish, message_id, attempt_id, code=error_code(exc))
