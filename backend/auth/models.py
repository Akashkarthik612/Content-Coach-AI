import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID

from backend.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    username = Column(Text, nullable=False, unique=True)
    email = Column(Text, nullable=True, unique=True)
    password_hash = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )
