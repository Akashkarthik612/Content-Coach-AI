"""Boot the production Docker image and talk to it like Render traffic would.

Run by the `docker-smoke` CI job after `docker build -t honne-backend .`:

    python -m tests.smoke.container_check honne-backend

The image runs its own CMD (alembic upgrade head && uvicorn) with env vars
only — no .env, no test packages — so this catches what in-process tests
can't: a dependency missing from requirements.txt, migrations failing on a
fresh database, checkpointer setup() at first boot. Gemini and Supabase's
JWKS are this process's fake upstream on the host network.
"""

import os
import subprocess
import sys
import time
import uuid

import httpx

from tests.smoke import fake_upstream, jwt_keys

API = "http://127.0.0.1:8000"
FAKE_PORT = 8090
CONTAINER = "honne-smoke"
BOOT_TIMEOUT_S = 120


def _docker(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *args], check=check, capture_output=True, text=True)


def _wait_for_health() -> None:
    deadline = time.monotonic() + BOOT_TIMEOUT_S
    while time.monotonic() < deadline:
        try:
            if httpx.get(f"{API}/health", timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        if _docker("inspect", "-f", "{{.State.Running}}", CONTAINER).stdout.strip() != "true":
            raise RuntimeError("container exited during boot")
        time.sleep(2)
    raise RuntimeError(f"/health not up after {BOOT_TIMEOUT_S}s")


def _check(name: str, ok: bool, detail: object = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail if not ok else ''}")
    if not ok:
        raise AssertionError(name)


def run(image: str) -> None:
    fake = fake_upstream.start(port=FAKE_PORT)
    _docker("rm", "-f", CONTAINER, check=False)
    _docker(
        "run", "-d", "--name", CONTAINER, "--network", "host",
        "-e", f"DATABASE_URL={os.environ['TEST_DATABASE_URL']}",
        "-e", "RENDER=true",
        "-e", "LANGCHAIN_API_KEY_GEMINI=container-key",
        "-e", f"GEMINI_BASE_URL={fake.url}",
        "-e", f"SUPABASE_URL={fake.url}",
        image,
    )  # fmt: skip
    try:
        _wait_for_health()
        result = _docker("logs", CONTAINER)
        logs = result.stdout + result.stderr
        _check("alembic ran on boot", "alembic.runtime.migration" in logs, logs[-2000:])

        headers = {"Authorization": f"Bearer {jwt_keys.mint_token(fake.url, uuid.uuid4())}"}
        url = f"{API}/api/independent-agents/linkedin"
        first = httpx.post(url, json={"message": "write about our launch"}, headers=headers, timeout=60)
        _check("first turn is 200", first.status_code == 200, first.text)
        _check("post came from Gemini", first.json()["content"] == "fake post 1", first.text)
        _check("Gemini got the real key", fake.requests[0].headers.get("x-goog-api-key") == "container-key")

        tid = first.json()["thread"]["thread_id"]
        second = httpx.post(url, json={"message": "shorter", "thread_id": tid}, headers=headers, timeout=60)
        _check("second turn is 200", second.status_code == 200, second.text)
        roles = [c["role"] for c in fake.requests[1].body["contents"]]
        _check("memory reached Gemini", roles == ["user", "model", "user"], roles)
        print("container smoke: all checks passed")
    except Exception:
        print("── container logs ──")
        result = _docker("logs", CONTAINER, check=False)
        print(result.stdout[-8000:], result.stderr[-8000:])
        raise
    finally:
        _docker("rm", "-f", CONTAINER, check=False)


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "honne-backend")
