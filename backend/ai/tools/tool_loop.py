"""The shared tool-calling loop (Day_7.md §5.4, D7-D3/D4/D5/D14).

The agent's output schema becomes one more tool, `submit_post`: the model
calls it to hand back the finished post, and its arguments are validated
against the schema. Every round binds the tools with tool_choice="any", so
each reply is either a lookup or the submission.

The loop runs on a local message list: tool calls and results never reach the
caller's state or checkpoint, only the validated output and the sources do.

Knows nothing about knowledge or prompts. Tools report what they returned
through a ToolOutcome artifact; limits are injected by the caller.
"""

import asyncio
import json
import logging
from collections.abc import Sequence
from typing import TypeVar

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, ToolMessage
from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, ValidationError

from backend.ai.tools.context import ToolContext
from backend.ai.tools.records import SourceRef, ToolCallRecord, ToolLoopResult, ToolOutcome

logger = logging.getLogger(__name__)

SUBMIT = "submit_post"

T = TypeVar("T", bound=BaseModel)


class ToolLoopInvalidOutputError(Exception):
    """The model's submission didn't match the output schema, or it replied
    without calling any tool. The turn fails (502); nothing is retried."""


def submit_tool(output_schema: type[BaseModel]) -> StructuredTool:
    """Declared to the model, never executed: the loop intercepts the call."""

    def _never_run(**_: object) -> None:
        raise RuntimeError("submit_post is handled by ToolCallingRunner, not executed")

    return StructuredTool.from_function(
        func=_never_run,
        name=SUBMIT,
        description=(
            "Hand back the finished post. Call it once, when the post is ready; its arguments are the post."
        ),
        args_schema=output_schema,
    )


