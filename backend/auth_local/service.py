import logging
import uuid

import bcrypt
from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.auth.models import User

logger = logging.getLogger(__name__)


class PasswordAuth:
    """
    Validates a plain-text password against a stored bcrypt hash.
    One instance per login attempt — no shared state between users.
    Not a BaseAuthProvider — that ABC's verify_token(token) contract is
    Supabase-specific (stateless, token-in/identity-out); local auth
    validates a password against a DB row instead, a different shape.
    """

    def __init__(self, plain_password: str, hashed_password: str):
        self._plain = plain_password
        self._hashed = hashed_password

    def validate(self) -> bool:
        return bcrypt.checkpw(self._plain.encode(), self._hashed.encode())


class LocalUserService:
    """
    Dev-only local auth business logic (bcrypt + DB row), isolated from the
    Supabase-backed backend.auth package. Router creates one instance per
    request, passing the DB session in.
    """

    def __init__(self, db: Session):
        self.db = db

    # ── Public API ─────────────────────────────────────────────────────────────

    def register(self, username: str, email: str, password: str) -> User:
        logger.info("Registering local user: username=%s", username)
        self._assert_username_free(username)
        self._assert_email_free(email)
        user = User(
            id=uuid.uuid4(),  # Supabase normally issues this; local auth mints its own
            username=username,
            email=email,
            password_hash=self._hash(password),
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        logger.info("Local user registered: user_id=%s username=%s", user.id, user.username)
        return user

    def login(self, identifier: str, password: str) -> User:
        # `identifier` may be a username OR an email — the frontend's login form only
        # collects email (there's no username field on that screen), while register
        # collects both as separate values, so login must match either column.
        logger.debug("Local login attempt: identifier=%s", identifier)
        user = (
            self.db.query(User)
            .filter(or_(User.username == identifier, User.email == identifier))
            .first()
        )
        if not user or not user.password_hash:
            logger.warning("Local login failed: identifier=%s not found or has no local password", identifier)
            raise HTTPException(status_code=401, detail="Invalid credentials")

        auth = PasswordAuth(plain_password=password, hashed_password=user.password_hash)
        if not auth.validate():
            logger.warning("Local login failed: wrong password for identifier=%s", identifier)
            raise HTTPException(status_code=401, detail="Invalid credentials")

        logger.info("Local login success: user_id=%s", user.id)
        return user

    # ── Private helpers ────────────────────────────────────────────────────────

    def _assert_username_free(self, username: str) -> None:
        if self.db.query(User).filter(User.username == username).first():
            logger.warning("Local registration rejected: username=%s already taken", username)
            raise HTTPException(status_code=409, detail="Username already taken")

    def _assert_email_free(self, email: str) -> None:
        if self.db.query(User).filter(User.email == email).first():
            logger.warning("Local registration rejected: email already registered")
            raise HTTPException(status_code=409, detail="Email already registered")

    @staticmethod
    def _hash(password: str) -> str:
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
