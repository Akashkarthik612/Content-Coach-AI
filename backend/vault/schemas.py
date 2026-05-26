from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.vault.models import PostStatus


# ── Folder ────────────────────────────────────────────────────────────────────

class FolderCreate(BaseModel):
    name: str
    description: Optional[str] = None


class FolderResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Post ──────────────────────────────────────────────────────────────────────

class PostCreate(BaseModel):
    title: str
    folder_id: Optional[UUID] = None


class PostResponse(BaseModel):
    id: UUID
    folder_id: Optional[UUID]
    title: str
    status: PostStatus
    is_pinned: bool
    current_version: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PostListResponse(BaseModel):
    """Lightweight post row — no version content."""
    id: UUID
    folder_id: Optional[UUID]
    title: str
    status: PostStatus
    is_pinned: bool
    current_version: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Version ───────────────────────────────────────────────────────────────────

class VersionSave(BaseModel):
    content: str
    version_label: Optional[str] = None
    source: str = "manual"


class VersionResponse(BaseModel):
    id: UUID
    post_id: UUID
    version_number: int
    # model column is change_summary; API surface is version_label
    version_label: Optional[str] = Field(None, validation_alias="change_summary")
    content: str
    source: Optional[str]
    char_count: Optional[int]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class VersionListResponse(BaseModel):
    """Lightweight version row — no content field."""
    id: UUID
    post_id: UUID
    version_number: int
    version_label: Optional[str] = Field(None, validation_alias="change_summary")
    char_count: Optional[int]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ── Mutations ─────────────────────────────────────────────────────────────────

class FolderRename(BaseModel):
    name: str

class PostRename(BaseModel):
    title: str

class PostPin(BaseModel):
    is_pinned: bool

class VersionRename(BaseModel):
    version_label: str


# ── Search ────────────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    post_id: UUID
    title: str
    folder_id: Optional[UUID]
    matched_version_id: Optional[UUID]
    updated_at: datetime
