import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PostStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"
    scheduled = "scheduled"
    failed = "failed"  # scheduled post whose auto-publish attempt exhausted retries


class Post(Base):
    __tablename__ = "posts"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(Text, nullable=False)
    content = Column(Text, nullable=False, default="", server_default="")
    status = Column(
        Enum(PostStatus, name="post_status"),
        nullable=False,
        default=PostStatus.draft,
    )
    is_pinned = Column(Boolean, nullable=False, default=False, server_default="false")
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    schedule_attempts = Column(Integer, nullable=False, default=0, server_default="0")
    last_schedule_error = Column(Text, nullable=True)
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

    publish_logs = relationship("PostPublishLog", back_populates="post", lazy="selectin")


class PostAnalytics(Base):
    __tablename__ = "post_analytics"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    post_id = Column(
        UUID(as_uuid=True),
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    impressions = Column(Integer, nullable=False, default=0, server_default="0")
    reactions   = Column(Integer, nullable=False, default=0, server_default="0")
    comments    = Column(Integer, nullable=False, default=0, server_default="0")
    updated_at  = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )


class PostPublishLog(Base):
    __tablename__ = "post_publish_log"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    platform = Column(Text, nullable=False, default="linkedin", server_default="'linkedin'")
    published_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )

    post = relationship("Post", back_populates="publish_logs", lazy="selectin")
