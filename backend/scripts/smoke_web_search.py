"""
Manual smoke test for the web_search tool (Step 1 of the RAG web-research plan).
Runs a real query against live Tavily and prints the formatted result — no
mocking, so TAVILY_API_KEY must be set in .env before running.

Run from the project root:
    python -m backend.scripts.smoke_web_search "your query here"
"""
import argparse
import asyncio
import sys

from backend.core.config import settings


async def run(query: str) -> None:
    from backend.ai.agents.tools import web_search

    result = await web_search.ainvoke({"query": query})
    print(result)


if __name__ == "__main__":
    if not settings.TAVILY_API_KEY:
        print("FAILED: TAVILY_API_KEY is not set in .env — cannot run a live smoke test.")
        sys.exit(1)

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", type=str, help="Search query to send to Tavily")
    args = parser.parse_args()

    try:
        asyncio.run(run(args.query))
    except Exception as exc:
        print(f"FAILED: {exc}")
        sys.exit(1)
