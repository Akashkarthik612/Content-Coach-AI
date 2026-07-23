"""
Activity Layer — the only module that knows both LangGraph's internal node/tool
names and the natural-language phrasing shown to the user.

Nodes and tools call emit_activity() with an internal id; this module is the
single seam translating that into a user-facing "activity" event. No node name,
agent name, or tool name (Tavily, web_search, gemini, ...) ever reaches the
frontend — only semantic descriptions of the work being done. This lets the
graph's internals change freely (split/merge/rename nodes, swap search
providers) without ever touching the SSE contract or the UI.

Emitted via LangGraph's get_stream_writer() (the "custom" stream mode) — a
no-op when no stream is subscribed (e.g. /query, /resume's ainvoke() calls),
so nodes can call this unconditionally without special-casing the call path.
"""
from langgraph.config import get_stream_writer

# node_name -> (activity_id, title) for whole-node running/completed activities.
NODE_ACTIVITIES = {
    "supervisor_node":      ("understanding_request", "Understanding your request"),
    "researcher_node":      ("researching",            "Researching your topic"),
    "writer_node":          ("writing_draft",          "Writing your draft"),
    "human_approval_node":  ("ready_for_review",        "Ready for your review"),
}

# tool_name -> user-facing label for child activities nested under "researching".
# Never surface the tool name itself, its query, or any URL it touched.
TOOL_ACTIVITIES = {
    "web_search":         "Searching the web",
    "search_vault_posts": "Checking your past posts",
}

BUILDING_ANGLES_ID    = "building_angles"
BUILDING_ANGLES_TITLE = "Building content angles"

# Child activity nested under writer_node's "writing_draft" — style resolution
# used to be its own graph node (style_retriever_node); folded into writer_node
# as a plain pre-step, but keeps the same id/title so the frontend timeline key
# stays stable.
STYLE_ANALYSIS_ID    = "style_analysis"
STYLE_ANALYSIS_TITLE = "Learning your writing style"


def emit_activity(
    id: str,
    title: str,
    status: str,
    parent_id: str | None = None,
    description: str = "",
) -> None:
    """
    status: "pending" | "running" | "completed" | "failed"

    Silently does nothing outside an active LangGraph run (get_stream_writer()
    raises RuntimeError when there's no run context, e.g. a direct unit-test
    call) — activity reporting must never break the actual graph logic.
    """
    try:
        writer = get_stream_writer()
    except RuntimeError:
        return
    writer({
        "type":        "activity",
        "id":          id,
        "parentId":    parent_id,
        "title":       title,
        "description": description,
        "status":      status,
    })


def emit_node_activity(node_name: str, status: str, description: str = "") -> None:
    """Convenience wrapper for the common whole-node case — looks up id/title
    from NODE_ACTIVITIES so call sites never spell out raw node identity."""
    activity_id, title = NODE_ACTIVITIES[node_name]
    emit_activity(activity_id, title, status, description=description)
