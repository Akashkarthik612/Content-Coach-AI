"""Post-deploy check for the LinkedIn agent — the one test that uses the real
Gemini key, run by hand against production after a deploy.

CI proves everything up to Google's front door (tests/smoke/). This proves
the door opens: the key is valid, the model exists, the request is accepted,
and memory works on Supabase's pooler. It makes two Gemini calls, then
deletes the thread it created.

    python scripts/prod_check.py \\
        --api https://<app>.onrender.com \\
        --origin https://<app>.vercel.app \\
        --token <Supabase access token>

Get the token from a logged-in browser tab on the deployed site, in DevTools:
    JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith('-auth-token')))).access_token
It expires after about an hour.
"""

import argparse
import sys

import httpx

HINTS = {
    "cors": "Render: set EXTRA_ALLOWED_ORIGINS to the Vercel URL (exact origin, no trailing slash).",
    401: "Token rejected: get a fresh one, and check Render's SUPABASE_URL is this project's URL.",
    502: "Gemini refused the request: check LANGCHAIN_API_KEY_GEMINI on Render and that "
    "GEMINI_BASE_URL is NOT set. The Render logs show Google's exact error.",
    504: "Gemini timed out or is rate-limited on all attempts: retry; if it persists, check the key's quota.",
    500: "Server error: check the Render logs.",
}


class Check:
    def __init__(self) -> None:
        self.failed = False

    def __call__(self, name: str, ok: bool, detail: str = "", hint: str = "") -> bool:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + ("" if ok else f"\n      {detail}"))
        if not ok and hint:
            print(f"      hint: {hint}")
        self.failed |= not ok
        return ok


def _hint(res: httpx.Response) -> str:
    return HINTS.get(res.status_code, "")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", required=True, help="Backend origin, e.g. https://honne.onrender.com")
    parser.add_argument("--origin", required=True, help="Frontend origin, e.g. https://honne.vercel.app")
    parser.add_argument("--token", required=True, help="Supabase access token of a test account")
    args = parser.parse_args()
    api = args.api.rstrip("/")
    url = f"{api}/api/independent-agents/linkedin"
    headers = {"Authorization": f"Bearer {args.token}", "Origin": args.origin}
    check = Check()

    with httpx.Client(timeout=120) as client:  # Render free tier may cold-start
        res = client.get(f"{api}/health")
        if not check("backend is up (/health)", res.status_code == 200, f"{res.status_code} {res.text[:200]}"):
            return 1

        res = client.options(
            url,
            headers={
                "Origin": args.origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        check(
            "CORS allows the frontend origin",
            res.headers.get("access-control-allow-origin") == args.origin,
            f"allow-origin = {res.headers.get('access-control-allow-origin')!r}",
            HINTS["cors"],
        )

        res = client.get(f"{url}/threads", headers=headers)
        if not check("token accepted", res.status_code == 200, f"{res.status_code} {res.text[:200]}", _hint(res)):
            return 1

        res = client.post(url, json={"message": "prod check: write a two-line post about testing"}, headers=headers)
        body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        if not check(
            "real Gemini call returns a post",
            res.status_code == 200 and bool(body.get("content", "").strip()),
            f"{res.status_code} {body.get('detail', res.text[:200])}",
            _hint(res),
        ):
            return 1
        print(f"      post: {body['content'][:120]!r}…")
        thread_id = body["thread"]["thread_id"]

        try:
            res = client.post(url, json={"message": "make it one line", "thread_id": thread_id}, headers=headers)
            check(
                "follow-up uses the same thread (memory on Supabase)",
                res.status_code == 200 and res.json()["thread"]["turn_count"] == 2,
                f"{res.status_code} {res.text[:200]}",
                _hint(res),
            )
        finally:
            res = client.delete(f"{url}/threads/{thread_id}", headers=headers)
            check("cleanup: test thread deleted", res.status_code == 204, f"{res.status_code} {res.text[:200]}")

    print("\nALL CHECKS PASSED" if not check.failed else "\nSOME CHECKS FAILED")
    return 1 if check.failed else 0


if __name__ == "__main__":
    sys.exit(main())
