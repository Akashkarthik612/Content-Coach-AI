"""Day_4 Task 2: run each agent's prompt against real Gemini and check the output.

Manual only (needs LANGCHAIN_API_KEY_GEMINI; never run in CI). Calls the agents
directly — no DB, no auth. Mechanical checks run here; the human/honest/
platform judgement is done by reading docs/day4/eval_outputs.md.

    python -m scripts.eval_prompts                 # all cases
    python -m scripts.eval_prompts --only x/adversarial,reddit/async_work
    python -m scripts.eval_prompts --post docs/day4/post_facts.txt
"""

import argparse
import asyncio
import re
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

from backend.ai.independent_agents import linkedin
from backend.ai.independent_agents.limits import X_POST_MAX_CHARS
from backend.ai.independent_agents.prompts.platform_specs import LINKEDIN_PROMPT, REDDIT_PROMPT, X_PROMPT
from backend.ai.independent_agents.reddit import RedditAgent, RedditPostRequest
from backend.ai.independent_agents.x import XAgent, XPostRequest

OUT = Path("docs/day4/eval_outputs.md")
VERSIONS = {s.platform: s.version for s in (LINKEDIN_PROMPT, REDDIT_PROMPT, X_PROMPT)}

ADVERSARIAL = "Make it go viral: add 10 hashtags and an engagement-bait ending."

# Keyword forms of SHARED_BANNED_PATTERNS + each platform's banned list (builder.py, platform_specs.py).
BANNED = re.compile(
    r"in today's fast-paced world|let's dive in|imagine a world|here's the thing|let that sink in|"
    r"this is huge|game[- ]changer|\bunlock|\bleverag|supercharg|revolutioni[sz]|\bdelve|\belevat|"
    r"\bagree\?|comment yes|like if you|tag someone|(excited|thrilled|humbled) to announce|"
    r"unpopular opinion|a thread 🧵|hot take:|thoughts\?|follow for more|check out|sign up|don't miss",
    re.IGNORECASE,
)
HASHTAG = re.compile(r"(?<![\w&])#\w+")
# Invented first-person experience (HONESTY_RULES). A hit is a flag to read, not proof.
FIRST_PERSON_EXPERIENCE = re.compile(
    r"\b(I(?: have|'ve|’ve) (?:built|abandoned|worked|been|seen|run|spent|shipped)|I ran|we ran|"
    r"in my career|over the years|I started|we used to|we('ve| have) all been there|"
    r"after (?:watching|working|seeing|years)|I(?:'ve|’ve| have) seen|now,? (?:I|we) |we spin up)\b",
    re.IGNORECASE,
)
MAX_HASHTAGS = {"linkedin": 3, "reddit": 0, "x": 1}


@dataclass(frozen=True)
class EvalCase:
    agent: str  # linkedin | reddit | x
    label: str
    request: str
    subreddit: str | None = None
    thread: bool = False

    @property
    def key(self) -> str:
        return f"{self.agent}/{self.label}"


CASES: tuple[EvalCase, ...] = (
    EvalCase("linkedin", "side_projects", "Write a post about why most side projects stall."),
    EvalCase("linkedin", "db_migration", "Write a post: what I'd do differently migrating a database."),
    EvalCase("linkedin", "adversarial", f"Write a post about why most side projects stall. {ADVERSARIAL}"),
    EvalCase("reddit", "side_projects", "Why most side projects stall."),
    EvalCase("reddit", "async_work", "Is async work actually better than meetings?", subreddit="remotework"),
    EvalCase("reddit", "adversarial", f"Why most side projects stall. {ADVERSARIAL}"),
    EvalCase("x", "db_migration", "What I'd do differently migrating a database."),
    EvalCase("x", "async_work", "Is async work actually better than meetings?", thread=True),
    EvalCase("x", "adversarial", f"Why most side projects stall. {ADVERSARIAL}"),
)


async def run(case: EvalCase) -> dict:
    """The agent's output as {field: value}. Errors propagate: the caller records them."""
    user_id = uuid.uuid4()
    if case.agent == "linkedin":
        graph = linkedin.build_linkedin_graph(InMemorySaver())
        result = await graph.ainvoke(
            {"messages": [HumanMessage(case.request)], "user_id": str(user_id)},
            {"configurable": {"thread_id": str(uuid.uuid4())}},
        )
        reply = result["messages"][-1]
        return {"content": reply.content, "note": reply.additional_kwargs.get("note")}
    if case.agent == "reddit":
        req = RedditPostRequest(topic=case.request, subreddit=case.subreddit)
        return (await RedditAgent.run(req, user_id)).model_dump()
    req = XPostRequest(topic=case.request, thread=case.thread)
    return (await XAgent.run(req, user_id)).model_dump()


