from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID

from backend.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """Shadow row mirroring a Supabase identity, keyed on the same UUID Supabase issues."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True)
    username = Column(Text, nullable=True, unique=True)
    email = Column(Text, nullable=True, unique=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )
