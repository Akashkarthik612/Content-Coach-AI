"""Supabase Auth integration.

Supabase handles sign-up/sign-in (email + password, Google OAuth) entirely on its
side; the frontend gets a JWT from supabase-js and sends it as `Authorization:
Bearer <token>`. This backend only:
  1. verifies that JWT against Supabase's public signing keys (JWKS), and
  2. makes sure a matching row exists in our `users` table (keyed on the JWT `sub`).
No passwords or OAuth secrets ever touch this code.
"""

import logging
from dataclasses import dataclass
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.auth.models import User
from backend.core.config import settings
from backend.core.database import get_db

logger = logging.getLogger(__name__)

# Supabase signs user access tokens with an asymmetric key (ES256 by default,
# RS256 if configured). HS256 is deliberately not accepted — that would require
# the shared JWT secret on this side.
_ALLOWED_ALGORITHMS = ["ES256", "RS256"]
_AUDIENCE = "authenticated"


class AuthError(Exception):
    """Token missing, malformed, expired, or not issued by our Supabase project."""


@dataclass(frozen=True)
class SupabaseIdentity:
    """The verified claims we care about from a Supabase access token."""

    user_id: UUID
    email: str | None


# PyJWKClient caches Supabase's public keys in memory, so only the first request
# (and key rotations) hit the network. Created lazily so importing this module
# never needs SUPABASE_URL to be set (e.g. in tests or alembic).
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not settings.SUPABASE_URL:
            raise RuntimeError("SUPABASE_URL is not configured")
        _jwks_client = PyJWKClient(
            f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            lifespan=3600,
        )
    return _jwks_client


class SupabaseAuthService:
    @staticmethod
    def verify_token(token: str) -> SupabaseIdentity:
        """Validate signature, expiry, audience and issuer; return the identity."""
        try:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=_ALLOWED_ALGORITHMS,
                audience=_AUDIENCE,
                issuer=f"{settings.SUPABASE_URL}/auth/v1",
                options={"require": ["exp", "sub", "aud", "iss"]},
            )
            user_id = UUID(payload["sub"])
        except (jwt.PyJWTError, ValueError) as exc:
            raise AuthError("Invalid or expired token") from exc

        return SupabaseIdentity(user_id=user_id, email=payload.get("email"))

    @staticmethod
    def get_or_create_user(db: Session, identity: SupabaseIdentity) -> User:
        """Return the `users` row for this identity, creating it on first sight.

        Uses INSERT ... ON CONFLICT DO NOTHING so parallel first requests (the
        frontend fires several on page load) can't race into a duplicate-key error.
        """
        user = db.get(User, identity.user_id)

        if user is None:
            db.execute(
                insert(User)
                .values(id=identity.user_id, email=identity.email)
                .on_conflict_do_nothing()
            )
            db.commit()
            user = db.get(User, identity.user_id)
            if user is None:
                # Conflict wasn't on `id` — the email belongs to a different user
                # row (e.g. account deleted and re-created in Supabase with a new
                # UUID while the old app row survived). Needs manual cleanup.
                logger.error(
                    "User provisioning blocked by email conflict: user_id=%s",
                    identity.user_id,
                )
                raise AuthError("Account conflict; contact support")
            logger.info("Provisioned user row: user_id=%s", identity.user_id)
            return user

        # The JWT is the source of truth for email (it changes when a user confirms
        # an email change in Supabase), so keep our copy in sync.
        if identity.email and user.email != identity.email:
            user.email = identity.email
            db.commit()
            logger.info("Synced email from token: user_id=%s", identity.user_id)

        return user

    @staticmethod
    def delete_account(db: Session, user_id: UUID) -> None:
        """Delete a user's app data, then their Supabase identity.

        Local row goes first: `users.email` is unique in our DB, and that's what
        actually blocks re-signup, so it must be freed even if the Supabase call
        below fails. Deleting the local row cascades to posts, analytics, style
        memory, LinkedIn connection, and profile (all FK -> users ON DELETE CASCADE).
        """
        user = db.get(User, user_id)
        if user is not None:
            db.delete(user)
            db.commit()

        try:
            response = httpx.delete(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers={
                    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                },
                timeout=10.0,
            )
            response.raise_for_status()
        except httpx.HTTPError:
            # Local row is already gone (no duplicate-email risk); the Supabase
            # identity is left for manual/retried cleanup.
            logger.error(
                "Failed to delete Supabase identity: user_id=%s", user_id, exc_info=True
            )


class AuthAvailabilityService:
    @staticmethod
    def check(
        db: Session, username: str | None, email: str | None
    ) -> tuple[bool, bool]:
        """Pre-signup check so the frontend can reject a taken username/email
        before calling Supabase's signUp() — see `POST /api/auth/availability`."""
        username_taken = bool(username) and (
            db.query(User).filter(User.username == username).first() is not None
        )
        email_taken = bool(email) and (
            db.query(User).filter(User.email == email).first() is not None
        )
        return not username_taken, not email_taken


# auto_error=False so a missing header returns our 401 instead of FastAPI's 403.
_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency: `user: User = Depends(get_current_user)` on any route."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        identity = SupabaseAuthService.verify_token(credentials.credentials)
        return SupabaseAuthService.get_or_create_user(db, identity)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
