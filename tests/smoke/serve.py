"""The backend for the browser smoke tests (frontend/playwright.smoke.config.ts).

Runs the real app on :8000 and the fake upstream (Gemini + Supabase JWKS) on
:8090 in one process, so tokens handed to the browser by
GET :8090/__control/token/{user_id} verify against the same keys. Nothing in
the backend is patched; it is configured through env vars like on Render.

    TEST_DATABASE_URL=postgresql://... python -m tests.smoke.serve
"""

import asyncio
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
API_PORT = 8000
FAKE_PORT = 8090
FRONTEND_ORIGIN = "http://localhost:4175"  # vite preview in playwright.smoke.config.ts


def main() -> None:
    db_url = os.environ["TEST_DATABASE_URL"]
    if urlparse(db_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        sys.exit("TEST_DATABASE_URL must be a local throwaway database")
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    from tests.smoke import fake_upstream

    fake = fake_upstream.start(port=FAKE_PORT)
    os.environ.update(
        DATABASE_URL=db_url,
        ENV="test",
        LANGCHAIN_API_KEY_GEMINI="smoke-key",
        GEMINI_BASE_URL=fake.url,
        SUPABASE_URL=fake.url,
        EXTRA_ALLOWED_ORIGINS=FRONTEND_ORIGIN,
    )
    # THREAD_TURN_LIMIT passes through from the environment if set.
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT, check=True)

    import uvicorn

    from backend.main import app

    uvicorn.run(app, host="127.0.0.1", port=API_PORT, log_level="info")


if __name__ == "__main__":
    main()
