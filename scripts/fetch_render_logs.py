"""Download the backend's logs from Render to logs/ on this machine.

Nothing is written on Render: a free instance loses its local files at every
spin-down, deploy and restart, so the logs are read from Render's log store
(GET https://api.render.com/v1/logs, kept 7 days on the Hobby plan) instead.

Every run first deletes downloaded files in logs/ older than --keep-days
(default 1), so old downloads don't pile up.

    python scripts/fetch_render_logs.py --since 2h
    python scripts/fetch_render_logs.py --since 1d --text "knowledge"       # sync/poller lines
    python scripts/fetch_render_logs.py --since 6h --level error --level warning
    python scripts/fetch_render_logs.py --start 2026-10-09T10:00:00Z --end 2026-10-09T11:00:00Z

Needs three env vars (or the matching flags):
    RENDER_API_KEY     Account Settings -> API Keys
    RENDER_OWNER_ID    workspace id (tea-...): Workspace Settings, or GET /v1/owners
    RENDER_SERVICE_ID  backend service id (srv-...): in the service's dashboard URL

Useful text filters: "knowledge sync" (one line per run), "knowledge file synced"
(per file: chunks, embedded, timings), "knowledge poll" (per poller tick).
"""

import argparse
import os
import re
import sys
import time
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

API = "https://api.render.com/v1/logs"
ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = ROOT / "logs"
FILE_PREFIX = "render_"
PAGE_SIZE = 100  # API maximum
MAX_PAGES = 500  # 50k lines: a guard against an endless loop, far above a normal pull
RATE_LIMIT_RETRIES = 5
_DURATION = re.compile(r"^(\d+)([mhd])$")


def parse_since(value: str) -> timedelta:
    """'30m', '2h', '1d' -> timedelta."""
    match = _DURATION.match(value.strip())
    if not match:
        raise argparse.ArgumentTypeError(f"expected e.g. 30m, 2h or 1d, got {value!r}")
    amount, unit = int(match.group(1)), match.group(2)
    return {"m": timedelta(minutes=amount), "h": timedelta(hours=amount), "d": timedelta(days=amount)}[unit]


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def cleanup(log_dir: Path, keep_days: float, now: float | None = None) -> list[Path]:
    """Delete downloaded log files older than keep_days. Only touches files
    this script wrote (render_*.log)."""
    if not log_dir.exists():
        return []
    cutoff = (now if now is not None else time.time()) - keep_days * 86400
    removed = []
    for path in log_dir.glob(f"{FILE_PREFIX}*.log"):
        if path.stat().st_mtime < cutoff:
            path.unlink()
            removed.append(path)
    return removed


def fetch_logs(
    client: httpx.Client,
    owner_id: str,
    service_id: str,
    start: datetime,
    end: datetime,
    text: list[str] | None = None,
    level: list[str] | None = None,
    log_type: list[str] | None = None,
) -> Iterator[dict]:
    """Oldest first. Pages by the nextStartTime/nextEndTime the API returns."""
    params: dict = {
        "ownerId": owner_id,
        "resource": [service_id],
        "direction": "forward",
        "limit": PAGE_SIZE,
        "startTime": iso(start),
        "endTime": iso(end),
    }
    for key, values in (("text", text), ("level", level), ("type", log_type)):
        if values:
            params[key] = values
    for _ in range(MAX_PAGES):
        page = _get(client, params)
        yield from page.get("logs", [])
        if not page.get("hasMore"):
            return
        params["startTime"], params["endTime"] = page["nextStartTime"], page["nextEndTime"]
    print(f"stopped after {MAX_PAGES} pages; narrow the time range to get the rest", file=sys.stderr)


def _get(client: httpx.Client, params: dict) -> dict:
    for attempt in range(RATE_LIMIT_RETRIES):
        response = client.get(API, params=params)
        if response.status_code != 429:
            break
        wait = float(response.headers.get("RateLimit-Reset", 2 ** attempt))
        time.sleep(min(wait, 60))
    if response.status_code == 401:
        raise SystemExit("Render rejected the API key (401): check RENDER_API_KEY")
    if response.status_code in (403, 404):
        raise SystemExit(
            f"Render returned {response.status_code}: check RENDER_OWNER_ID and RENDER_SERVICE_ID "
            f"belong to this API key's workspace. {response.text[:200]}"
        )
    response.raise_for_status()
    return response.json()


def format_line(entry: dict) -> str:
    labels = {label["name"]: label["value"] for label in entry.get("labels", [])}
    level = labels.get("level", "-")
    instance = labels.get("instance", "-")
    return f"{entry['timestamp']} [{level}] [{instance}] {entry['message'].rstrip()}"


def main(argv: list[str] | None = None, transport: httpx.BaseTransport | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--since", type=parse_since, default=timedelta(hours=1), help="e.g. 30m, 2h, 1d (default 1h)")
    parser.add_argument("--start", type=parse_time, help="ISO time; overrides --since")
    parser.add_argument("--end", type=parse_time, help="ISO time (default now)")
    parser.add_argument("--text", action="append", help="only lines matching this text (repeatable)")
    parser.add_argument("--level", action="append", help="e.g. error, warning, info (repeatable)")
    parser.add_argument("--type", dest="log_type", action="append", default=None, help="app (default), request, build")
    parser.add_argument("--keep-days", type=float, default=1.0, help="delete downloads older than this (default 1)")
    parser.add_argument("--out-dir", type=Path, default=LOG_DIR)
    parser.add_argument("--api-key", default=os.getenv("RENDER_API_KEY"))
    parser.add_argument("--owner-id", default=os.getenv("RENDER_OWNER_ID"))
    parser.add_argument("--service-id", default=os.getenv("RENDER_SERVICE_ID"))
    args = parser.parse_args(argv)

    missing = [n for n, v in (("RENDER_API_KEY", args.api_key), ("RENDER_OWNER_ID", args.owner_id),
                              ("RENDER_SERVICE_ID", args.service_id)) if not v]
    if missing:
        parser.error(f"set {', '.join(missing)} (env vars or flags)")

    for path in cleanup(args.out_dir, args.keep_days):
        print(f"deleted old download {path.name}")

    end = args.end or datetime.now(timezone.utc)
    start = args.start or end - args.since
    args.out_dir.mkdir(parents=True, exist_ok=True)
    out = args.out_dir / f"{FILE_PREFIX}{args.service_id}_{end:%Y%m%d-%H%M%S}.log"

    headers = {"Authorization": f"Bearer {args.api_key}", "Accept": "application/json"}
    count = 0
    with httpx.Client(headers=headers, timeout=30, transport=transport) as client, out.open("w", encoding="utf-8") as f:
        f.write(f"# Render logs {args.service_id} {iso(start)} -> {iso(end)} text={args.text} level={args.level}\n")
        for entry in fetch_logs(
            client, args.owner_id, args.service_id, start, end, args.text, args.level, args.log_type or ["app"]
        ):
            f.write(format_line(entry) + "\n")
            count += 1
    print(f"{count} lines -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
