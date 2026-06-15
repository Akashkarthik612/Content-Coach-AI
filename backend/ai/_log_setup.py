"""
Shared file-based logging setup for the AI pipeline.

Call setup_ai_file_logging() once at app startup (done in router.py).
All modules under backend.ai inherit the handlers automatically via Python's
logger hierarchy — no per-module changes needed beyond importing log_style_json.

Log files written to backend/ai/logs/:
  ai_debug.log   — DEBUG+ from every AI module
  errors.log     — ERROR+ only
  style_debug.log — full style JSON dumps (written by log_style_json)
"""
import json
import logging
import pathlib

LOG_DIR = pathlib.Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

_FMT = logging.Formatter("%(asctime)s %(levelname)-8s %(name)s — %(message)s")


def setup_ai_file_logging() -> None:
    """Attach file handlers to the 'backend.ai' logger. Safe to call multiple times."""
    ai_logger = logging.getLogger("backend.ai")
    if any(isinstance(h, logging.FileHandler) for h in ai_logger.handlers):
        return  # already set up

    # All AI logs (DEBUG+) → ai_debug.log
    dh = logging.FileHandler(LOG_DIR / "ai_debug.log", encoding="utf-8")
    dh.setLevel(logging.DEBUG)
    dh.setFormatter(_FMT)
    ai_logger.addHandler(dh)

    # Errors only → errors.log
    eh = logging.FileHandler(LOG_DIR / "errors.log", encoding="utf-8")
    eh.setLevel(logging.ERROR)
    eh.setFormatter(_FMT)
    ai_logger.addHandler(eh)

    # Ensure the logger itself propagates DEBUG so handlers can see it
    ai_logger.setLevel(logging.DEBUG)


def log_style_json(logger: logging.Logger, label: str, style: dict) -> None:
    """Append a pretty-printed style JSON block to style_debug.log."""
    path = LOG_DIR / "style_debug.log"
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"\n{'='*60}\n")
        f.write(f"{label}\n")
        f.write(f"{'='*60}\n")
        f.write(json.dumps(style, indent=2, default=str))
        f.write("\n")
    logger.debug("%s — style_json keys=%s", label, list(style.keys()) if style else "EMPTY")