class ToolCallingRunner:
    def __init__(self, max_rounds: int, max_calls: int, tool_timeout_s: float) -> None:
        self._max_rounds = max_rounds
        self._max_calls = max_calls  # per turn; bounds the time tools can take
        self._tool_timeout_s = tool_timeout_s

    async def run(
        self,
        llm: BaseChatModel,
        messages: Sequence[AnyMessage],
        tools: Sequence[BaseTool],
        output_schema: type[T],
        ctx: ToolContext,
    ) -> ToolLoopResult[T]:
        submit = submit_tool(output_schema)
        by_name: dict[str, BaseTool] = {t.name: t for t in tools}
        bound = llm.bind_tools([*tools, submit], tool_choice="any")
        local: list[AnyMessage] = list(messages)
        sources: dict[object, SourceRef] = {}  # document_id -> ref; insertion order = first seen
        calls: list[ToolCallRecord] = []

        for round_no in range(1, self._max_rounds + 1):
            reply: AIMessage = await bound.ainvoke(local)
            submission = _submission(reply)
            if submission is not None:
                return self._finish(output_schema, submission, sources, calls, round_no, False, ctx)
            if not reply.tool_calls:
                raise ToolLoopInvalidOutputError("model replied without calling a tool")

            local.append(reply)
            for call in reply.tool_calls:  # in order, one at a time (D7-D14)
                if len(calls) >= self._max_calls:
                    message, outcome = _error_result(
                        call, "call_limit", "tool call limit reached for this turn; call submit_post now", ctx
                    )
                else:
                    message, outcome = await self._execute(by_name, call, ctx)
                local.append(message)
                calls.append(
                    ToolCallRecord(
                        name=call["name"],
                        ok=outcome.error_code is None,
                        error_code=outcome.error_code,
                        result_count=outcome.result_count,
                    )
                )
                for ref in outcome.sources:
                    sources.setdefault(ref.document_id, ref)

        # Approved fallback (D7-D4): the model used every lookup round without
        # submitting. One more call where submit_post is the only tool.
        logger.warning(
            "agent.tool_loop round cap reached agent=%s user_id=%s correlation_id=%s rounds=%d; forcing submit",
            ctx.agent,
            ctx.user_id,
            ctx.correlation_id,
            self._max_rounds,
        )
        reply = await llm.bind_tools([submit], tool_choice="any").ainvoke(local)
        submission = _submission(reply)
        if submission is None:
            raise ToolLoopInvalidOutputError("model did not submit a post on the forced round")
        return self._finish(output_schema, submission, sources, calls, self._max_rounds + 1, True, ctx)

    async def _execute(
        self, by_name: dict[str, BaseTool], call: dict, ctx: ToolContext
    ) -> tuple[ToolMessage, ToolOutcome]:
        """Model mistakes (unknown tool, bad arguments) come back to it as an
        error result. A timeout or any other exception fails the turn."""
        tool = by_name.get(call["name"])
        if tool is None:
            return _error_result(call, "unknown_tool", f"there is no tool named {call['name']!r}", ctx)
        try:
            message = await asyncio.wait_for(tool.ainvoke(call), self._tool_timeout_s)
        except ValidationError as exc:
            return _error_result(call, "invalid_input", _first_error(exc), ctx)
        except TimeoutError:
            logger.warning(
                "agent.tool_timeout tool=%s agent=%s user_id=%s correlation_id=%s timeout_s=%s",
                call["name"],
                ctx.agent,
                ctx.user_id,
                ctx.correlation_id,
                self._tool_timeout_s,
            )
            raise
        outcome = message.artifact if isinstance(message.artifact, ToolOutcome) else ToolOutcome()
        return message, outcome

    @staticmethod
    def _finish(
        output_schema: type[T],
        args: dict,
        sources: dict[object, SourceRef],
        calls: list[ToolCallRecord],
        rounds: int,
        forced: bool,
        ctx: ToolContext,
    ) -> ToolLoopResult[T]:
        try:
            output = output_schema.model_validate(args)
        except ValidationError as exc:
            logger.warning(
                "agent.tool_loop invalid submission agent=%s user_id=%s correlation_id=%s error=%s",
                ctx.agent,
                ctx.user_id,
                ctx.correlation_id,
                _first_error(exc),
            )
            raise ToolLoopInvalidOutputError(f"submit_post arguments invalid: {_first_error(exc)}") from exc

        fields = {
            "agent": ctx.agent,
            "user_id": ctx.user_id,
            "correlation_id": ctx.correlation_id,
            "rounds": rounds,
            "calls": len(calls),
            "tools_used": ",".join(c.name for c in calls) or "none",
            "forced_submit": forced,
            "sources_count": len(sources),
        }
        logger.log(
            logging.WARNING if forced else logging.INFO,
            "agent.tool_loop %s",
            " ".join(f"{k}={v}" for k, v in fields.items()),
            extra=fields,
        )
        return ToolLoopResult(
            output=output,
            sources=tuple(sources.values()),
            calls=tuple(calls),
            rounds=rounds,
            forced_submit=forced,
        )


def _submission(reply: AIMessage) -> dict | None:
    """submit_post's arguments if the model called it. A submission ends the
    turn even if the same reply also asked for lookups."""
    for call in reply.tool_calls:
        if call["name"] == SUBMIT:
            return call["args"]
    return None


def _error_result(call: dict, code: str, message: str, ctx: ToolContext) -> tuple[ToolMessage, ToolOutcome]:
    logger.warning(
        "agent.tool_error tool=%s error_code=%s agent=%s user_id=%s correlation_id=%s",
        call["name"],
        code,
        ctx.agent,
        ctx.user_id,
        ctx.correlation_id,
    )
    content = json.dumps({"error": code, "message": message})
    return ToolMessage(content=content, tool_call_id=call["id"], name=call["name"]), ToolOutcome(error_code=code)


def _first_error(exc: ValidationError) -> str:
    err = exc.errors()[0]
    where = ".".join(str(p) for p in err.get("loc", ())) or "input"
    return f"{where}: {err.get('msg', 'invalid')}"
