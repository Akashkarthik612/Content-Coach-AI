"""Knowledge tools wired into the three agents, with fakes only (Day_7.md T13,
plus G1: the model-facing schemas never carry server-side `sources`)."""

import json
import uuid

import pytest
from langchain_core.messages import HumanMessage
from langchain_core.utils.function_calling import convert_to_openai_tool

from backend import main
from backend.ai.independent_agents import linkedin, reddit, x
from backend.ai.tools.access import KnowledgeAccess
from backend.ai.tools.tool_loop import ToolCallingRunner, submit_tool
from backend.core.config import settings
from backend.knowledge.records import ChunkSnippet, DocumentHits
from tests.fakes import ScriptedChatModel, submit, tool_call

USER = uuid.uuid4()
DOC = uuid.uuid4()


class OneDocRetrieval:
    async def search(self, user_id, query):
        assert user_id == USER
        return [DocumentHits(DOC, "Q3 plan", "https://doc", (ChunkSnippet(None, "40 pilot teams"),))]

    async def has_sources(self, user_id):
        return True


def access() -> KnowledgeAccess:
    return KnowledgeAccess(OneDocRetrieval(), ToolCallingRunner(max_rounds=4, max_calls=4, tool_timeout_s=5))


# ── T13 kill switch ───────────────────────────────────────────────────────────


def test_t13_kill_switch_builds_no_tools(monkeypatch):
    monkeypatch.setattr(settings, "KNOWLEDGE_TOOLS_ENABLED", False)
    assert main.build_knowledge_access() is None
    monkeypatch.setattr(settings, "KNOWLEDGE_TOOLS_ENABLED", True)
    assert isinstance(main.build_knowledge_access(), KnowledgeAccess)


async def test_t13_linkedin_without_knowledge_makes_one_structured_call(monkeypatch):
    model = ScriptedChatModel()  # no scripted tool replies: any bind_tools call would fail
    monkeypatch.setattr(linkedin, "_chat_model", lambda: model)
    monkeypatch.setattr(linkedin, "_structured_llm", lambda: model.with_structured_output(linkedin.LinkedInPost))

    out = await linkedin.generate({"messages": [HumanMessage("hi")], "user_id": str(USER)}, None, None)

    assert model.calls == [] and len(model.structured.calls) == 1
    assert "<knowledge_tools>" not in model.structured.calls[0][0].content
    assert out["messages"][0].additional_kwargs["sources"] == []


# ── tools on: each agent runs the loop and returns sources ───────────────────


async def test_linkedin_turn_with_tools_returns_one_message_with_sources(monkeypatch):
    model = ScriptedChatModel(tool_call("search_knowledge", {"query": "pilots"}), submit(content="40 pilot teams."))
    monkeypatch.setattr(linkedin, "_chat_model", lambda: model)

    out = await linkedin.generate(
        {"messages": [HumanMessage("post about the pilot")], "user_id": str(USER)},
        {"configurable": {"thread_id": "t-1"}},
        access(),
    )

    (message,) = out["messages"]
    assert message.content == "40 pilot teams."
    assert message.additional_kwargs["sources"] == [{"document_id": str(DOC), "title": "Q3 plan", "url": "https://doc"}]
    assert "<knowledge_tools>" in model.calls[0][2][0].content


@pytest.mark.parametrize(
    ("module", "agent", "request_", "post"),
    [
        (reddit, reddit.RedditAgent, reddit.RedditPostRequest(topic="pilot"),
         {"title": "t", "content": "c", "suggested_subreddit": "saas", "note": "check rules"}),
        (x, x.XAgent, x.XPostRequest(topic="pilot"), {"posts": ["40 pilot teams."], "note": None}),
    ],
    ids=["reddit", "x"],
)
async def test_stateless_agents_run_the_loop_and_return_sources(monkeypatch, module, agent, request_, post):
    model = ScriptedChatModel(tool_call("search_knowledge", {"query": "pilot"}), submit(**post))
    monkeypatch.setattr(module, "ChatGoogleGenerativeAI", lambda **_: model)

    draft = await agent.run(request_, USER, knowledge=access())

    assert [s.document_id for s in draft.sources] == [DOC]
    assert draft.model_dump(exclude={"sources"}) == post


@pytest.mark.parametrize(
    "schema", [linkedin.LinkedInPost, reddit.RedditPostResponse, x.XPostResponse], ids=lambda s: s.__name__
)
def test_g1_submit_post_schema_has_no_sources_field(schema):
    declared = convert_to_openai_tool(submit_tool(schema))
    assert declared["function"]["name"] == "submit_post"
    assert "sources" not in json.dumps(declared["function"]["parameters"])
