"""Unit tests for auth/service.py — UserService and PasswordAuth."""

import pytest
import bcrypt
from fastapi import HTTPException

from backend.auth.service import UserService, PasswordAuth
from backend.auth.schemas import RegisterRequest, LoginRequest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _register(db, username="alice", email="alice@example.com", password="secret123"):
    svc = UserService(db)
    return svc.register(username=username, email=email, password=password)


# ---------------------------------------------------------------------------
# PasswordAuth
# ---------------------------------------------------------------------------

class TestPasswordAuth:
    def test_validate_correct_password(self):
        hashed = bcrypt.hashpw(b"mypassword", bcrypt.gensalt()).decode()
        auth = PasswordAuth(plain_password="mypassword", hashed_password=hashed)
        assert auth.validate() is True

    def test_validate_wrong_password(self):
        hashed = bcrypt.hashpw(b"mypassword", bcrypt.gensalt()).decode()
        auth = PasswordAuth(plain_password="wrongpass", hashed_password=hashed)
        assert auth.validate() is False


# ---------------------------------------------------------------------------
# UserService.register
# ---------------------------------------------------------------------------

class TestRegister:
    def test_register_creates_user(self, db_session):
        user = _register(db_session)
        assert user.id is not None
        assert user.username == "alice"
        assert user.email == "alice@example.com"

    def test_register_hashes_password(self, db_session):
        user = _register(db_session)
        assert user.password_hash != "secret123"
        assert bcrypt.checkpw(b"secret123", user.password_hash.encode())

    def test_register_duplicate_username_raises_409(self, db_session):
        _register(db_session, username="bob", email="bob1@example.com")
        with pytest.raises(HTTPException) as exc_info:
            _register(db_session, username="bob", email="bob2@example.com")
        assert exc_info.value.status_code == 409

    def test_register_duplicate_email_raises_409(self, db_session):
        _register(db_session, username="carol1", email="carol@example.com")
        with pytest.raises(HTTPException) as exc_info:
            _register(db_session, username="carol2", email="carol@example.com")
        assert exc_info.value.status_code == 409


# ---------------------------------------------------------------------------
# UserService.login
# ---------------------------------------------------------------------------

class TestLogin:
    def test_login_valid_credentials_returns_user(self, db_session):
        _register(db_session, username="dave", email="dave@example.com", password="pass123")
        svc = UserService(db_session)
        user = svc.login(username="dave", password="pass123")
        assert user.username == "dave"

    def test_login_wrong_password_raises_401(self, db_session):
        _register(db_session, username="eve", email="eve@example.com", password="correct")
        svc = UserService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            svc.login(username="eve", password="wrong")
        assert exc_info.value.status_code == 401

    def test_login_unknown_username_raises_401(self, db_session):
        svc = UserService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            svc.login(username="nobody_exists", password="any")
        assert exc_info.value.status_code == 401
