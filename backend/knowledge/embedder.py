"""Embedding strategies. The pipeline depends on the Embedder protocol only, so
tests pass FakeEmbedder and never call Gemini.

gemini-embedding-2 takes no taskType parameter (gemini-embedding-001 did):
the task goes in the text instead, "title: … | text: …" for documents and
"task: search result | query: …" for queries. Below 3072 dimensions it
returns normalized vectors, so cosine search needs no extra step.
"""

import asyncio
import hashlib
import logging
import math
from typing import Protocol

import httpx

from backend.core.config import settings
from backend.knowledge.errors import EmbeddingUnavailableError, InvalidVectorError, PermanentFileError
from backend.knowledge.repository import validate_vector

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com"
BATCH_SIZE = 100  # batchEmbedContents request limit
ATTEMPTS = 3
# Explicit per-phase limits on every embedding request, so a hung Gemini call
# fails (and is retried) instead of stalling the sync run.
TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=60.0, pool=10.0)


class Embedder(Protocol):
    model_tag: str

    async def embed_documents(self, title: str, texts: list[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


def document_input(title: str, text: str) -> str:
    return f"title: {title or 'none'} | text: {text}"


def query_input(text: str) -> str:
    return f"task: search result | query: {text}"


class GeminiEmbedder:
    """Defaults suit ingestion (a background job that can wait). The agents'
    query embedding passes fewer attempts and a shorter timeout so a search
    tool call stays inside its own time limit."""

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        backoff_s: float = 1.0,
        attempts: int = ATTEMPTS,
        timeout: httpx.Timeout = TIMEOUT,
    ) -> None:
        self.model_tag = settings.EMBEDDING_MODEL_TAG
        self._model = settings.EMBEDDING_MODEL
        self._client = client
        self._backoff_s = backoff_s
        self._attempts = attempts
        self._timeout = timeout

    async def embed_documents(self, title: str, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), BATCH_SIZE):
            batch = texts[start : start + BATCH_SIZE]
            vectors.extend(await self._batch([document_input(title, t) for t in batch]))
        return vectors

    async def embed_query(self, text: str) -> list[float]:
        return (await self._batch([query_input(text)]))[0]

    async def _batch(self, inputs: list[str]) -> list[list[float]]:
        body = {
            "requests": [
                {
                    "model": f"models/{self._model}",
                    "content": {"parts": [{"text": t}]},
                    "outputDimensionality": settings.EMBEDDING_DIM,
                }
                for t in inputs
            ]
        }
        response = await self._post(body)
        try:
            vectors = [e["values"] for e in response.json()["embeddings"]]
        except (ValueError, KeyError, TypeError) as exc:
            raise EmbeddingUnavailableError("malformed embedding response") from exc
        if len(vectors) != len(inputs):
            raise EmbeddingUnavailableError(f"asked for {len(inputs)} embeddings, got {len(vectors)}")
        try:
            for v in vectors:
                validate_vector(v)
        except InvalidVectorError as exc:
            raise EmbeddingUnavailableError(f"invalid embedding: {exc}") from exc
        return vectors

    async def _post(self, body: dict) -> httpx.Response:
        base = (settings.GEMINI_BASE_URL or DEFAULT_BASE_URL).rstrip("/")
        url = f"{base}/v1beta/models/{self._model}:batchEmbedContents"
        # Header, not ?key=: query strings end up in access logs.
        headers = {"x-goog-api-key": settings.LANGCHAIN_API_KEY_GEMINI}
        last: str = ""
        for attempt in range(1, self._attempts + 1):
            try:
                if self._client is not None:
                    response = await self._client.post(url, json=body, headers=headers, timeout=self._timeout)
                else:
                    async with httpx.AsyncClient(timeout=self._timeout) as client:
                        response = await client.post(url, json=body, headers=headers, timeout=self._timeout)
            except httpx.HTTPError as exc:
                last = f"{type(exc).__name__}"
            else:
                if response.status_code == 200:
                    return response
                if response.status_code == 400:
                    # The input itself was rejected: retrying the same file won't help.
                    raise PermanentFileError(f"embedding API rejected the input: {response.text[:200]}")
                last = f"HTTP {response.status_code}"
                if response.status_code not in (429, 500, 502, 503, 504):
                    break  # 401/403/404: configuration problem, not worth retrying now
            if attempt < self._attempts:
                await asyncio.sleep(self._backoff_s * 2 ** (attempt - 1))
        logger.warning("knowledge embedding unavailable model=%s error=%s", self._model, last)
        raise EmbeddingUnavailableError(f"embedding API unavailable: {last}")


class FakeEmbedder:
    """Deterministic vectors from the text's hash; records every call. For
    tests only. `fail_with` makes the next call raise."""

    def __init__(self, dim: int | None = None) -> None:
        self.model_tag = settings.EMBEDDING_MODEL_TAG
        self.dim = dim or settings.EMBEDDING_DIM
        self.calls: list[list[str]] = []
        self.fail_with: Exception | None = None

    @property
    def embedded_texts(self) -> list[str]:
        return [t for call in self.calls for t in call]

    def _vector(self, text: str) -> list[float]:
        seed = hashlib.sha256(text.encode()).digest()
        raw = [(seed[i % len(seed)] + i) % 251 + 1.0 for i in range(self.dim)]
        norm = math.sqrt(sum(x * x for x in raw))
        return [x / norm for x in raw]

    async def embed_documents(self, title: str, texts: list[str]) -> list[list[float]]:
        if self.fail_with is not None:
            raise self.fail_with
        self.calls.append(list(texts))
        return [self._vector(t) for t in texts]

    async def embed_query(self, text: str) -> list[float]:
        return self._vector(text)
