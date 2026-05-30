import bcrypt
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.auth.base_auth import BaseAuthProvider
from backend.auth.models import User
'''THis file has the all code logics for authentification so for future refference look into this file if tehre is any problem in login. '''

class PasswordAuth(BaseAuthProvider):
    """
    Validates a plain-text password against a stored bcrypt hash.
    One instance per login attempt — no shared state between users.
    """

    def __init__(self, plain_password: str, hashed_password: str):
        self._plain  = plain_password
        self._hashed = hashed_password

    def validate(self) -> bool:
        return bcrypt.checkpw(self._plain.encode(), self._hashed.encode())


class UserService:
    """
    All user-level business logic. Router creates one instance per request,
    passing the DB session in. Nothing here touches HTTP — no Request,
    no Response, no HTTPException from routing concerns.
    """

    def __init__(self, db: Session):
        self.db = db

    # ── Public API ─────────────────────────────────────────────────────────────

    def register(self, username: str, email: str, password: str) -> User:
        self._assert_username_free(username)
        self._assert_email_free(email)
        user = User(
            username=username,
            email=email,
            password_hash=self._hash(password),
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def login(self, username: str, password: str) -> User:
        user = self.db.query(User).filter(User.username == username).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        auth = PasswordAuth(plain_password=password, hashed_password=user.password_hash)
        if not auth.validate():
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return user

    # ── Private helpers ────────────────────────────────────────────────────────

    def _assert_username_free(self, username: str) -> None:
        if self.db.query(User).filter(User.username == username).first():
            raise HTTPException(status_code=409, detail="Username already taken")

    def _assert_email_free(self, email: str) -> None:
        if self.db.query(User).filter(User.email == email).first():
            raise HTTPException(status_code=409, detail="Email already registered")

    @staticmethod
    def _hash(password: str) -> str:
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
