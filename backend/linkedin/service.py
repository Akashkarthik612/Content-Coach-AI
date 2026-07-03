from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.linkedin.api_client import LinkedInAPIClient
from backend.linkedin.models import LinkedInAuth
from backend.linkedin.schemas import ConnectionStatusResponse, PublishResponse

_LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
_LINKEDIN_SCOPES = "openid profile email w_member_social"


class LinkedInConnectService:
    """All LinkedIn OAuth + publish logic. Static methods — no instance state needed."""

    @staticmethod
    def get_auth_url(state: str) -> str:
        """Build the LinkedIn OAuth authorization URL.

        state = user_id (UUID string) so the callback can identify the user
        without relying on headers (browser redirect — headers can't be set).
        """
        params = urlencode({
            "response_type": "code",
            "client_id": settings.LINKEDIN_CLIENT_ID,
            "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
            "scope": _LINKEDIN_SCOPES,
            "state": state,
        })
        return f"{_LINKEDIN_AUTH_URL}?{params}"

    @staticmethod
    def handle_oauth_callback(db: Session, code: str, state: str) -> LinkedInAuth:
        """Exchange OAuth code for token, fetch profile, UPSERT into linkedin_auth.

        state = user_id sent by us — validated against users table (edge case 8).
        Checks that w_member_social was granted (edge case 9).
        UPSERTs so reconnecting overwrites the old token (edge case 10).
        """
        from backend.auth.models import User  # local import avoids circular

        # Edge case 8: validate state is a known user
        try:
            user_id = UUID(state)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid OAuth state")
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=400, detail="Invalid OAuth state")

        # Exchange code → access token
        token_data = LinkedInAPIClient.exchange_code(code)
        access_token = token_data["access_token"]
        expires_in = token_data.get("expires_in", 5184000)  # default 60 days
        granted_scope = token_data.get("scope", "")

        # Edge case 9: verify posting permission was granted
        if "w_member_social" not in granted_scope:
            raise HTTPException(
                status_code=403,
                detail="LinkedIn posting permission not granted. Please reconnect and allow posting.",
            )

        # Fetch profile (sub → linkedin_id, name, email, picture)
        profile = LinkedInAPIClient.get_userinfo(access_token)
        linkedin_id = profile["sub"]
        linkedin_urn = f"urn:li:person:{linkedin_id}"
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        # Edge case 10: UPSERT — update if row for user_id already exists
        record = db.query(LinkedInAuth).filter(LinkedInAuth.user_id == user_id).first()
        if record:
            record.linkedin_id = linkedin_id
            record.linkedin_urn = linkedin_urn
            record.access_token = access_token
            record.token_type = token_data.get("token_type", "Bearer")
            record.expires_at = expires_at
            record.scope = granted_scope
            record.display_name = profile.get("name", "")
            record.email = profile.get("email")
            record.profile_image_url = profile.get("picture")
            record.updated_at = datetime.now(timezone.utc)
        else:
            record = LinkedInAuth(
                user_id=user_id,
                linkedin_id=linkedin_id,
                linkedin_urn=linkedin_urn,
                access_token=access_token,
                token_type=token_data.get("token_type", "Bearer"),
                expires_at=expires_at,
                scope=granted_scope,
                display_name=profile.get("name", ""),
                email=profile.get("email"),
                profile_image_url=profile.get("picture"),
            )
            db.add(record)

        db.commit()
        db.refresh(record)
        return record

    @staticmethod
    def get_token(db: Session, user_id: UUID) -> LinkedInAuth | None:
        """Return the stored LinkedIn auth record for this user, or None."""
        return db.query(LinkedInAuth).filter(LinkedInAuth.user_id == user_id).first()

    @staticmethod
    def is_connected(db: Session, user_id: UUID) -> bool:
        """True only if a non-expired token exists for this user."""
        record = LinkedInConnectService.get_token(db, user_id)
        if not record:
            return False
        return record.expires_at.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc)

    @staticmethod
    def get_connection_status(db: Session, user_id: UUID) -> ConnectionStatusResponse:
        """Return connection status + display info for the frontend."""
        record = LinkedInConnectService.get_token(db, user_id)
        if not record:
            return ConnectionStatusResponse(connected=False)
        connected = record.expires_at.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc)
        return ConnectionStatusResponse(
            connected=connected,
            display_name=record.display_name,
            profile_image_url=record.profile_image_url,
            expires_at=record.expires_at,
        )

    @staticmethod
    def disconnect(db: Session, user_id: UUID) -> None:
        """Delete the user's LinkedIn token. They'll need to re-auth to publish."""
        record = LinkedInConnectService.get_token(db, user_id)
        if record:
            db.delete(record)
            db.commit()

    @staticmethod
    def publish_or_auth(
        db: Session,
        user_id: UUID,
        post_id: UUID,
        version_id: UUID,
        content: str,
    ) -> PublishResponse:
        """Core publish method. Returns PublishResponse.

        Cases:
          A (happy path) — valid token → publish → log → return published=True
          B (no token)   → return needs_auth=True + auth_url
          C (expired)    → return needs_auth=True + reason=token_expired
        Edge cases 3-7 handled inside.
        """
        # Edge case 4: content length guard
        if len(content) > 3000:
            raise HTTPException(
                status_code=400,
                detail=f"Content exceeds LinkedIn's 3000 character limit ({len(content)} chars)",
            )

        # Case B: no token
        record = LinkedInConnectService.get_token(db, user_id)
        if not record:
            return PublishResponse(
                published=False,
                needs_auth=True,
                auth_url=LinkedInConnectService.get_auth_url(str(user_id)),
                reason="not_connected",
            )

        # Case C: token expired
        if record.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
            return PublishResponse(
                published=False,
                needs_auth=True,
                auth_url=LinkedInConnectService.get_auth_url(str(user_id)),
                reason="token_expired",
            )

        # Edge case 5: duplicate publish guard (same post + platform within 60s)
        from backend.vault.models import PostPublishLog  # local import
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=60)
        existing = (
            db.query(PostPublishLog)
            .filter(
                PostPublishLog.post_id == post_id,
                PostPublishLog.platform == "linkedin",
                PostPublishLog.published_at >= cutoff,
            )
            .first()
        )
        if existing:
            return PublishResponse(
                published=True,
                duplicate=True,
                published_at=existing.published_at,
            )

        # Case A: publish to LinkedIn
        try:
            result = LinkedInAPIClient.create_post(
                access_token=record.access_token,
                linkedin_urn=record.linkedin_urn,
                content=content,
            )
        except HTTPException as exc:
            if exc.status_code == 401:
                # Edge case 3: token revoked on LinkedIn — clean up and re-auth
                LinkedInConnectService.disconnect(db, user_id)
                return PublishResponse(
                    published=False,
                    needs_auth=True,
                    auth_url=LinkedInConnectService.get_auth_url(str(user_id)),
                    reason="token_revoked",
                )
            raise  # 429 and 502 bubble up as-is

        # Log the publish
        now = datetime.now(timezone.utc)
        log_entry = PostPublishLog(
            post_id=post_id,
            version_id=version_id,
            platform="linkedin",
            published_at=now,
        )
        db.add(log_entry)
        db.commit()

        return PublishResponse(
            published=True,
            linkedin_post_id=result.get("id"),
            published_at=now,
        )
