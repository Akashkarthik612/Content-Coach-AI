import logging
from uuid import UUID

import jwt
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from backend.auth.base_auth import AuthenticatedUser, BaseAuthProvider
from backend.auth.models import User
from backend.core.config import settings

logger = logging.getLogger(__name__)

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
        if user:
            return user
        logger.info("Provisioning shadow user row: user_id=%s", user_id)
        user = User(id=user_id, email=identity.email, username=identity.username)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
