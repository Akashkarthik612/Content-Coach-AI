import asyncio
from sqlalchemy import text

from langchain_google_genai import GoogleGenerativeAIEmbeddings

from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.ai.state import AgentState


# Module-level embeddings client — avoids re-instantiating on every request
_embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    task_type="retrieval_query",
    output_dimensionality=768,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)


async def vector_search_node(state: AgentState) -> dict:
    """
    DATA node — zero LLM generation.

    Embeds the user's query (via Gemini embedding-001) then runs a pgvector
    cosine similarity scan on post_embeddings scoped to state["user_id"].
    Both the embed call and the DB query run in asyncio.to_thread() so the
    event loop is never blocked.

    Writes: state["vector_context"]
    Route:  fixed edge back to supervisor_node (Pass 2 synthesis)
    """
    query   = state["query"]
    user_id = state["user_id"]

    # Step 1 — embed the query (sync HTTP call → thread)
    query_embedding: list[float] = await asyncio.to_thread(
        _embeddings.embed_query, query
    )

    # Step 2 — cosine search against post_embeddings (sync DB → thread)
    vector_context = await asyncio.to_thread(
        _cosine_search, user_id, query_embedding
    )

    return {"vector_context": vector_context}


# ── Sync helper ───────────────────────────────────────────────────────────────

def _cosine_search(user_id: str, query_embedding: list[float]) -> str:
    # pgvector expects the vector as a string literal: '[0.1, 0.2, ...]'
    embedding_str = "[" + ",".join(f"{v:.8f}" for v in query_embedding) + "]"

    sql = text("""
        SELECT
            p.title,
            pe.content,
            pe.chunk_index,
            pe.embedding <=> (:embedding)::vector AS distance
        FROM post_embeddings pe
        JOIN posts p ON p.id = pe.post_id
        WHERE pe.user_id = (:user_id)::uuid
        ORDER BY distance ASC
        LIMIT 6
    """)

    with SessionLocal() as db:
        rows = db.execute(
            sql, {"embedding": embedding_str, "user_id": user_id}
        ).fetchall()

    if not rows:
        return (
            "[NO_CONTEXT_FOUND: no embeddings found for this user — "
            "run the embedding pipeline first]"
        )

    lines = ["## Semantic Search Results\n"]
    for title, content, chunk_index, distance in rows:
        lines.append(
            f"### {title}  (chunk {chunk_index}, similarity distance: {distance:.4f})"
        )
        lines.append(content or "")
        lines.append("")
    return "\n".join(lines)