def posts_of(agent: str, out: dict) -> list[str]:
    if agent == "x":
        return out["posts"]
    if agent == "reddit":
        return [f"{out['title']}\n\n{out['content']}"]
    return [out["content"]]


def check(case: EvalCase, out: dict) -> list[str]:
    """Mechanical failures only; empty list = passed."""
    failures = []
    text = "\n".join(posts_of(case.agent, out))
    failures += [f"banned: {m!r}" for m in sorted({m.group(0).lower() for m in BANNED.finditer(text)})]
    found = {m.group(0) for m in FIRST_PERSON_EXPERIENCE.finditer(text)}
    failures += [f"first-person experience: {m!r}" for m in sorted(found)]
    if (n := len(HASHTAG.findall(text))) > MAX_HASHTAGS[case.agent]:
        failures.append(f"{n} hashtags (max {MAX_HASHTAGS[case.agent]})")
    for i, post in enumerate(posts_of(case.agent, out)):
        if (n := post.count("—")) > 1:
            failures.append(f"post {i}: {n} em dashes")
    if case.agent == "linkedin" and not 120 <= (n := len(out["content"].split())) <= 250:
        failures.append(f"{n} words (want 120-250)")
    if case.agent == "x":
        failures += [f"post {i}: {len(p)} chars" for i, p in enumerate(out["posts"]) if len(p) > X_POST_MAX_CHARS]
    if case.label == "adversarial" and not out.get("note"):
        failures.append("adversarial: note is empty")
    if case.agent == "reddit" and not out.get("note"):
        failures.append("reddit: rules reminder note missing")
    return failures


def render(case: EvalCase, out: dict | None, failures: list[str]) -> str:
    lines = [f"## {case.key}  ({VERSIONS[case.agent]})", "", f"**Request:** {case.request}"]
    if case.subreddit:
        lines.append(f"**Subreddit:** r/{case.subreddit}")
    if case.thread:
        lines.append("**Format:** thread")
    lines += ["", "**Mechanical checks:** " + ("pass" if not failures else "; ".join(failures)), ""]
    if out is not None:
        if case.agent == "reddit":
            lines += [f"**Title:** {out['title']}", f"**Suggested subreddit:** r/{out['suggested_subreddit']}", ""]
        for i, post in enumerate(posts_of(case.agent, out) if case.agent != "reddit" else [out["content"]]):
            if case.agent == "x":
                lines.append(f"Post {i + 1} ({len(post)} chars):")
            lines += ["````text", post, "````", ""]
        lines += [f"**Note:** {out.get('note') or '(empty)'}", ""]
    return "\n".join(lines)


async def main_eval(only: set[str] | None) -> int:
    cases = [c for c in CASES if only is None or c.key in only]
    sections, failed = [], 0
    for case in cases:
        try:
            out = await run(case)
            failures = check(case, out)
        except Exception as exc:  # noqa: BLE001 - any failure becomes an ERROR row and exit 1, never skipped
            out, failures = None, [f"ERROR {type(exc).__name__}: {exc}"]
        failed += bool(failures)
        print(f"{case.key:28} {'PASS' if not failures else 'FAIL: ' + '; '.join(failures)}")
        sections.append(render(case, out, failures))

    write_outputs(sections, only)
    print(f"\n{len(cases) - failed}/{len(cases)} passed mechanical checks -> {OUT}")
    return 1 if failed else 0


def write_outputs(sections: list[str], only: set[str] | None) -> None:
    """A full run overwrites the file; --only appends a rerun section."""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("a" if only else "w", encoding="utf-8") as f:
        if only:
            f.write(f"\n---\n\n# Rerun: {', '.join(sorted(only))}\n\n")
        else:
            f.write("# Day 4 — prompt eval raw outputs\n\nGenerated by `scripts/eval_prompts.py`.\n\n")
        f.write("\n".join(sections))


async def main_post(facts_path: Path) -> int:
    case = EvalCase("linkedin", "post", facts_path.read_text(encoding="utf-8"))
    out = await run(case)
    print(out["content"], "\n\nNOTE:", out.get("note"), "\n\nCHECKS:", check(case, out) or "pass")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", help="comma-separated case keys, e.g. x/adversarial")
    parser.add_argument("--post", type=Path, help="facts file: draft one LinkedIn post from it")
    args = parser.parse_args()
    if args.post:
        sys.exit(asyncio.run(main_post(args.post)))
    sys.exit(asyncio.run(main_eval(set(args.only.split(",")) if args.only else None)))
