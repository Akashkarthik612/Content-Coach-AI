"""A LinkedIn turn with knowledge tools on the real checkpointer and the real
retrieval service (Day_7.md T12, D7-D2): tool calls and results run on a local
message list, so the checkpoint keeps only the user's message and the post."""

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from backend.ai.independent_agents import linkedin
from backend.ai.tools.access import KnowledgeAccess
from backend.ai.tools.tool_loop import ToolCallingRunner
from backend.core.database import SessionLocal
from backend.knowledge.embedder import FakeEmbedder
from backend.knowledge.pipeline import IngestionPipeline
from backend.knowledge.records import FetchedDocument, FileMeta
from backend.knowledge.repository import KnowledgeRepository as Repo
from backend.knowledge.retrieval import KnowledgeRetrievalService
from tests.fakes import ScriptedChatModel, submit, tool_call

pytestmark = pytest.mark.integration


async def test_t12_checkpoint_holds_only_the_human_message_and_the_post(db, saver, make_user, monkeypatch):
    user = make_user()
    embedder = FakeEmbedder()
    source = Repo.create_source(db, user, "gdrive", "acct", "Drive", {"folder_ids": ["F"]})
    body = "# Pilot\nWe ship v2 to 40 pilot teams by Sept 30.\n"
    await IngestionPipeline(Repo, embedder).ingest(
        db, user, source.id,
        FetchedDocument(FileMeta("f1", "Q3 Launch Plan", "text/markdown"), body, "markdown"),
    )
    doc = Repo.get_document(db, user, source.id, "f1")

    model = ScriptedChatModel(
        tool_call("find_documents", {"title_query": "q3 launch"}),
        tool_call("read_document", {"document_id": str(doc.id)}),
        submit(content="Shipping v2 to 40 pilot teams.", note=None),
    )
    monkeypatch.setattr(linkedin, "_chat_model", lambda: model)
    knowledge = KnowledgeAccess(
        KnowledgeRetrievalService(Repo, embedder, SessionLocal, statement_timeout_s=20),
        ToolCallingRunner(max_rounds=4, max_calls=4, tool_timeout_s=20),
    )
    graph = linkedin.build_linkedin_graph(saver, knowledge)
    config = {"configurable": {"thread_id": "t-knowledge"}}

    await graph.ainvoke(
        {"messages": [HumanMessage("turn my Q3 launch plan into a post")], "user_id": str(user)},
        config,
        durability="exit",
    )

    # The model really read the document through the tools.
    read_result = model.calls[2][2][-1]
    assert "40 pilot teams" in read_result.content

    stored = (await graph.aget_state(config)).values["messages"]
    assert [type(m) for m in stored] == [HumanMessage, AIMessage]
    assert stored[1].content == "Shipping v2 to 40 pilot teams."
    assert stored[1].tool_calls == []
    assert stored[1].additional_kwargs["sources"] == [
        {"document_id": str(doc.id), "title": "Q3 Launch Plan", "url": None}
    ]
