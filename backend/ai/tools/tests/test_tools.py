"""Knowledge tool adapter and ToolCallingRunner with fakes only (Day_7.md T8-T11).
No database, no Gemini."""

import json
import logging
import uuid

import pytest
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.utils.function_calling import convert_to_openai_tool
from pydantic import BaseModel, Field

from backend.ai.tools.context import ToolContext
from backend.ai.tools.knowledge_tools import build_knowledge_tools
from backend.ai.tools.tool_loop import SUBMIT, ToolCallingRunner, ToolLoopInvalidOutputError
from backend.knowledge.errors import DocumentNotFoundError
from backend.knowledge.records import ChunkSnippet, DocumentHits, DocumentPage
from tests.fakes import ScriptedChatModel, submit, tool_call

USER = uuid.uuid4()
CTX = ToolContext(user_id=USER, agent="linkedin", correlation_id="thread-1")
DOC_A, DOC_B = uuid.uuid4(), uuid.uuid4()


class Post(BaseModel):
    content: str = Field(min_length=1)
    note: str | None = None


class FakeRetrieval:
    """KnowledgeRetrievalService's surface; records the user_id of each call."""

    def __init__(self, sources: bool = True):
        self.users: list[uuid.UUID] = []
        self.sources = sources
        self.read_error: Exception | None = None
        self.search_hits = [
            DocumentHits(DOC_A, "Q3 plan", "https://a", (ChunkSnippet("## Pricing", "free for 60 days"),)),
            DocumentHits(DOC_B, "Board update", None, (ChunkSnippet(None, "approved"),)),
        ]

    async def search(self, user_id, query):
        self.users.append(user_id)
        return self.search_hits

    async def find(self, user_id, title_query, limit):
        self.users.append(user_id)
        return []

    async def list_documents(self, user_id, sort_by, limit, cursor):
        raise AssertionError("not used")

    async def read(self, user_id, document_id, offset, limit):
        self.users.append(user_id)
        if self.read_error:
            raise self.read_error
        return DocumentPage(document_id, "Q3 plan", "https://a", "full text", offset, 9, None)

    async def has_sources(self, user_id):
        return self.sources


def runner(rounds: int = 4, calls: int = 4) -> ToolCallingRunner:
    return ToolCallingRunner(max_rounds=rounds, max_calls=calls, tool_timeout_s=5)


# ── T8 no tenant field is model-visible ───────────────────────────────────────


def test_t8_tool_schemas_have_no_user_or_source_fields():
    for tool in build_knowledge_tools(CTX, FakeRetrieval()):
        declared = json.dumps(convert_to_openai_tool(tool)).lower()
        for forbidden in ("user_id", "user", "source_id", "source_ids", "tenant"):
            assert f'"{forbidden}"' not in declared, (tool.name, forbidden)
    assert [t.name for t in build_knowledge_tools(CTX, FakeRetrieval())] == [
        "search_knowledge",
        "find_documents",
        "list_documents",
        "read_document",
    ]


# ── T9 happy path ─────────────────────────────────────────────────────────────


async def test_t9_search_then_submit_returns_output_and_deduped_sources():
    retrieval = FakeRetrieval()
    model = ScriptedChatModel(
        tool_call("search_knowledge", {"query": "pricing"}),
        tool_call("read_document", {"document_id": str(DOC_A)}),  # DOC_A again: deduped
        submit(content="Pilots are free for 60 days.", note=None),
    )
    result = await runner().run(
        model, [HumanMessage("post about pricing")], build_knowledge_tools(CTX, retrieval), Post, CTX
    )

    assert result.output == Post(content="Pilots are free for 60 days.")
    assert [s.document_id for s in result.sources] == [DOC_A, DOC_B]
    assert [(c.name, c.ok, c.result_count) for c in result.calls] == [
        ("search_knowledge", True, 2),
        ("read_document", True, 1),
    ]
    assert (result.rounds, result.forced_submit) == (3, False)
    # The server's user, never the model's input.
    assert retrieval.users == [USER, USER]
    # Every round: all tools + submit_post, tool_choice="any".
    names, choice, _ = model.calls[0]
    assert names[-1] == SUBMIT and len(names) == 5 and choice == "any"
    # Round 3 saw both tool results.
    sent = model.calls[2][2]
    assert [type(m).__name__ for m in sent] == ["HumanMessage", "AIMessage", "ToolMessage", "AIMessage", "ToolMessage"]
    assert json.loads(sent[2].content)["results"][0]["title"] == "Q3 plan"


async def test_empty_result_without_sources_carries_the_hint():
    model = ScriptedChatModel(tool_call("find_documents", {"title_query": "plan"}), submit(content="x"))
    await runner().run(model, [HumanMessage("hi")], build_knowledge_tools(CTX, FakeRetrieval(sources=False)), Post, CTX)
    result = json.loads(model.calls[1][2][-1].content)
    assert result == {"documents": [], "hint": "no_sources"}


# ── T10 round cap → forced submit (D7-D4) ─────────────────────────────────────


