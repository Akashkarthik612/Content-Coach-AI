"""Public tool catalog. Configuration opts into external tools explicitly."""

from typing import Literal

ToolName = Literal[
    "search_knowledge",
    "find_documents",
    "list_documents",
    "read_document",
    "web_search",
    "create_google_doc",
]
KNOWLEDGE_TOOLS = ("search_knowledge", "find_documents", "list_documents", "read_document")
TOOL_CATALOG = (
    {
        "name": "search_knowledge",
        "label": "Search company knowledge",
        "description": "Find relevant passages in permitted documents.",
        "effect": "read",
        "connection": "knowledge",
    },
    {
        "name": "find_documents",
        "label": "Find documents",
        "description": "Find permitted documents by title.",
        "effect": "read",
        "connection": "knowledge",
    },
    {
        "name": "list_documents",
        "label": "List documents",
        "description": "Browse permitted documents and recent updates.",
        "effect": "read",
        "connection": "knowledge",
    },
    {
        "name": "read_document",
        "label": "Read documents",
        "description": "Read the indexed text of a permitted document.",
        "effect": "read",
        "connection": "knowledge",
    },
    {
        "name": "web_search",
        "label": "Search the web",
        "description": "Use Tavily to research public information with source links. Queries are sent to Tavily.",
        "effect": "read",
        "connection": "tavily",
    },
    {
        "name": "create_google_doc",
        "label": "Create Google documents",
        "description": "Create a formatted report in the account of the person running the agent. Google sharing settings apply.",
        "effect": "create",
        "connection": "google_docs",
    },
)
TOOL_NAMES = tuple(item["name"] for item in TOOL_CATALOG)
