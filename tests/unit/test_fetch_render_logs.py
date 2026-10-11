"""scripts/fetch_render_logs.py against a fake Render API (httpx.MockTransport)."""

import argparse
import os
import time
from datetime import timedelta

import httpx
import pytest

from scripts import fetch_render_logs as frl

ENV = ["--api-key", "rnd_key", "--owner-id", "tea-1", "--service-id", "srv-1"]


def entry(i: int, level: str = "info") -> dict:
    return {
        "id": f"log-{i}",
        "message": f"knowledge sync outcome=ok n={i}\n",
        "timestamp": f"2026-10-09T10:00:0{i}Z",
        "labels": [{"name": "level", "value": level}, {"name": "instance", "value": "srv-1-abc"}],
    }


class FakeRender:
    """Two pages; records the query of every request."""

    def __init__(self, pages=None, status=200):
        self.pages = pages if pages is not None else [[entry(1), entry(2)], [entry(3, "error")]]
        self.status = status
        self.queries: list[httpx.QueryParams] = []
        self.auth: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.queries.append(request.url.params)
        self.auth.append(request.headers["authorization"])
        if self.status != 200:
            return httpx.Response(self.status, text="nope")
        i = len(self.queries) - 1
        more = i + 1 < len(self.pages)
        return httpx.Response(
            200,
            json={
                "hasMore": more,
                "nextStartTime": f"next-start-{i}",
                "nextEndTime": f"next-end-{i}",
                "logs": self.pages[i],
            },
        )


def run(tmp_path, fake, *extra):
    return frl.main([*ENV, "--out-dir", str(tmp_path), *extra], transport=httpx.MockTransport(fake))


def test_downloads_every_page_oldest_first_into_one_file(tmp_path):
    fake = FakeRender()
    assert run(tmp_path, fake, "--since", "2h", "--text", "knowledge", "--level", "error") == 0

    (out,) = tmp_path.glob("render_srv-1_*.log")
    lines = out.read_text(encoding="utf-8").splitlines()
    assert lines[0].startswith("# Render logs srv-1")
    assert lines[1:] == [
        "2026-10-09T10:00:01Z [info] [srv-1-abc] knowledge sync outcome=ok n=1",
        "2026-10-09T10:00:02Z [info] [srv-1-abc] knowledge sync outcome=ok n=2",
        "2026-10-09T10:00:03Z [error] [srv-1-abc] knowledge sync outcome=ok n=3",
    ]

    first, second = fake.queries
    assert first["ownerId"] == "tea-1" and first.get_list("resource") == ["srv-1"]
    assert first["direction"] == "forward" and first["limit"] == "100"
    assert first.get_list("text") == ["knowledge"] and first.get_list("level") == ["error"]
    assert first.get_list("type") == ["app"]
    # The next page uses exactly the cursor times the API returned.
    assert (second["startTime"], second["endTime"]) == ("next-start-0", "next-end-0")
    assert fake.auth == ["Bearer rnd_key"] * 2


def test_since_sets_the_time_window():
    assert frl.parse_since("30m") == timedelta(minutes=30)
    assert frl.parse_since("2h") == timedelta(hours=2)
    assert frl.parse_since("1d") == timedelta(days=1)
    with pytest.raises(argparse.ArgumentTypeError):
        frl.parse_since("yesterday")


def test_downloads_older_than_keep_days_are_deleted_on_every_run(tmp_path):
    old = tmp_path / "render_srv-1_20261001-000000.log"
    fresh = tmp_path / "render_srv-1_20261009-090000.log"
    unrelated = tmp_path / "notes.log"
    for path in (old, fresh, unrelated):
        path.write_text("x")
    two_days_ago = time.time() - 2 * 86400
    os.utime(old, (two_days_ago, two_days_ago))
    os.utime(unrelated, (two_days_ago, two_days_ago))

    run(tmp_path, FakeRender(pages=[[]]))

    assert not old.exists()  # older than 1 day: gone
    assert fresh.exists()
    assert unrelated.exists()  # not ours: never touched


@pytest.mark.parametrize(("status", "message"), [(401, "RENDER_API_KEY"), (404, "RENDER_SERVICE_ID")])
def test_auth_and_id_errors_say_what_to_fix(tmp_path, status, message):
    with pytest.raises(SystemExit, match=message):
        run(tmp_path, FakeRender(status=status))


def test_missing_credentials_are_reported(tmp_path, monkeypatch, capsys):
    for name in ("RENDER_API_KEY", "RENDER_OWNER_ID", "RENDER_SERVICE_ID"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(SystemExit):
        frl.main(["--out-dir", str(tmp_path)])
    assert "RENDER_API_KEY" in capsys.readouterr().err
