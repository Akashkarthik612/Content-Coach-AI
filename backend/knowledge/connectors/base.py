"""The connector contract. A connector knows one provider's API and nothing
about chunks or the database; SyncService drives it.

A connector is built for one source (ConnectorFactory.create), so the four
methods take no source argument. Errors tell the sync what to do:
  TransientConnectorError -> stop the run, keep the cursor, retry next run;
  CursorExpiredError      -> fall back to a full listing in the same run;
  AuthRevokedError        -> stop; the user must reconnect;
  PermanentFileError      -> this file failed, carry on;
  FileGoneError           -> this file is gone or no longer shared: delete it.
"""

from abc import ABC, abstractmethod

from backend.knowledge.errors import PermanentFileError, TransientSyncError
from backend.knowledge.records import ChangeBatch, FetchedDocument, FileMeta, SourceRecord

__all__ = [
    "AuthRevokedError",
    "BaseConnector",
    "CursorExpiredError",
    "FileGoneError",
    "PermanentFileError",
    "RateLimitedError",
    "TransientConnectorError",
]


class TransientConnectorError(TransientSyncError):
    """Network trouble, 5xx, or a listing the provider refused."""


class RateLimitedError(TransientConnectorError):
    """429, or Drive's 403 rateLimitExceeded/userRateLimitExceeded."""


class CursorExpiredError(Exception):
    """The provider no longer accepts our cursor (Drive: 410 / invalid page token)."""


class AuthRevokedError(Exception):
    """The refresh token was revoked or expired (Testing-mode Google apps
    expire them after 7 days). Only reconnecting fixes it."""


class FileGoneError(Exception):
    """The file was deleted or we lost access to it."""


class BaseConnector(ABC):
    provider: str

    def __init__(self, source: SourceRecord) -> None:
        self.source = source

    @abstractmethod
    async def initial_cursor(self) -> str:
        """Cursor for "now". Taken BEFORE full_listing so nothing changed
        during the listing is missed (Dust's getStartPageToken order)."""

    @abstractmethod
    async def full_listing(self) -> list[FileMeta]:
        """Every supported file in the selection, deduplicated."""

    @abstractmethod
    async def list_changes(self, cursor: str) -> ChangeBatch:
        """What changed since `cursor`, mapped onto the selection."""

    @abstractmethod
    async def fetch(self, meta: FileMeta) -> FetchedDocument:
        """Download one file as text."""
