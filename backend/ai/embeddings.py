"""
Embedding pipeline — called as a FastAPI BackgroundTask after save_version.

Runs synchronously (no async) so it can be used directly as a background task
from sync FastAPI routes without event-loop complications. All I/O is blocking
but runs after the HTTP response has already been sent to the client.
"""
import logging
from sqlalchemy import text
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from backend.core.config import settings
from backend.core.database import SessionLocal

logger = logging.getLogger(__name__)

EMBEDDING_DIM  = 768
CHUNK_SIZE     = 650
CHUNK_OVERLAP  = 80

# Module-level singletons — one cold-start per process lifetime
_embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    task_type="retrieval_document",
    output_dimensionality=EMBEDDING_DIM,
    google_api_key=settings.LANGCHAIN_API_KEY_GEMINI,
)

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
)


def embed_and_store_version(
    version_id: str,
    post_id:    str,
    user_id:    str,
    content:    str,
) -> None:
    """
    Chunk → embed → store in post_embeddings.

    Always deletes existing rows for post_id first so only the current version's
    chunks are searchable (no stale embeddings from previous versions).

    Called as a FastAPI BackgroundTask — runs after HTTP 201 is sent to client.
    Errors are logged but never re-raised (caller has already responded).
    """
    logger.debug("embed_and_store_version: post_id=%s version_id=%s content_len=%d",
                 post_id, version_id, len(content))
    try:
        chunks = _splitter.split_text(content)
        logger.debug("Chunked into %d chunk(s): post_id=%s", len(chunks), post_id)
        if not chunks:
            return

        vectors: list[list[float]] = _embeddings.embed_documents(chunks)
        logger.debug("Generated %d embedding vector(s): post_id=%s", len(vectors), post_id)

        with SessionLocal() as db:
            # Delete all chunks for this post (any prior version)
            db.execute(
                text("DELETE FROM post_embeddings WHERE post_id = :post_id"),
                {"post_id": post_id},
            )
            logger.debug("Deleted existing embeddings: post_id=%s", post_id)

            # Bulk-insert new chunks
            rows = [
                {
                    "post_id":     post_id,
                    "version_id":  version_id,
                    "user_id":     user_id,
                    "chunk_index": i,
                    "content":     chunk,
                    "embedding":   "[" + ",".join(f"{v:.8f}" for v in vec) + "]",
                }
                for i, (chunk, vec) in enumerate(zip(chunks, vectors))
            ]

            db.execute(
                text("""
                    INSERT INTO post_embeddings
                        (id, post_id, version_id, user_id, chunk_index, content, embedding)
                    VALUES
                        (gen_random_uuid(),
                         CAST(:post_id    AS uuid),
                         CAST(:version_id AS uuid),
                         CAST(:user_id    AS uuid),
                         :chunk_index,
                         :content,
                         CAST(:embedding  AS vector))
                """),
                rows,
            )
            db.commit()

        logger.info(
            "Embedded %d chunk(s) for post %s version %s",
            len(chunks), post_id, version_id,
        )

    except Exception:
        logger.exception(
            "embed_and_store_version failed for post %s version %s",
            post_id, version_id,
        )
