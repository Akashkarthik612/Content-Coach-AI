class SourceNotFoundError(Exception):
    """No source with this id for this user (never existed, belongs to someone
    else, or was deleted mid-sync)."""


class StaleDiffError(Exception):
    """The stored document changed after the diff was computed (another sync
    applied first). Nothing was written; recompute the diff and retry."""


class InvalidVectorError(ValueError):
    """Wrong dimension, or a zero vector (cosine distance would be NaN)."""


# ── ingestion (Day 5 Part B) ──────────────────────────────────────────────────
# Two kinds of failure drive the sync's error policy (B-D10):
#   transient → stop the run, keep the cursor, retry next run;
#   permanent (one file) → mark that file failed, continue, cursor advances.


class TransientSyncError(Exception):
    """Something outside our control failed (network, rate limit, 5xx). The
    whole run stops and the cursor is kept, so the next run retries."""


class EmbeddingUnavailableError(TransientSyncError):
    """The embedding API is down, rate-limited, or returned a malformed batch."""


class PermanentFileError(Exception):
    """This one file can't be ingested (unsupported, too large, unparseable,
    empty). Retrying won't help until the file itself changes."""


class PrefixTooLongError(PermanentFileError):
    """Headings take half the chunk budget or more (Dust's splitter guard)."""


class LeaseLostError(Exception):
    """Another run took this source's sync lease (ours expired). Stop now."""
