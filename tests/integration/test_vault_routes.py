"""
Integration tests for all /api/vault/* endpoints.

Level 1 Test 1 scenario is covered by test_full_routing_db_vectorization.
"""

import uuid
import pytest
from unittest.mock import MagicMock, AsyncMock
from sqlalchemy import text

from backend.core.dependencies import get_current_user


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def patch_background_tasks(monkeypatch):
    """Replace background tasks that call Gemini so vault routes work without the API."""
    monkeypatch.setattr("backend.vault.router.sync_invalidate_user_tool_cache", MagicMock())
    monkeypatch.setattr("backend.vault.router.sync_check_and_refresh_style_memory", MagicMock())
    monkeypatch.setattr("backend.vault.router.embed_and_store_version", AsyncMock())


@pytest.fixture
def authed_client(test_client, test_user):
    from backend.main import app
    app.dependency_overrides[get_current_user] = lambda: test_user
    yield test_client
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# Folder endpoints
# ---------------------------------------------------------------------------

class TestFolderRoutes:
    async def test_create_folder_201(self, authed_client):
        r = await authed_client.post("/api/vault/folders", json={"name": "Notes"})
        assert r.status_code == 201
        assert "id" in r.json()
        assert r.json()["name"] == "Notes"

    async def test_list_folders_own_only(self, authed_client, test_folder):
        r = await authed_client.get("/api/vault/folders")
        assert r.status_code == 200
        ids = [f["id"] for f in r.json()]
        assert str(test_folder.id) in ids

    async def test_rename_folder_200(self, authed_client, test_folder):
        r = await authed_client.patch(
            f"/api/vault/folders/{test_folder.id}",
            json={"name": "Renamed"},
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed"

    async def test_delete_folder_204(self, authed_client, test_user):
        r_create = await authed_client.post("/api/vault/folders", json={"name": "ToDelete"})
        folder_id = r_create.json()["id"]
        r_del = await authed_client.delete(f"/api/vault/folders/{folder_id}")
        assert r_del.status_code == 204

    async def test_delete_other_users_folder_raises(self, authed_client, db_session):
        import bcrypt
        from backend.auth.models import User
        from backend.vault.models import Folder

        other = User(id=uuid.uuid4(), username=f"other_{uuid.uuid4().hex[:4]}",
                     email=f"o_{uuid.uuid4().hex[:4]}@x.com",
                     password_hash=bcrypt.hashpw(b"x", bcrypt.gensalt()).decode())
        db_session.add(other)
        other_folder = Folder(id=uuid.uuid4(), user_id=other.id, name="Other's Folder")
        db_session.add(other_folder)
        db_session.flush()

        r = await authed_client.delete(f"/api/vault/folders/{other_folder.id}")
        assert r.status_code in (403, 404)


# ---------------------------------------------------------------------------
# Post endpoints
# ---------------------------------------------------------------------------

class TestPostRoutes:
    async def test_create_post_201(self, authed_client, test_folder):
        r = await authed_client.post(
            f"/api/vault/folders/{test_folder.id}/posts",
            json={"title": "My Post"},
        )
        assert r.status_code == 201
        assert "id" in r.json()

    async def test_list_posts_scoped_to_folder(self, authed_client, test_folder):
        await authed_client.post(f"/api/vault/folders/{test_folder.id}/posts",
                                  json={"title": "Post A"})
        r = await authed_client.get(f"/api/vault/folders/{test_folder.id}/posts")
        assert r.status_code == 200
        assert any(p["title"] == "Post A" for p in r.json())

    async def test_get_post_200(self, authed_client, test_post):
        r = await authed_client.get(f"/api/vault/posts/{test_post.id}")
        assert r.status_code == 200
        assert r.json()["title"] == "Test Post"

    async def test_rename_post_200(self, authed_client, test_post):
        r = await authed_client.patch(
            f"/api/vault/posts/{test_post.id}",
            json={"title": "New Title"},
        )
        assert r.status_code == 200
        assert r.json()["title"] == "New Title"

    async def test_pin_post(self, authed_client, test_post):
        r = await authed_client.patch(
            f"/api/vault/posts/{test_post.id}/pin",
            json={"is_pinned": True},
        )
        assert r.status_code == 200
        assert r.json()["is_pinned"] is True

    async def test_delete_post_204(self, authed_client, test_folder):
        r_create = await authed_client.post(
            f"/api/vault/folders/{test_folder.id}/posts",
            json={"title": "Deletable Post"},
        )
        post_id = r_create.json()["id"]
        r_del = await authed_client.delete(f"/api/vault/posts/{post_id}")
        assert r_del.status_code == 204


# ---------------------------------------------------------------------------
# Version endpoints
# ---------------------------------------------------------------------------

class TestVersionRoutes:
    async def test_save_version_201(self, authed_client, test_post):
        r = await authed_client.post(
            f"/api/vault/posts/{test_post.id}/versions",
            json={"content": "First version content.", "source": "manual"},
        )
        assert r.status_code == 201
        assert r.json()["version_number"] == 1

    async def test_save_version_increments(self, authed_client, test_post):
        await authed_client.post(f"/api/vault/posts/{test_post.id}/versions",
                                  json={"content": "v1", "source": "manual"})
        r = await authed_client.post(f"/api/vault/posts/{test_post.id}/versions",
                                     json={"content": "v2", "source": "manual"})
        assert r.status_code == 201
        assert r.json()["version_number"] == 2

    async def test_list_versions(self, authed_client, test_post):
        await authed_client.post(f"/api/vault/posts/{test_post.id}/versions",
                                  json={"content": "v1", "source": "manual"})
        r = await authed_client.get(f"/api/vault/posts/{test_post.id}/versions")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    async def test_get_version(self, authed_client, test_version):
        r = await authed_client.get(f"/api/vault/versions/{test_version.id}")
        assert r.status_code == 200
        assert "content" in r.json()

    async def test_rename_version(self, authed_client, test_version):
        r = await authed_client.patch(
            f"/api/vault/versions/{test_version.id}",
            json={"version_label": "Draft v1"},
        )
        assert r.status_code == 200

    async def test_delete_version_204(self, authed_client, test_post):
        r_v = await authed_client.post(f"/api/vault/posts/{test_post.id}/versions",
                                        json={"content": "deletable", "source": "manual"})
        vid = r_v.json()["id"]
        r_del = await authed_client.delete(f"/api/vault/versions/{vid}")
        assert r_del.status_code == 204


# ---------------------------------------------------------------------------
# Analytics endpoint
# ---------------------------------------------------------------------------

class TestAnalyticsRoute:
    async def test_update_post_analytics(self, authed_client, test_post):
        r = await authed_client.patch(
            f"/api/vault/posts/{test_post.id}/analytics",
            json={"impressions": 500, "reactions": 42},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["impressions"] == 500
        assert body["reactions"] == 42


# ---------------------------------------------------------------------------
# Search endpoint
# ---------------------------------------------------------------------------

class TestSearchRoute:
    async def test_search_by_title(self, authed_client, test_folder):
        slug = uuid.uuid4().hex[:8]
        await authed_client.post(f"/api/vault/folders/{test_folder.id}/posts",
                                  json={"title": f"UniqueTitle_{slug}"})
        r = await authed_client.get(f"/api/vault/search?q=UniqueTitle_{slug}")
        assert r.status_code == 200
        assert len(r.json()) >= 1


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------

class TestAuthGuard:
    async def test_no_x_user_id_returns_422(self, test_client):
        # FastAPI returns 422 when a required Header field is missing entirely
        r = await test_client.get("/api/vault/folders")
        assert r.status_code == 422

    async def test_invalid_x_user_id_returns_401(self, test_client):
        # Invalid UUID → dependency raises 401
        r = await test_client.get(
            "/api/vault/folders",
            headers={"X-User-Id": "not-a-valid-uuid"},
        )
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Level 1 Test 1: Full routing → DB → vectorization scenario
# ---------------------------------------------------------------------------

class TestLevel1Routing:
    async def test_full_routing_db_vectorization(
        self, authed_client, db_session, test_user, monkeypatch
    ):
        """
        Level 1 Test 1: login → folder → post → 2 versions → SQL verified → pgvector verified.
        embed_and_store_version runs for real but Gemini embedding is replaced by mock_embeddings.
        """
        from unittest.mock import MagicMock, AsyncMock
        import backend.ai.embeddings as emb_mod
        from contextlib import contextmanager

        # Patch _embeddings so no real Gemini call fires
        mock_emb = MagicMock()
        mock_emb.embed_documents.return_value = [[0.1] * 768]
        monkeypatch.setattr(emb_mod, "_embeddings", mock_emb)

        # Patch background task to call the real function inline (sync, not deferred)
        @contextmanager
        def fake_session():
            yield db_session

        monkeypatch.setattr(emb_mod, "SessionLocal", fake_session)
        monkeypatch.setattr("backend.vault.router.embed_and_store_version", emb_mod.embed_and_store_version)

        # Step 1: Create folder
        r = await authed_client.post("/api/vault/folders", json={"name": "ML Notes"})
        assert r.status_code == 201
        folder_id = r.json()["id"]

        from backend.vault.models import Folder
        folder = db_session.get(Folder, uuid.UUID(folder_id))
        assert folder is not None
        assert folder.name == "ML Notes"

        # Step 2: Create post
        r = await authed_client.post(f"/api/vault/folders/{folder_id}/posts",
                                      json={"title": "Python Tips"})
        assert r.status_code == 201
        post_id = r.json()["id"]

        # Step 3: Save version 1
        content_v1 = "Python is great for data science. " * 20
        mock_emb.embed_documents.return_value = [[0.1] * 768]
        r = await authed_client.post(f"/api/vault/posts/{post_id}/versions",
                                      json={"content": content_v1, "source": "manual"})
        assert r.status_code == 201
        v1_id = r.json()["id"]

        # Step 4: Save version 2
        content_v2 = "Advanced Python patterns and decorators. " * 20
        mock_emb.embed_documents.return_value = [[0.2] * 768]
        r = await authed_client.post(f"/api/vault/posts/{post_id}/versions",
                                      json={"content": content_v2, "source": "manual"})
        assert r.status_code == 201
        assert r.json()["version_number"] == 2

        # Step 5: Verify SQL state
        from backend.vault.models import Post, PostVersion
        post = db_session.get(Post, uuid.UUID(post_id))
        assert post.current_version == 2

        versions = db_session.query(PostVersion).filter(
            PostVersion.post_id == post.id
        ).all()
        assert len(versions) == 2

        # Step 6: Verify pgvector — embed_documents called twice
        assert mock_emb.embed_documents.call_count == 2

        # Step 7: Verify post_embeddings table — v2 replaced v1
        rows = db_session.execute(
            text("SELECT version_id FROM post_embeddings WHERE post_id = :pid"),
            {"pid": post_id},
        ).fetchall()
        assert len(rows) >= 1
        # All remaining chunks reference v2 (v1 was deleted before v2 insert)
        for row in rows:
            assert str(row.version_id) == r.json()["id"]
