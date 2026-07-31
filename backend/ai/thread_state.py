"""Shapes a LangGraph thread's checkpointed state into the plain dict the
frontend/tools expect. Single source of truth for "what does this thread's
current pause state mean" — replaces logic that used to be hand-duplicated
across /stream, /query, and /resume in router.py.
"""
from datetime import datetime

from langchain_core.messages import HumanMessage


def shape_thread_state(thread_id: str, state, created_at: datetime | None = None) -> dict:
    """state is a LangGraph StateSnapshot (the return of assistant.aget_state()).

    Returns a flat dict:
      thread_id, created_at, user_prompt, status, answer, draft, post_id, angles,
      actions, summary, approval_status
    status is one of: "awaiting_approval" | "awaiting_angle_selection" | "complete"
    approval_status ("" | "approved" | "edited" | "rejected") is only meaningful
    when status == "complete" and draft is non-empty — lets rehydration tell a
    still-pending draft apart from one already approved/edited/declined.
    """
    values = state.values or {}
    messages = values.get("messages", [])
    user_prompt = next(
        (m.content for m in messages if isinstance(m, HumanMessage)), ""
    )

    base = {
        "thread_id":   thread_id,
        "created_at":  created_at.isoformat() if created_at else "",
        "user_prompt": user_prompt,
    }

    if state.interrupts:
        interrupt_value = state.interrupts[0].value

        if "draft" in interrupt_value:
            return {
                **base,
                "status":          "awaiting_approval",
                "draft":           interrupt_value["draft"],
                "answer":          "",
                "post_id":         values.get("post_id", ""),
                "angles":          [],
                "actions":         [],
                "summary":         "",
                "approval_status": "",
            }

        return {
            **base,
            "status":            "awaiting_angle_selection",
            "draft":             "",
            "answer":            "",
            "post_id":           "",
            "angles":            interrupt_value.get("angles", []),
            "actions":           interrupt_value.get("actions", []),
            "summary":           interrupt_value.get("summary", ""),
            "approval_status":   "",
            # Surfaced so a page reload mid-expand/modify shows the latest
            # revision instead of silently losing it — only the latest
            # revision survives, not the full edit history (same as
            # human_approval_node's draft editing having no version history).
            "expanded_angle_id": interrupt_value.get("expanded_angle_id"),
            "expanded_sections": interrupt_value.get("expanded_sections", []),
        }

    return {
        **base,
        "status":          "complete",
        "answer":          values.get("answer", ""),
        "draft":           values.get("draft", ""),
        "post_id":         values.get("post_id", ""),
        "angles":          [],
        "actions":         [],
        "summary":         "",
        "approval_status": values.get("approval_status", ""),
    }
