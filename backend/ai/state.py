from typing import Annotated, TypedDict
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    # Immutable input — set once by router, never mutated
    query:   str
    user_id: str

    # Groups this thread with sibling threads from the same frontend "chat" —
    # read only by get_session_context (tools.py) to look up earlier threads.
    # Absent on any checkpoint written before this field existed; always read
    # via .get(), never direct indexing, since old checkpoints won't have it.
    session_id: str

    # Message history — add_messages reducer appends every turn.
    # Includes HumanMessage, AIMessage (with tool_calls), and ToolMessage (tool results).
    messages: Annotated[list[HumanMessage | AIMessage], add_messages]

    # Supervisor routing
    task_type: str  # "" | "general" | "write" | "suggest"
    route:     str  # "research" | "tools" | "direct"

    # Supervisor's tool-calling-loop step budget — incremented on every
    # supervisor_node call, capped at 6 (see supervisor.py's _MAX_STEPS).
    # Overrunning it forces route="direct" instead of raising.
    steps_taken: int

    # Set by researcher_node: {"angles": [up to 5 wire dicts, adapted from ResearchArtifactItem
    # via ResearchArtifactParser.to_wire_dicts()], "search_context": str,
    # "summary": str}. "summary" is a short (2-4 sentence) personalized intro, grounded in
    # the user's profile when available, explaining what's being proposed and why — may be
    # "" if the LLM omitted it, never required. Read by angle_review_node (surfaced in the
    # interrupt payload) and by map_chosen_angle_node (indexed by picked_angle_id) once the
    # user picks one.
    research_result: dict

    # Set by angle_review_node once the user picks an angle (interrupt resume
    # action="pick"). None while nothing has been picked yet, or on "none_fit".
    picked_angle_id: int | None

    # Set by angle_review_node's "pick" branch from the resume payload's
    # "content" field — the raw stat/story/detail the user typed into the
    # frontend's "personalize the hook" modal before picking an angle. ""
    # when skipped. Read once by map_chosen_angle_node and folded into
    # research_brief.personal_hook_input for writer_node to open the post with.
    personal_hook_input: str

    # Debug/forward-compat marker — records which node most recently produced
    # a state transition worth knowing about on resume (e.g. "angle_review").
    # Not consumed by any routing logic yet.
    entry_point: str

    # True bypasses supervisor_node via the graph's conditional entry point — set only
    # by /draft-from-topic, where the target pipeline (writer_node -> human_approval_node)
    # is already known and there's nothing left to classify.
    pre_routed: bool

    # Inter-worker JSON contracts — structured dicts, never prose paragraphs
    style_json:     dict  # {"long_term": {9 style keys}, "short_term": {9 keys}|None}
    research_brief: dict  # DORMANT — legacy flat shape ({recommended_angle, talking_points, ...})
                          # written only by /draft-from-topic's manual pre-seed (see
                          # backend.ai.schemas.research.topic_to_flat). No longer written by any node.
    research_topics: list  # DORMANT — was written by the old (deleted) research_digest_node.
                            # Nothing populates this anymore; kept only for /stream's dead fallback branch.
    writer_task:    dict  # {action: "write"|"rewrite", topic, constraints: []}
    template:       dict  # {} until a template is picked/changed; set via /resume by
                          # angle_review_node's "pick" or human_approval_node's "regenerate"
                          # (backend.ai.templates.services.TemplateService resolves the id).
                          # Read by writer_node's _build_template_section.

    # Writer path
    draft:           str  # produced by writer_node
    approval_status: str  # "" | "approved" | "edited" | "rejected"

    # Set by human_approval_node on "approved"/"edited" — the vault post_id the
    # draft was saved to. Empty string until then (also on "rejected", where
    # nothing is saved). Lets the frontend call post_id-keyed endpoints
    # (LinkedIn publish, version history) without a separate lookup.
    post_id: str

    # Final surface output
    answer: str
