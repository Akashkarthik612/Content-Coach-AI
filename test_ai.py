r"""
Terminal test harness for the AI agent pipeline.
Run without starting the FastAPI server -- talks directly to the LangGraph graph.

Usage:
    # Interactive prompt
    venv\Scripts\python test_ai.py

    # Inline prompt
    venv\Scripts\python test_ai.py "What have I written about machine learning?"

    # With a specific user_id
    venv\Scripts\python test_ai.py --user <uuid> "Write a post about Python in my style"

Default user_id: 00000000-0000-0000-0000-000000000001 (stub seeded in migration 0003)
"""

import asyncio
import sys

from langchain_core.messages import HumanMessage
from langgraph.types import Command

from backend.ai.graph import assistant

STUB_USER_ID = "00000000-0000-0000-0000-000000000001"
SEP = "-" * 60


async def run(prompt: str, user_id: str) -> None:
    thread_id = "terminal-test-001"
    config    = {"configurable": {"thread_id": thread_id}}

    initial_state = {
        "query":           prompt,
        "user_id":         user_id,
        "messages":        [HumanMessage(content=prompt)],
        "task_type":       "",
        "route":           "",
        "draft":           "",
        "approval_status": "",
        "answer":          "",
    }

    print(f"\n{SEP}")
    print(f"  Query   : {prompt}")
    print(f"  User ID : {user_id}")
    print(f"{SEP}\n")

    state = await assistant.ainvoke(initial_state, config=config)

    # ── Detect HITL interrupt (write path) ────────────────────────────────────
    if state.get("draft") and not state.get("answer"):
        print(f"\n+-- DRAFT READY FOR REVIEW {'-'*34}")
        print(state["draft"])
        print(f"+{'-'*59}\n")

        raw = input("  [A]pprove / [E]dit / [R]eject  -> ").strip().lower()

        if raw.startswith("a"):
            resume_payload = {"action": "approved"}
        elif raw.startswith("e"):
            print("  Paste your edited version (press Enter twice when done):")
            lines, blank = [], 0
            while blank < 1:
                line = input()
                if line == "":
                    blank += 1
                else:
                    blank = 0
                    lines.append(line)
            resume_payload = {"action": "edited", "content": "\n".join(lines)}
        else:
            resume_payload = {"action": "rejected"}

        state = await assistant.ainvoke(Command(resume=resume_payload), config=config)

    # ── Print results ─────────────────────────────────────────────────────────
    print(f"\n{SEP}")
    print(f"  task_type      : {state.get('task_type') or '--'}")
    print(f"  approval_status: {state.get('approval_status') or '--'}")
    print(SEP)
    print(state.get("answer") or "(no answer in state)")
    print(SEP)


def main() -> None:
    args    = sys.argv[1:]
    user_id = STUB_USER_ID

    if "--user" in args:
        idx     = args.index("--user")
        user_id = args[idx + 1]
        args    = args[:idx] + args[idx + 2:]

    prompt = " ".join(args).strip() or input("  Enter your prompt: ").strip()
    if not prompt:
        print("No prompt provided.")
        sys.exit(1)

    asyncio.run(run(prompt, user_id))


if __name__ == "__main__":
    main()
