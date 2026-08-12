import logging
from uuid import UUID

import jwt
from jwt import PyJWKClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.auth.base_auth import AuthenticatedUser, BaseAuthProvider
from backend.auth.models import User
from backend.core.config import settings

logger = logging.getLogger(__name__)

_USERNAME_CONSTRAINT = "uq_users_username"


def _is_username_collision(exc: IntegrityError) -> bool:
    orig = getattr(exc, "orig", None)
    constraint_name = getattr(getattr(orig, "diag", None), "constraint_name", None)
    if constraint_name:
        return constraint_name == _USERNAME_CONSTRAINT
    # Fallback for DB-APIs that don't expose `.diag` (e.g. sqlite, used in tests) —
    # every driver's IntegrityError message names the offending column/constraint.
    message = str(orig or exc)
    return _USERNAME_CONSTRAINT in message or "users.username" in message


# Singleton (same pattern as the `_llm` module-level instances elsewhere) — PyJWKClient
# caches Supabase's public signing keys internally so most calls don't hit the network.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


class SupabaseAuth(BaseAuthProvider):
    """Verifies a Supabase-issued JWT against the project's public JWT signing keys
    (ES256 — Supabase's current asymmetric key system, fetched via its JWKS endpoint;
    no shared secret needed on this side)."""

    @staticmethod
    def verify_token(token: str) -> AuthenticatedUser:
        try:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience="authenticated",
            )
        except jwt.PyJWTError as exc:
            raise ValueError("Invalid or expired token") from exc

        return AuthenticatedUser(
            id=payload["sub"],
            email=payload.get("email"),
            username=(payload.get("user_metadata") or {}).get("username"),
        )


class UserSyncService:
    """Keeps the local `users` shadow row in sync with a verified identity.
    Never validates credentials — that's SupabaseAuth's job."""

    @staticmethod
    def get_or_create(db: Session, identity: AuthenticatedUser) -> User:
        user_id = UUID(identity.id)
        user = db.get(User, user_id)
        if user is None:
            logger.info("Provisioning shadow user row: user_id=%s", user_id)
            user = User(id=user_id, email=identity.email, username=identity.username)
            db.add(user)
            try:
                db.commit()
            except IntegrityError as exc:
                db.rollback()
                if _is_username_collision(exc):
                    # Another user already holds this username (a pre-existing bad
                    # row, or two signups landing in the same instant — new signups
                    # are now blocked earlier by AuthAvailabilityService). Never let
                    # this block the request: every authenticated route depends on
                    # this method succeeding, so provision without the username
                    # rather than 500ing the user's entire session.
                    logger.warning(
                        "Shadow username collision, provisioning without it: user_id=%s username=%r",
                        user_id, identity.username,
                    )
                    user = User(id=user_id, email=identity.email, username=None)
                    db.add(user)
                    db.commit()
                    db.refresh(user)
                    return user
                # Concurrent request already inserted this user between our
                # get() check and this commit (the frontend fires several
                # authenticated requests in parallel on page load) — fall
                # back to reading it instead of crashing.
                user = db.get(User, user_id)
                if user is None:
                    raise
                return user
            db.refresh(user)
            return user

        # Self-heal: the JWT is the source of truth (e.g. after a user
        # confirms an email change or updates their username via Supabase),
        # but this row is only ever written once on first sight otherwise —
        # re-sync on every call so a change made in Supabase actually shows
        # up here on the user's next authenticated request. Email and username
        # are committed separately so a username collision can never block a
        # legitimate email sync (or vice versa).
        if identity.email and user.email != identity.email:
            user.email = identity.email
            logger.info("Synced email from JWT claims: user_id=%s", user_id)
            db.commit()
            db.refresh(user)

        if identity.username and user.username != identity.username:
            user.username = identity.username
            logger.info("Synced username from JWT claims: user_id=%s", user_id)
            try:
                db.commit()
            except IntegrityError as exc:
                db.rollback()
                if not _is_username_collision(exc):
                    raise
                # Someone else already holds the new username — keep this
                # user's previously-stored value rather than aborting.
                logger.warning(
                    "Self-heal username collision, keeping stored value: user_id=%s username=%r",
                    user_id, identity.username,
                )
                db.refresh(user)
            else:
                db.refresh(user)
        return user


class AuthAvailabilityService:
    """Pre-signup uniqueness check — lets the frontend reject a taken
    username/email before ever calling Supabase's signUp(), instead of
    discovering the collision later when UserSyncService provisions the
    shadow row."""

    @staticmethod
    def check(db: Session, username: str | None, email: str | None) -> tuple[bool, bool]:
        username_available = True
        if username:
            username_available = db.query(User).filter(User.username == username).first() is None

        email_available = True
        if email:
            email_available = db.query(User).filter(User.email == email).first() is None

        return username_available, email_available
