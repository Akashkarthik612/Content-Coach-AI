from typing import Annotated, TypedDict
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph.message import add_messages

'''This is the State file which our agents will use to store the data of per session flow or working flow
main use to orchestrate info from research agent to supervisor agent and then to helper agent and then back to supervisor agent and then to user.
so mainly its all about sharing the information data as agents work to geather'''


class AgentState(TypedDict):
    # ── Input (set once, never mutated) ───────────────────────────────────────
    query: str          # original user prompt — never changes across the graph
    user_id: str        # whose DB rows to query — scopes all data fetches

    # ── Conversation history ───────────────────────────────────────────────────
    # Annotated[list, add_messages] is a LangGraph reducer.
    # Instead of replacing the list, it APPENDS each new message automatically.
    # Human turn  → HumanMessage(content="summarize my RAG post")
    # LLM turn    → AIMessage(content="Here is your summary...")
    # Subagent    → AIMessage(content='{"posts": [...]}', name="researcher")
    #                                  ↑ JSON string, parse with json.loads()
    messages: Annotated[list[HumanMessage | AIMessage], add_messages]

    # ── Supervisor decision ────────────────────────────────────────────────────
    task_type: str      # "general" | "summarize" | "write"
    route: str          # "direct" | "researcher" | "writer"

    # ── Researcher output ──────────────────────────────────────────────────────
    post_context: str   # raw post content fetched from DB or vector search

    # ── Writer output ──────────────────────────────────────────────────────────
    draft: str          # written/improved content produced by writer

    # ── Final output ───────────────────────────────────────────────────────────
    answer: str         # final response sent back to the user
