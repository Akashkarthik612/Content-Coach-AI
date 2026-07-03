import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID

from backend.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LinkedInAuth(Base):
    __tablename__ = "linkedin_auth"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    # UNIQUE: one LinkedIn account per app user
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    linkedin_id = Column(Text, nullable=False)           # LinkedIn person ID (OIDC `sub`)
    linkedin_urn = Column(Text, nullable=False)          # urn:li:person:{linkedin_id}
    access_token = Column(Text, nullable=False)          # OAuth bearer token
    token_type = Column(String(32), nullable=False, default="Bearer", server_default="'Bearer'")
    expires_at = Column(DateTime(timezone=True), nullable=False)
    scope = Column(Text, nullable=False)                 # space-separated granted scopes
    display_name = Column(Text, nullable=False)          # LinkedIn display name
    email = Column(Text, nullable=True)
    profile_image_url = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow, server_default="now()"
    )
