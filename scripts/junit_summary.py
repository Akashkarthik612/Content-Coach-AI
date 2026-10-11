"""Render a pytest JUnit XML report as a Markdown table for the GitHub
Actions job summary.

    python scripts/junit_summary.py reports/backend.xml >> "$GITHUB_STEP_SUMMARY"
"""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ICONS = {"passed": "✅ passed", "failed": "❌ failed", "error": "💥 error", "skipped": "⏭️ skipped"}


def _outcome(case: ET.Element) -> str:
    for tag in ("failure", "error", "skipped"):
        if case.find(tag) is not None:
            return {"failure": "failed"}.get(tag, tag)
    return "passed"


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def render(report: Path) -> str:
    if not report.exists():
        return f"### Backend tests\n\nNo report at `{report}` — pytest did not run to completion.\n"
    cases = list(ET.parse(report).getroot().iter("testcase"))
    rows = []
    totals: dict[str, int] = {}
    for case in cases:
        outcome = _outcome(case)
        totals[outcome] = totals.get(outcome, 0) + 1
        name = f"{case.get('classname', '')}::{case.get('name', '')}"
        rows.append(f"| {_cell(name)} | {ICONS[outcome]} | {float(case.get('time', 0)):.2f}s |")
    summary = ", ".join(f"{n} {k}" for k, n in sorted(totals.items())) or "no tests"
    return "\n".join(
        [
            "### Backend tests",
            "",
            f"**{len(cases)} tests:** {summary}",
            "",
            "| Test | Result | Time |",
            "|---|---|---|",
            *rows,
            "",
        ]
    )


if __name__ == "__main__":
    sys.stdout.write(render(Path(sys.argv[1])))
