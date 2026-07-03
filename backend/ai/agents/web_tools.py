"""
Web-access @tool functions for researcher_node — same shape as tools.py, but for
the open web instead of the user's vault.

  web_search(query)   → DuckDuckGo search (ddgs), free, no API key
  fetch_page(url)      → fetch + strip a single page to clean readable text (trafilatura)

Not user-scoped (results aren't per-user), so cache keys use a constant "global"
user_id slot in the existing tool_key() helper rather than a real user id.
"""
import asyncio
import logging

import trafilatura
from ddgs import DDGS
from langchain_core.tools import tool

from backend.core.cache import async_get, async_set, tool_key, query_hash, _TOOL_TTL

logger = logging.getLogger(__name__)

_FETCH_TTL = 3600  # 1 hour — page content changes less often than search results


def _run_search(query: str, max_results: int) -> list[dict]:
    return list(DDGS().text(query, max_results=max_results))


def _run_fetch(url: str) -> str | None:
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        return None
    return trafilatura.extract(downloaded)


@tool
async def web_search(query: str, max_results: int = 6) -> str:
    """Search the open web for current information — news, company pages, product
    launches, funding, trends. Returns titles, URLs, and short snippets. Use
    fetch_page on the most relevant result URL(s) to read the full page content."""
    logger.debug("web_search: query_len=%d max_results=%d", len(query), max_results)
    if not query or not query.strip():
        return "[NO_RESULTS: empty search query]"

    ck = tool_key("web_search", "global", query_hash(f"{query}:{max_results}"))
    cached = await async_get(ck)
    if cached:
        logger.debug("web_search cache hit")
        return cached

    try:
        results = await asyncio.to_thread(_run_search, query, max_results)
    except Exception:
        logger.warning("web_search: search backend failed", exc_info=True)
        return "[NO_RESULTS: search failed]"

    if not results:
        result = "[NO_RESULTS: no results found]"
    else:
        lines = ["## Web Search Results\n"]
        for r in results:
            lines.append(f"### {r.get('title', '')}")
            lines.append(f"URL: {r.get('href', '')}")
            lines.append(r.get("body", ""))
            lines.append("")
        result = "\n".join(lines)

    logger.debug("web_search: %d results found", len(results))
    await async_set(ck, result, ttl=_TOOL_TTL)
    return result


@tool
async def fetch_page(url: str) -> str:
    """Fetch a specific web page and return its main content as clean readable text,
    stripped of navigation/ads/boilerplate. Use this to read a company's product page,
    press release, or article in full after finding its URL via web_search."""
    logger.debug("fetch_page: url=%s", url)
    if not url or not url.strip():
        return "[FETCH_FAILED: empty url]"

    ck = tool_key("fetch_page", "global", query_hash(url))
    cached = await async_get(ck)
    if cached:
        logger.debug("fetch_page cache hit: url=%s", url)
        return cached

    try:
        text = await asyncio.to_thread(_run_fetch, url)
    except Exception:
        logger.warning("fetch_page: fetch/extract failed for url=%s", url, exc_info=True)
        return f"[FETCH_FAILED: could not read {url}]"

    if not text:
        result = f"[FETCH_FAILED: no readable content extracted from {url}]"
    else:
        result = text[:6000]  # cap so one page can't blow the context budget
        logger.debug("fetch_page: extracted %d chars (capped at 6000) from %s", len(text), url)

    await async_set(ck, result, ttl=_FETCH_TTL)
    return result
