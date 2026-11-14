"""Opt-in retrieval evidence for a workspace administrator's Ragas smoke test.

Disabled unless the workspace UUID is explicitly allowlisted on the server.
Runs the existing search_knowledge tool with the caller's normal access checks.
Raw evidence is returned only to that request, never added to logs/checkpoints.
"""

import asyncio
import json
import time
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Request, Response
from pydantic import Field, field_validator
from sqlalchemy.orm import Session

from backend.ai.tools.context import ToolContext
from backend.ai.tools.knowledge_tools import SEARCH, build_knowledge_tools
from backend.auth.models import User
from backend.auth.services import get_current_user
from backend.core.config import settings
from backend.core.database import get_db
from backend.knowledge.permissions import WorkspaceKnowledgeScope
from backend.workspaces import service
from backend.workspaces.schemas import Input, TextInput

router = APIRouter()


class RetrievalIn(Input):
    query: TextInput = Field(max_length=500)
    document_ids: list[UUID] = Field(min_length=1, max_length=5)

    @field_validator("document_ids")
    @classmethod
    def unique(cls, ids):
        if len(set(ids)) != len(ids):
            raise ValueError("Duplicate document IDs")
        return ids


@router.post("/{workspace_id}/evaluation/retrieve")
async def retrieve_evidence(
    workspace_id: UUID,
    body: RetrievalIn,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    enabled = {v.strip() for v in settings.RAG_EVALUATION_WORKSPACE_IDS.split(",") if v.strip()}
    if str(workspace_id) not in enabled:
        service.fail(404, "evaluation_not_enabled")
    service.member(db, workspace_id, user.id, admin=True)
    selected = set(body.document_ids)
    visible = {d.id for d in service.visible_documents(db, workspace_id, user.id) if d.sync_status == "synced"}
    if not selected <= visible:
        service.fail(422, "evaluation_document_unavailable")
    knowledge = getattr(request.app.state, "knowledge", None)
    if knowledge is None:
        service.fail(503, "knowledge_tools_disabled")
    user_id = user.id
    db.rollback()  # do not hold the request's DB connection during embedding calls
    trace_id = str(uuid4())
    ctx = ToolContext(
        user_id=user_id, agent="ragas_evaluation", correlation_id=trace_id,
        knowledge_scope=WorkspaceKnowledgeScope(workspace_id, document_ids=tuple(body.document_ids)),
        enabled_tools=(SEARCH,),
    )
    tool = next(t for t in build_knowledge_tools(ctx, knowledge.service) if t.name == SEARCH)
    start = time.monotonic()
    try:
        # Same tool and JSON payload used by agents; no gold-context substitution.
        from langsmith import tracing_context

        with tracing_context(enabled=False):
            raw = await asyncio.wait_for(tool.ainvoke({"query": body.query}), timeout=30)
        payload = json.loads(raw)
        if payload.get("error"):
            service.fail(502, "evaluation_retrieval_failed")
    except TimeoutError:
        service.fail(504, "evaluation_retrieval_timeout")
    contexts, document_ids = [], []
    for document in payload.get("results", []):
        # Enforce the requested scope again on the response before evidence export.
        if UUID(document["document_id"]) not in selected:
            service.fail(502, "evaluation_scope_mismatch")
        for chunk in document["chunks"]:
            contexts.append(chunk["text"])
            document_ids.append(document["document_id"])
    response.headers["Cache-Control"] = "no-store"
    return {
        "trace_id": trace_id, "captured_at": datetime.now(UTC).isoformat(),
        "workspace_id": str(workspace_id), "user_input": body.query,
        "system_under_test": "honne_ai", "retrieval_origin": "honne_tool_output",
        "retrieved_contexts": contexts, "retrieved_source_ids": document_ids,
        "honne_document_ids": [str(v) for v in body.document_ids],
        "tool_output": raw, "latency_ms": round((time.monotonic() - start) * 1000),
        "retrieval_config": {
            "top_k": settings.KNOWLEDGE_SEARCH_TOP_K,
            "embedding_model": settings.EMBEDDING_MODEL_TAG,
            "order": "model_delivery_order_grouped_by_document",
        },
    }
