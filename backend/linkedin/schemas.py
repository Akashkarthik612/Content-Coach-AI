from datetime import datetime

from pydantic import BaseModel


class ConnectionStatusResponse(BaseModel):
    connected: bool
    display_name: str | None = None
    profile_image_url: str | None = None
    expires_at: datetime | None = None


class AuthUrlResponse(BaseModel):
    auth_url: str


class PublishResponse(BaseModel):
    published: bool
    needs_auth: bool = False
    auth_url: str | None = None
    reason: str | None = None          # "not_connected" | "token_expired" | "token_revoked"
    linkedin_post_id: str | None = None
    published_at: datetime | None = None
    duplicate: bool = False
