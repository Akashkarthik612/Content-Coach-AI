"""Provider -> connector class registry. Adding Notion is one decorated class."""

from collections.abc import Callable
from typing import Any, ClassVar, Protocol

from sqlalchemy.orm import Session

from backend.knowledge.connectors.base import BaseConnector
from backend.knowledge.records import SourceRecord


class UnknownProviderError(LookupError):
    """No connector registered for this provider."""


class ConnectorProvider(Protocol):
    """What SyncService needs: a connector for a source. Tests pass fakes."""

    def create(self, source: SourceRecord, db: Session) -> BaseConnector: ...


class ConnectorFactory:
    _registry: ClassVar[dict[str, Any]] = {}

    @classmethod
    def register(cls, provider: str) -> Callable[[type], type]:
        def decorator(connector_cls: type) -> type:
            connector_cls.provider = provider
            cls._registry[provider] = connector_cls
            return connector_cls

        return decorator

    @classmethod
    def create(cls, source: SourceRecord, db: Session) -> BaseConnector:
        """Registered classes expose `build(source, db)` to wire their own deps."""
        connector_cls = cls._registry.get(source.provider)
        if connector_cls is None:
            raise UnknownProviderError(source.provider)
        return connector_cls.build(source, db)
