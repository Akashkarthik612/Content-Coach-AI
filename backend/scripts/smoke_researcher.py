"""
Manual smoke test for researcher_linkedin + expand_research_angle.
Runs live against Gemini + Tavily (+ real DB for the vault-search path), so
TAVILY_API_KEY and LANGCHAIN_API_KEY_GEMINI must be set in .env before running.

Run from the project root:
    python -m backend.scripts.smoke_researcher "your topic query" --user-id <uuid>
"""
import argparse
import asyncio
import sys

from backend.core.config import settings


async def run(query: str, user_id: str) -> None:
    from backend.ai.agents.researcher import ResearchArtifactParser, expand_research_angle, researcher_linkedin

    result = await researcher_linkedin({"user_id": user_id, "query": query})
    angles = ResearchArtifactParser.to_wire_dicts(result["research_artifact"])
    search_context = result["research_search_context"]

    print(f"\n=== {len(angles)} angles ===\n")
    for i, angle in enumerate(angles, 1):
        print(f"[{i}] {angle['title']}")
        print(f"    argument: {angle['argument']}")
        print(f"    audience: {angle['audience']}")
        print(f"    provokes: {angle['provokes_type']} — {angle['provokes_reason']}")
        print()

    print("=== Expand angle [1] ===\n")
    summary = await expand_research_angle(angles[0], search_context)
    print(summary)


if __name__ == "__main__":
    if not settings.TAVILY_API_KEY:
        print("FAILED: TAVILY_API_KEY is not set in .env — cannot run a live smoke test.")
        sys.exit(1)

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", type=str, help="Topic query to research")
    parser.add_argument(
        "--user-id", type=str,
        default="00000000-0000-0000-0000-000000000001",
        help="user_id to scope search_vault_posts to (defaults to the seeded stub user)",
    )
    args = parser.parse_args()

    try:
        asyncio.run(run(args.query, args.user_id))
    except Exception as exc:
        print(f"FAILED: {exc}")
        sys.exit(1)
