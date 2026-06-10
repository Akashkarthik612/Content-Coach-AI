"""Integration tests for POST /api/auth/register and /api/auth/login."""

import uuid
import pytest


@pytest.fixture
def reg_payload():
    suffix = uuid.uuid4().hex[:6]
    return {
        "username": f"user_{suffix}",
        "email":    f"user_{suffix}@example.com",
        "password": "testpassword123",
    }


class TestRegister:
    async def test_register_returns_201(self, test_client, reg_payload):
        r = await test_client.post("/api/auth/register", json=reg_payload)
        assert r.status_code == 201
        body = r.json()
        assert "user_id" in body
        assert body["username"] == reg_payload["username"]
        assert body["email"] == reg_payload["email"]

    async def test_register_duplicate_username_returns_409(self, test_client, reg_payload):
        await test_client.post("/api/auth/register", json=reg_payload)
        second = {**reg_payload, "email": "other@example.com"}
        r = await test_client.post("/api/auth/register", json=second)
        assert r.status_code == 409

    async def test_register_duplicate_email_returns_409(self, test_client, reg_payload):
        await test_client.post("/api/auth/register", json=reg_payload)
        second = {**reg_payload, "username": f"other_{uuid.uuid4().hex[:6]}"}
        r = await test_client.post("/api/auth/register", json=second)
        assert r.status_code == 409


class TestLogin:
    async def test_login_valid_returns_200(self, test_client, reg_payload):
        await test_client.post("/api/auth/register", json=reg_payload)
        r = await test_client.post("/api/auth/login", json={
            "username": reg_payload["username"],
            "password": reg_payload["password"],
        })
        assert r.status_code == 200
        assert "user_id" in r.json()

    async def test_login_wrong_password_returns_401(self, test_client, reg_payload):
        await test_client.post("/api/auth/register", json=reg_payload)
        r = await test_client.post("/api/auth/login", json={
            "username": reg_payload["username"],
            "password": "wrong_password",
        })
        assert r.status_code == 401

    async def test_login_unknown_user_returns_401(self, test_client):
        r = await test_client.post("/api/auth/login", json={
            "username": "ghost_user_xyz",
            "password": "doesntmatter",
        })
        assert r.status_code == 401
