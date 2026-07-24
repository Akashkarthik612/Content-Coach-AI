"""Integration tests for /api/profile routes."""

import pytest

from backend.core.dependencies import get_current_user


@pytest.fixture
def authed_client(test_client, test_user):
    from backend.main import app
    app.dependency_overrides[get_current_user] = lambda: test_user
    yield test_client
    app.dependency_overrides.pop(get_current_user, None)


_CREATE_PAYLOAD = {
    "industry": "saas",
    "role": "Product Manager",
    "target_audience": "B2B founders",
    "writing_style": "direct, no fluff",
}


class TestProfileRoutes:
    async def test_create_profile_201(self, authed_client):
        r = await authed_client.post("/api/profile", json=_CREATE_PAYLOAD)
        assert r.status_code == 201
        body = r.json()
        assert body["industry"] == "saas"
        assert body["linkedin_headline"] is None
        assert body["linkedin_about"] is None

    async def test_create_profile_without_headline_and_about_201(self, authed_client):
        r = await authed_client.post("/api/profile", json=_CREATE_PAYLOAD)
        assert r.status_code == 201
        body = r.json()
        assert body["linkedin_headline"] is None
        assert body["linkedin_about"] is None

    async def test_get_profile_before_create_404(self, authed_client):
        r = await authed_client.get("/api/profile")
        assert r.status_code == 404

    async def test_get_profile_after_create_200(self, authed_client):
        await authed_client.post("/api/profile", json=_CREATE_PAYLOAD)
        r = await authed_client.get("/api/profile")
        assert r.status_code == 200
        assert r.json()["industry"] == "saas"

    async def test_duplicate_create_409(self, authed_client):
        await authed_client.post("/api/profile", json=_CREATE_PAYLOAD)
        r = await authed_client.post("/api/profile", json=_CREATE_PAYLOAD)
        assert r.status_code == 409

    async def test_patch_partial_update_200(self, authed_client):
        await authed_client.post("/api/profile", json=_CREATE_PAYLOAD)
        r = await authed_client.patch("/api/profile", json={"industry": "fintech"})
        assert r.status_code == 200
        body = r.json()
        assert body["industry"] == "fintech"
        assert body["role"] == "Product Manager"
