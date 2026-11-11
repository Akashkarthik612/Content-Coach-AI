"""Bounded LangGraph launch coordinator, durable handoffs and a genuine review interrupt.

The graph shares immutable agent definitions and the existing RAG/tool loop with chat.
Postgres checkpoints retain business context; run/step records contain reviewable outputs
and metadata. Raw documents and prompts are never written to execution-step logs.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import TypedDict
from uuid import UUID, uuid4

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt
from langsmith import tracing_context
from sqlalchemy import select

from backend.agents.models import AgentConfiguration
from backend.workspaces.models import WorkflowReview, WorkflowRun, WorkflowStep
from backend.workspaces.runtime import JOB_STALE_SECONDS, database, error_code, execute_agent
from backend.workspaces.schemas import Deliverable, ProductFacts
from backend.workspaces.service import fail, get_agent, member, version_for

logger = logging.getLogger(__name__)
MAX_REVISIONS = 3
SPECIALISTS = ("product", "marketing", "support")


class WorkflowState(TypedDict, total=False):
    run_id: str
    workspace_id: str
    employee_id: str
    request: str
    agents: dict[str, dict]
    plan: list[dict]
    product: dict
    marketing: dict
    support: dict
    issues: list[str]
    sources: list[dict]
    revision: int
    feedback: str
    review_action: str
    previous_deliverables: dict


def graph_config(run_id, attempt_id=None):
    return {
        "configurable": {
            "thread_id": f"workspace-workflow:{run_id}",
            "attempt_id": str(attempt_id) if attempt_id else "",
        },
        "recursion_limit": 40,
    }


def get_run(db, workspace_id, run_id, lock=False):
    query = select(WorkflowRun).where(WorkflowRun.id == run_id, WorkflowRun.workspace_id == workspace_id)
    row = db.scalar(query.with_for_update() if lock else query)
    if row is None:
        fail(404, "workflow_not_found")
    return row


def expire_run(db, row):
    if row.status in ("queued", "running") and row.heartbeat_at < datetime.now(UTC) - timedelta(
        seconds=JOB_STALE_SECONDS
    ):
        # A poll must not overwrite a heartbeat/review committed after its initial read.
        row = db.scalar(
            select(WorkflowRun)
            .where(WorkflowRun.id == row.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if row.status not in ("queued", "running") or row.heartbeat_at >= datetime.now(UTC) - timedelta(
            seconds=JOB_STALE_SECONDS
        ):
            return
        row.status, row.error_code, row.finished_at = "failed", "stale_job", datetime.now(UTC)
        db.add(
            WorkflowStep(
                run_id=row.id,
                revision=row.revision,
                event="coordinator_failed",
                details={"error_code": "stale_job"},
            )
        )


def start_run(db, workspace_id, user_id, request):
    member(db, workspace_id, user_id)
    assignments = {}
    for role in SPECIALISTS:
        if request.agents:
            agent = get_agent(db, workspace_id, request.agents[role])
            if agent.workflow_role != role:
                fail(422, "agent_specialist_role_mismatch")
        else:
            rows = db.scalars(
                select(AgentConfiguration).where(
                    AgentConfiguration.workspace_id == workspace_id,
                    AgentConfiguration.workflow_role == role,
                    AgentConfiguration.archived_at.is_(None),
                )
            ).all()
            if len(rows) != 1:
                fail(422, f"select_one_{role}_agent")
            agent = rows[0]
        version = version_for(db, agent)
        if not agent.enabled_tools or not (agent.source_ids or agent.document_ids):
            fail(422, f"configure_{role}_knowledge")
        assignments[role] = {
            "id": str(agent.id),
            "version_id": str(version.id),
            "version": agent.version,
            "handle": agent.handle,
            "name": agent.name,
        }
    run = WorkflowRun(
        workspace_id=workspace_id,
        initiated_by=user_id,
        request=request.request,
        agents=assignments,
        attempt_id=uuid4(),
        status="queued",
    )
    db.add(run)
    db.flush()
    return run.id, run.attempt_id


def record_step(db, run_id, attempt_id, revision, event, details, state=None):
    run = db.scalar(select(WorkflowRun).where(WorkflowRun.id == run_id).with_for_update())
    if not run or run.attempt_id != attempt_id or run.status not in ("queued", "running"):
        fail(409, "workflow_attempt_expired")
    member(db, run.workspace_id, run.initiated_by)
    run.heartbeat_at = datetime.now(UTC)
    payload = dict(details)
    agent_id = payload.pop("agent_id", None)
    version = payload.pop("agent_version", None)
    tool = payload.pop("tool_name", None)
    db.add(
        WorkflowStep(
            run_id=run.id,
            revision=revision,
            event=event,
            agent_id=UUID(agent_id) if agent_id else None,
            agent_version=version,
            tool_name=tool,
            details=payload,
        )
    )
    if state is not None:
        run.state = state
        run.revision = state.get("revision", run.revision)


def build_workflow_graph(checkpointer, knowledge):
    async def emit(state, config, event, details, snapshot=None):
        await database(
            record_step,
            UUID(state["run_id"]),
            UUID(config["configurable"]["attempt_id"]),
            state.get("revision", 0),
            event,
            details,
            snapshot,
        )

    async def plan(state: WorkflowState, config: RunnableConfig):
        # This launch workflow requires three capabilities. Resolve actual configured identities,
        # rather than manufacturing agent names or permitting arbitrary recursive delegation.
        tasks = [
            {
                "role": role,
                "agent": state["agents"][role],
                "depends_on": [] if role == "product" else ["product"],
            }
            for role in SPECIALISTS
        ]
        await emit(state, config, "coordinator_started", {"specialists": list(SPECIALISTS)})
        return {"plan": tasks}

    async def specialist(state, config, role, schema):
        assignment = state["agents"][role]

        async def on_event(event, data):
            await emit(state, config, event, {"role": role, **data})

        handoff = {}

        def context(allowed):
            import json

            instruction = "Extract product facts from authorized company documents. Every fact needs retrieved document IDs."
            if role != "product":
                product = state["product"]
                facts = [
                    fact
                    for fact in product.get("facts", [])
                    if {UUID(v) for v in fact["document_ids"]} <= allowed
                ]
                ids = {v for fact in facts for v in fact["document_ids"]}
                refs = [s for s in product.get("sources", []) if s["document_id"] in ids]
                handoff.update(
                    {
                        "facts": facts,
                        "sources": refs,
                        "missing": product.get("missing", []),
                        "contradictions": product.get("contradictions", []),
                    }
                )
                if len(facts) < len(product.get("facts", [])):
                    handoff["missing"] = [
                        *handoff["missing"],
                        "Some product facts are outside this specialist's knowledge permissions.",
                    ]
                instruction = (
                    "Write a launch announcement using these source-checked product facts and authorized brand guidelines."
                    if role == "marketing"
                    else "Prepare customer FAQs using these source-checked facts and authorized support policies. Identify unresolved questions."
                )
                instruction += " Do not present missing or contradictory facts as confirmed. Retrieve additional permitted knowledge if needed."
            # Carry previous deliverables only when their sources remain inside this specialist's grants.
            previous = state.get("previous_deliverables", {}).get(role)
            if previous and not {UUID(s["document_id"]) for s in previous.get("sources", [])} <= allowed:
                previous = None
            data = {
                "business_request": state["request"],
                "task": instruction,
                "product_handoff": handoff,
                "revision_feedback": state.get("feedback", ""),
                "previous_deliverable": previous,
            }
            return [HumanMessage(json.dumps(data, ensure_ascii=False))]

        output = await execute_agent(
            knowledge,
            UUID(state["workspace_id"]),
            UUID(state["employee_id"]),
            UUID(assignment["version_id"]),
            [],
            on_event,
            schema,
            context_builder=context,
        )
        output["revision"] = state.get("revision", 0)
        if role == "product":
            # A model-supplied identifier is never accepted as a citation without an actual tool result.
            retrieved = {s["document_id"] for s in output["sources"]}
            verified = [f for f in output["facts"] if set(f["document_ids"]) <= retrieved]
            if len(verified) != len(output["facts"]):
                output["missing"].append(
                    "Facts with unverified document references were excluded from the handoff."
                )
            output["facts"] = verified
            if not verified:
                output["missing"].append(
                    "No source-backed product facts were found; downstream drafts require review."
                )
            await emit(
                state,
                config,
                "handoff_validated",
                {"fact_count": len(verified), "sources": output["sources"]},
            )
        else:
            # Include only real refs supplied in this authorized handoff or this turn's tools.
            refs = {s["document_id"]: s for s in [*handoff.get("sources", []), *output["sources"]]}
            output["sources"] = list(refs.values())
            output["handoff"] = handoff
        snapshot = {**state, role: output}
        await emit(state, config, "deliverable_saved", {"role": role, "sources": output["sources"]}, snapshot)
        return {role: output}

    async def product(state: WorkflowState, config: RunnableConfig):
        return await specialist(state, config, "product", ProductFacts)

    async def marketing(state: WorkflowState, config: RunnableConfig):
        return await specialist(state, config, "marketing", Deliverable)

    async def support(state: WorkflowState, config: RunnableConfig):
        return await specialist(state, config, "support", Deliverable)

    async def aggregate(state: WorkflowState, config: RunnableConfig):
        issues = []
        sources = {}
        for role in SPECIALISTS:
            for label in ("missing", "contradictions"):
                issues.extend(f"{role}: {item}" for item in state[role].get(label, []))
            for source in state[role].get("sources", []):
                sources[source["document_id"]] = source
        result = {"issues": list(dict.fromkeys(issues)), "sources": list(sources.values())}
        await emit(
            state,
            config,
            "coordinator_completed",
            {"issue_count": len(result["issues"]), "sources": result["sources"]},
            {**state, **result},
        )
        return result

    def review(state: WorkflowState):
        decision = interrupt(
            {
                "run_id": state["run_id"],
                "revision": state.get("revision", 0),
                "actions": ["approve", "request_changes", "reject"],
            }
        )
        if decision["action"] == "request_changes":
            if state.get("revision", 0) >= MAX_REVISIONS:
                raise ValueError("revision_limit")
            return {
                "review_action": "request_changes",
                "feedback": decision["feedback"],
                "revision": state.get("revision", 0) + 1,
                "issues": [],
                "sources": [],
                "previous_deliverables": {role: state[role] for role in SPECIALISTS},
            }
        return {"review_action": decision["action"]}

    graph = StateGraph(WorkflowState)
    for name, node in (
        ("coordinator_plan", plan),
        ("product_agent", product),
        ("marketing_agent", marketing),
        ("support_agent", support),
        ("aggregate", aggregate),
        ("human_review", review),
    ):
        graph.add_node(name, node)
    graph.add_edge(START, "coordinator_plan")
    graph.add_edge("coordinator_plan", "product_agent")
    graph.add_edge("product_agent", "marketing_agent")
    graph.add_edge("marketing_agent", "support_agent")
    graph.add_edge("support_agent", "aggregate")
    graph.add_edge("aggregate", "human_review")
    graph.add_conditional_edges(
        "human_review",
        lambda s: "revise" if s.get("review_action") == "request_changes" else "done",
        {"revise": "product_agent", "done": END},
    )
    return graph.compile(checkpointer=checkpointer)


def _begin(db, run_id, attempt_id):
    run = db.scalar(select(WorkflowRun).where(WorkflowRun.id == run_id).with_for_update())
    if not run or run.attempt_id != attempt_id or run.status != "queued":
        return None
    member(db, run.workspace_id, run.initiated_by)
    run.status, run.heartbeat_at, run.finished_at = "running", datetime.now(UTC), None
    run.started_at = run.started_at or datetime.now(UTC)
    return {
        "run_id": str(run.id),
        "workspace_id": str(run.workspace_id),
        "employee_id": str(run.initiated_by),
        "request": run.request,
        "agents": run.agents,
        "revision": 0,
    }


def _complete(db, run_id, attempt_id, result):
    run = db.scalar(select(WorkflowRun).where(WorkflowRun.id == run_id).with_for_update())
    if not run or run.attempt_id != attempt_id or run.status != "running":
        return
    pending = bool(result.get("__interrupt__"))
    run.state = {k: v for k, v in result.items() if k != "__interrupt__"}
    run.revision = result.get("revision", run.revision)
    run.status = (
        "awaiting_review"
        if pending
        else ("approved" if result.get("review_action") == "approve" else "rejected")
    )
    run.heartbeat_at, run.error_code = datetime.now(UTC), None
    if not pending:
        run.finished_at = datetime.now(UTC)
    db.add(
        WorkflowStep(
            run_id=run.id,
            revision=run.revision,
            event="awaiting_human_review" if pending else f"workflow_{run.status}",
            details={},
        )
    )


def _failed(db, run_id, attempt_id, code):
    run = db.scalar(select(WorkflowRun).where(WorkflowRun.id == run_id).with_for_update())
    if run and run.attempt_id == attempt_id and run.status in ("queued", "running"):
        run.status, run.error_code, run.finished_at = "failed", code, datetime.now(UTC)
        db.add(
            WorkflowStep(
                run_id=run.id, revision=run.revision, event="coordinator_failed", details={"error_code": code}
            )
        )


async def run_workflow(graph, run_id, attempt_id, decision=None, retry=False):
    try:
        initial = await database(_begin, run_id, attempt_id)
        if initial is None:
            return
        config = graph_config(run_id, attempt_id)
        with tracing_context(enabled=False):
            snapshot = await graph.aget_state(config)
            if decision is not None:
                value = Command(resume=decision)
            elif retry and snapshot.values:
                interrupted = any(task.interrupts for task in snapshot.tasks)
                if snapshot.next == ("human_review",) and interrupted:
                    # A review may have committed just before its background task/process died.
                    saved = await database(_saved_review, run_id, snapshot.values.get("revision", 0))
                    if saved:
                        value = Command(resume=saved)
                    else:
                        result = {**snapshot.values, "__interrupt__": True}
                        await database(_complete, run_id, attempt_id, result)
                        return
                else:
                    value = None
            else:
                value = initial
            result = await graph.ainvoke(value, config)
        await database(_complete, run_id, attempt_id, result)
    except Exception as exc:  # noqa: BLE001 - background boundary persists a sanitized failure state
        logger.warning("workspace_workflow_failed run_id=%s error_code=%s", run_id, error_code(exc))
        await database(_failed, run_id, attempt_id, error_code(exc))


def _saved_review(db, run_id, revision):
    row = db.scalar(
        select(WorkflowReview).where(WorkflowReview.run_id == run_id, WorkflowReview.revision == revision)
    )
    return {"action": row.action, "feedback": row.feedback} if row else None


def review_run(db, workspace_id, user_id, run_id, request):
    member(db, workspace_id, user_id)
    run = get_run(db, workspace_id, run_id, lock=True)
    if run.status != "awaiting_review" or run.revision != request.expected_revision:
        fail(409, "workflow_review_conflict")
    if request.action == "request_changes" and run.revision >= MAX_REVISIONS:
        fail(409, "workflow_revision_limit")
    # Any workspace member can act as reviewer in this demo; membership is checked server-side.
    db.add(
        WorkflowReview(
            run_id=run.id,
            revision=run.revision,
            reviewed_by=user_id,
            action=request.action,
            feedback=request.feedback.strip(),
        )
    )
    if request.action == "request_changes":
        run.revision += 1
    run.status, run.attempt_id, run.error_code = "queued", uuid4(), None
    run.heartbeat_at = datetime.now(UTC)
    return run.attempt_id


def retry_run(db, workspace_id, user_id, run_id):
    member(db, workspace_id, user_id)
    run = get_run(db, workspace_id, run_id, lock=True)
    expire_run(db, run)
    if run.status != "failed":
        fail(409, "workflow_not_failed")
    # Keep the initiating employee and pinned versions. Do not transfer source permissions to a retrier.
    member(db, workspace_id, run.initiated_by)
    run.status, run.error_code, run.attempt_id = "queued", None, uuid4()
    run.heartbeat_at = datetime.now(UTC)
    return run.attempt_id
