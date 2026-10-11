"""Stand-ins for the two external services the LinkedIn path calls, over real HTTP.

- Gemini: the real ChatGoogleGenerativeAI is pointed here with
  settings.GEMINI_BASE_URL, so client construction, request serialisation,
  retries and response parsing all run the production code. Response shape
  follows https://ai.google.dev/api/generate-content#v1beta.GenerateContentResponse
- Supabase Auth JWKS: settings.SUPABASE_URL is pointed here, so the real
  PyJWKClient fetches the signing keys and the real jwt.decode verifies them.
  Tokens are minted with the private keys in jwt_keys.py.
- Google OAuth + Drive, and Gemini embeddings: see fake_google.py
  (settings.GOOGLE_BASE_URL and GEMINI_BASE_URL point here).
"""

import json
import socket
import threading
import time
from collections import deque
from dataclasses import dataclass, field

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from tests.smoke import jwt_keys
from tests.smoke.fake_google import ROOT_ID, FakeEmbeddings, FakeGoogle

MODEL_PATH = "/v1beta/models/gemini-3.5-flash:generateContent"


def post_reply(content: str) -> dict:
    """A successful generateContent body whose text is the structured output."""
    return {
        "candidates": [
            {
                "content": {"role": "model", "parts": [{"text": json.dumps({"content": content})}]},
                "finishReason": "STOP",
                "index": 0,
            }
        ],
        "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 10, "totalTokenCount": 20},
        "modelVersion": "gemini-3.5-flash",
    }


def error_reply(status: int, message: str = "fake gemini error") -> tuple[int, dict]:
    reason = {400: "INVALID_ARGUMENT", 429: "RESOURCE_EXHAUSTED", 503: "UNAVAILABLE"}.get(status, "INTERNAL")
    return status, {"error": {"code": status, "message": message, "status": reason}}


@dataclass
class Recorded:
    path: str
    headers: dict
    body: dict


@dataclass
class FakeUpstream:
    """Records every Gemini request. Replies come from `queue` first, then
    `always` if set, otherwise a numbered default post ("fake post N")."""

    requests: list[Recorded] = field(default_factory=list)
    queue: deque = field(default_factory=deque)
    always: tuple[int, dict] | None = None
    url: str = ""
    google: FakeGoogle = field(default_factory=FakeGoogle)
    embeddings: FakeEmbeddings = field(default_factory=FakeEmbeddings)

    def reset(self) -> None:
        self.requests.clear()
        self.queue.clear()
        self.always = None
        self.google.reset()
        self.embeddings.reset()

    def reply_post(self, content: str) -> None:
        self.queue.append((200, post_reply(content)))

    def reply_error(self, status: int, message: str = "fake gemini error") -> None:
        self.queue.append(error_reply(status, message))

    def fail_always(self, status: int, message: str = "fake gemini error") -> None:
        self.always = error_reply(status, message)

    def _next(self) -> tuple[int, dict]:
        if self.queue:
            return self.queue.popleft()
        if self.always:
            return self.always
        return 200, post_reply(f"fake post {len(self.requests)}")

    def app(self) -> FastAPI:
        app = FastAPI()

        @app.get("/auth/v1/.well-known/jwks.json")
        def jwks():
            return jwt_keys.jwks()

        # Test-only control endpoints, so a separate process (Playwright, the
        # container check) can script replies.
        @app.post("/__control/reset")
        def control_reset():
            self.reset()
            return {"ok": True}

        @app.post("/__control/error/{status}")
        def control_error(status: int):
            self.reply_error(status)
            return {"ok": True}

        @app.get("/__control/requests")
        def control_requests():
            return [r.__dict__ for r in self.requests]

        # Drive contents for the browser smoke test (a separate process).
        @app.post("/__control/drive/folder")
        async def control_drive_folder(request: Request):
            body = await request.json()
            return {"id": self.google.add_folder(body["name"], body.get("parent") or ROOT_ID)}

        @app.post("/__control/drive/doc")
        async def control_drive_doc(request: Request):
            body = await request.json()
            return {"id": self.google.add_doc(body["name"], body["markdown"], body.get("parent") or ROOT_ID)}

        @app.post("/__control/drive/edit/{file_id}")
        async def control_drive_edit(file_id: str, request: Request):
            self.google.edit(file_id, (await request.json())["markdown"])
            return {"ok": True}

        @app.post("/__control/drive/trash/{file_id}")
        def control_drive_trash(file_id: str):
            self.google.trash(file_id)
            return {"ok": True}

        @app.post("/__control/drive/revoke")
        def control_drive_revoke():
            self.google.revoke_access()
            return {"ok": True}

        @app.get("/__control/token/{sub}")
        def control_token(sub: str):
            # Same keys as the JWKS above, so the backend verifies it for real.
            return {"access_token": jwt_keys.mint_token(self.url, sub, email=f"{sub}@smoke.local")}

        self.google.mount(app)  # before the catch-all below

        @app.post("/{full_path:path}")
        async def generate(full_path: str, request: Request):
            body = await request.json()
            if FakeEmbeddings.is_embed_path(full_path):
                return self.embeddings.reply(body)
            self.requests.append(Recorded("/" + full_path, dict(request.headers), body))
            status, payload = self._next()
            return JSONResponse(payload, status_code=status)

        return app


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start(port: int | None = None, host: str = "127.0.0.1") -> FakeUpstream:
    """Serve a FakeUpstream on a background thread; returns once it accepts connections."""
    fake = FakeUpstream()
    port = port or _free_port()
    server = uvicorn.Server(uvicorn.Config(fake.app(), host=host, port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    deadline = time.monotonic() + 10
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("fake upstream server did not start")
        time.sleep(0.05)
    fake.url = f"http://127.0.0.1:{port}"
    return fake


if __name__ == "__main__":
    # Standalone mode for the container check and Playwright: `python -m tests.smoke.fake_upstream 8090`
    import sys

    uvicorn.run(FakeUpstream().app(), host="0.0.0.0", port=int(sys.argv[1]), log_level="warning")
