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
    UniqueConstraint,
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


class Folder(Base):
    __tablename__ = "folders"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )

    posts = relationship("Post", back_populates="folder", lazy="selectin")


class Post(Base):
    __tablename__ = "posts"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    folder_id = Column(UUID(as_uuid=True), ForeignKey("folders.id"), nullable=True)
    title = Column(Text, nullable=False)
    status = Column(
        Enum(PostStatus, name="post_status"),
        nullable=False,
        default=PostStatus.draft,
    )
    current_version = Column(Integer, nullable=False, default=1, server_default="1")
    is_pinned = Column(Boolean, nullable=False, default=False, server_default="false")
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
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

    folder = relationship("Folder", back_populates="posts", lazy="selectin")
    versions = relationship(
        "PostVersion",
        back_populates="post",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    tags = relationship(
        "PostTag",
        back_populates="post",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    publish_logs = relationship("PostPublishLog", back_populates="post", lazy="selectin")


class PostVersion(Base):
    __tablename__ = "post_versions"

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
    )
    version_number = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    source = Column(Text, nullable=True)
    change_summary = Column(Text, nullable=True)
    char_count = Column(Integer, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )

    __table_args__ = (
        UniqueConstraint("post_id", "version_number", name="uq_post_version"),
    )

    post = relationship("Post", back_populates="versions", lazy="selectin")
    publish_logs = relationship(
        "PostPublishLog", back_populates="version", lazy="selectin"
    )


class PostTag(Base):
    __tablename__ = "post_tags"

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
    )
    tag = Column(Text, nullable=False)

    post = relationship("Post", back_populates="tags", lazy="selectin")


class PostPublishLog(Base):
    __tablename__ = "post_publish_log"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    version_id = Column(
        UUID(as_uuid=True), ForeignKey("post_versions.id"), nullable=False
    )
    platform = Column(Text, nullable=False, default="linkedin", server_default="'linkedin'")
    published_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )

    post = relationship("Post", back_populates="publish_logs", lazy="selectin")
    version = relationship("PostVersion", back_populates="publish_logs", lazy="selectin")
