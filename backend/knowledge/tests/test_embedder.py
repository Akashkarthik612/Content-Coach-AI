"""GeminiEmbedder over httpx.MockTransport: request shape, batching, retries
and error mapping. Unit tests: never calls Gemini."""

import json

import httpx
import pytest

from backend.core.config import settings
from backend.knowledge.embedder import BATCH_SIZE, GeminiEmbedder
from backend.knowledge.errors import EmbeddingUnavailableError, PermanentFileError


def _vector(i: int) -> list[float]:
    v = [0.0] * settings.EMBEDDING_DIM
    v[i % settings.EMBEDDING_DIM] = 1.0
    return v


def _ok(request: httpx.Request) -> httpx.Response:
    n = len(json.loads(request.content)["requests"])
    return httpx.Response(200, json={"embeddings": [{"values": _vector(i)} for i in range(n)]})


def _embedder(handler) -> tuple[GeminiEmbedder, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def record(request):
        seen.append(request)
        return handler(request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(record))
    return GeminiEmbedder(client=client, backoff_s=0), seen


async def test_request_shape_uses_document_format_and_header_key():
    emb, seen = _embedder(_ok)
    await emb.embed_documents("Plan", ["chunk one"])
    body = json.loads(seen[0].content)
    assert seen[0].url.path.endswith(f"/models/{settings.EMBEDDING_MODEL}:batchEmbedContents")
    assert "key" not in seen[0].url.params
    assert "x-goog-api-key" in seen[0].headers
    req = body["requests"][0]
    assert req["content"]["parts"][0]["text"] == "title: Plan | text: chunk one"
    assert req["outputDimensionality"] == settings.EMBEDDING_DIM
    assert "taskType" not in req  # gemini-embedding-2 takes the task in the text


async def test_batches_of_100():
    emb, seen = _embedder(_ok)
    vectors = await emb.embed_documents("t", [f"c{i}" for i in range(BATCH_SIZE + 5)])
    assert len(vectors) == BATCH_SIZE + 5
    assert [len(json.loads(r.content)["requests"]) for r in seen] == [BATCH_SIZE, 5]


async def test_retries_429_then_succeeds():
    responses = iter([httpx.Response(429), httpx.Response(503)])
    emb, seen = _embedder(lambda r: next(responses, None) or _ok(r))
    assert len(await emb.embed_documents("t", ["a"])) == 1
    assert len(seen) == 3


async def test_gives_up_after_three_attempts_as_transient():
    emb, seen = _embedder(lambda r: httpx.Response(500))
    with pytest.raises(EmbeddingUnavailableError):
        await emb.embed_documents("t", ["a"])
    assert len(seen) == 3


async def test_400_is_a_permanent_file_error():
    emb, seen = _embedder(lambda r: httpx.Response(400, json={"error": "bad input"}))
    with pytest.raises(PermanentFileError):
        await emb.embed_documents("t", ["a"])
    assert len(seen) == 1


@pytest.mark.parametrize(
    "payload",
    [
        {"embeddings": []},  # count mismatch
        {"embeddings": [{"values": [0.1, 0.2]}]},  # wrong dimension
        {"embeddings": [{"values": [0.0] * 768}]},  # zero vector
        {"nope": 1},
    ],
)
async def test_malformed_responses_are_transient(payload):
    emb, _ = _embedder(lambda r: httpx.Response(200, json=payload))
    with pytest.raises(EmbeddingUnavailableError):
        await emb.embed_documents("t", ["a"])


async def test_query_format():
    emb, seen = _embedder(_ok)
    await emb.embed_query("what did I ship")
    text = json.loads(seen[0].content)["requests"][0]["content"]["parts"][0]["text"]
    assert text == "task: search result | query: what did I ship"