async def test_t10_round_cap_forces_one_submit_only_call(caplog):
    model = ScriptedChatModel(
        tool_call("search_knowledge", {"query": "a"}),
        tool_call("search_knowledge", {"query": "b"}),
        submit(content="best effort"),
    )
    with caplog.at_level(logging.WARNING):
        result = await runner(rounds=2).run(
            model, [HumanMessage("hi")], build_knowledge_tools(CTX, FakeRetrieval()), Post, CTX
        )
    assert result.output.content == "best effort"
    assert (result.forced_submit, result.rounds) == (True, 3)
    assert model.calls[-1][0] == (SUBMIT,)  # only submit_post bound
    assert any("forced_submit=True" in r.getMessage() for r in caplog.records if r.levelno == logging.WARNING)


async def test_forced_round_without_submission_fails_loud():
    model = ScriptedChatModel(tool_call("search_knowledge", {"query": "a"}), tool_call("search_knowledge", {"query": "b"}))
    with pytest.raises(ToolLoopInvalidOutputError):
        await runner(rounds=1).run(model, [HumanMessage("hi")], build_knowledge_tools(CTX, FakeRetrieval()), Post, CTX)


async def test_invalid_submission_fails_loud():
    model = ScriptedChatModel(submit(content=""))
    with pytest.raises(ToolLoopInvalidOutputError):
        await runner().run(model, [HumanMessage("hi")], [], Post, CTX)


# ── T11 expected errors go to the model; infrastructure errors fail the turn ──


async def test_t11_not_found_is_returned_to_the_model_and_logged(caplog):
    retrieval = FakeRetrieval()
    retrieval.read_error = DocumentNotFoundError("gone")
    model = ScriptedChatModel(
        tool_call("read_document", {"document_id": str(DOC_A)}),
        tool_call("read_document", {"document_id": "not-a-uuid"}),
        tool_call("no_such_tool", {}),
        submit(content="recovered"),
    )
    with caplog.at_level(logging.WARNING):
        result = await runner().run(model, [HumanMessage("hi")], build_knowledge_tools(CTX, retrieval), Post, CTX)

    assert [c.error_code for c in result.calls] == ["not_found", "invalid_input", "unknown_tool"]
    errors = [json.loads(m.content)["error"] for m in model.calls[-1][2] if isinstance(m, ToolMessage)]
    assert errors == ["not_found", "invalid_input", "unknown_tool"]
    assert result.sources == ()
    warned = " ".join(r.getMessage() for r in caplog.records if r.levelno == logging.WARNING)
    assert "error_code=not_found" in warned and "error_code=unknown_tool" in warned


async def test_t11_bad_document_id_is_invalid_input():
    retrieval = FakeRetrieval()
    model = ScriptedChatModel(tool_call("read_document", {"document_id": "nope"}), submit(content="x"))
    result = await runner().run(model, [HumanMessage("hi")], build_knowledge_tools(CTX, retrieval), Post, CTX)
    assert result.calls[0].error_code == "invalid_input"


async def test_t11_argument_validation_error_is_invalid_input():
    model = ScriptedChatModel(tool_call("search_knowledge", {}), submit(content="x"))
    result = await runner().run(model, [HumanMessage("hi")], build_knowledge_tools(CTX, FakeRetrieval()), Post, CTX)
    assert result.calls[0].error_code == "invalid_input"


async def test_t11_infrastructure_error_is_raised():
    retrieval = FakeRetrieval()
    retrieval.read_error = ConnectionError("database down")
    model = ScriptedChatModel(tool_call("read_document", {"document_id": str(DOC_A)}), submit(content="x"))
    with pytest.raises(ConnectionError):
        await runner().run(model, [HumanMessage("hi")], build_knowledge_tools(CTX, retrieval), Post, CTX)


async def test_tool_timeout_is_raised():
    import asyncio

    retrieval = FakeRetrieval()

    async def slow(*_):
        await asyncio.sleep(1)

    retrieval.search = slow
    model = ScriptedChatModel(tool_call("search_knowledge", {"query": "a"}), submit(content="x"))
    with pytest.raises(TimeoutError):
        await ToolCallingRunner(max_rounds=4, max_calls=4, tool_timeout_s=0.05).run(
            model, [HumanMessage("hi")], build_knowledge_tools(CTX, retrieval), Post, CTX
        )


async def test_reply_without_any_tool_call_fails_loud():
    from langchain_core.messages import AIMessage

    model = ScriptedChatModel(AIMessage(content="just text"))
    with pytest.raises(ToolLoopInvalidOutputError):
        await runner().run(model, [HumanMessage("hi")], [], Post, CTX)


async def test_calls_over_the_turn_limit_get_a_call_limit_result():
    from langchain_core.messages import AIMessage

    retrieval = FakeRetrieval()
    three = AIMessage(
        content="",
        tool_calls=[{"name": "search_knowledge", "args": {"query": q}, "id": f"c{q}"} for q in "abc"],
    )
    model = ScriptedChatModel(three, submit(content="x"))
    result = await runner(calls=2).run(model, [HumanMessage("hi")], build_knowledge_tools(CTX, retrieval), Post, CTX)
    assert [c.error_code for c in result.calls] == [None, None, "call_limit"]
    assert len(retrieval.users) == 2  # the third never ran
