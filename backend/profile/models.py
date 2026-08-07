import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from backend.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserProfile(Base):
    __tablename__ = "user_profile"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    profession = Column(Text, nullable=True)
    industry = Column(Text, nullable=True)
    role = Column(Text, nullable=True)
    target_audience = Column(Text, nullable=True)
    writing_style = Column(Text, nullable=True)
    goals = Column(JSONB, nullable=False, default=list, server_default="'[]'::jsonb")
    topics = Column(JSONB, nullable=False, default=list, server_default="'[]'::jsonb")
    formatting_prefs = Column(JSONB, nullable=False, default=dict, server_default="'{}'::jsonb")
    linkedin_headline = Column(Text, nullable=True)
    linkedin_about = Column(Text, nullable=True)
    # Schedule page's weekly-posts goal (1-7); nullable — the frontend falls
    # back to a default of 4 when unset, same as it did before this existed.
    weekly_post_target = Column(Integer, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default="now()",
    )
