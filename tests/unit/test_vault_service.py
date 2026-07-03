"""Unit tests for vault/service.py — all CRUD functions and ownership helpers."""

import uuid
import pytest
from fastapi import HTTPException

from backend.vault import service as vault_service
from backend.vault.schemas import (
    FolderCreate, FolderRename,
    PostCreate, PostRename, PostAnalyticsUpdate,
    VersionSave, VersionRename,
)
from backend.vault.models import PostStatus


# ---------------------------------------------------------------------------
# Folder CRUD
# ---------------------------------------------------------------------------

class TestFolderCrud:
    def test_create_folder_persists(self, db_session, test_user):
        data   = FolderCreate(name="My Folder", description="desc")
        folder = vault_service.create_folder(db_session, test_user.id, data)
        assert folder.id is not None
        assert folder.name == "My Folder"
        assert folder.user_id == test_user.id

    def test_list_folders_own_only(self, db_session, test_user):
        import bcrypt
        from backend.auth.models import User
        other = User(id=uuid.uuid4(), username="other_list", email="other_list@x.com",
                     password_hash=bcrypt.hashpw(b"x", bcrypt.gensalt()).decode())
        db_session.add(other)
        db_session.flush()

        vault_service.create_folder(db_session, test_user.id, FolderCreate(name="Mine"))
        vault_service.create_folder(db_session, other.id, FolderCreate(name="Theirs"))

        folders = vault_service.list_folders(db_session, test_user.id)
        names = [f.name for f in folders]
        assert "Mine" in names
        assert "Theirs" not in names

    def test_rename_folder(self, db_session, test_user, test_folder):
        updated = vault_service.rename_folder(
            db_session, test_user.id, test_folder.id, FolderRename(name="Renamed")
        )
        assert updated.name == "Renamed"

    def test_delete_folder(self, db_session, test_user):
        folder = vault_service.create_folder(db_session, test_user.id, FolderCreate(name="ToDelete"))
        vault_service.delete_folder(db_session, test_user.id, folder.id)
        remaining = vault_service.list_folders(db_session, test_user.id)
        assert not any(f.id == folder.id for f in remaining)

    def test_rename_folder_wrong_user_raises(self, db_session, test_folder):
        wrong_user_id = uuid.uuid4()
        with pytest.raises(HTTPException):
            vault_service.rename_folder(
                db_session, wrong_user_id, test_folder.id, FolderRename(name="X")
            )

    def test_own_folder_not_found_raises_404(self, db_session, test_user):
        with pytest.raises(HTTPException) as exc_info:
            vault_service._own_folder(db_session, test_user.id, uuid.uuid4())
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# Post CRUD
# ---------------------------------------------------------------------------

class TestPostCrud:
    def test_create_post(self, db_session, test_user, test_folder):
        post = vault_service.create_post(
            db_session, test_user.id, test_folder.id, PostCreate(title="New Post")
        )
        assert post.id is not None
        assert post.title == "New Post"
        assert post.user_id == test_user.id
        assert post.folder_id == test_folder.id

    def test_list_posts_scoped_to_folder(self, db_session, test_user, test_folder):
        other_folder = vault_service.create_folder(db_session, test_user.id, FolderCreate(name="Other"))
        vault_service.create_post(db_session, test_user.id, test_folder.id, PostCreate(title="InFolder"))
        vault_service.create_post(db_session, test_user.id, other_folder.id, PostCreate(title="NotInFolder"))

        posts = vault_service.list_posts(db_session, test_user.id, test_folder.id)
        titles = [p.title for p in posts]
        assert "InFolder" in titles
        assert "NotInFolder" not in titles

    def test_get_post(self, db_session, test_user, test_post):
        fetched = vault_service.get_post(db_session, test_user.id, test_post.id)
        assert fetched.id == test_post.id

    def test_rename_post(self, db_session, test_user, test_post):
        updated = vault_service.rename_post(
            db_session, test_user.id, test_post.id, PostRename(title="Updated Title")
        )
        assert updated.title == "Updated Title"
        assert updated.updated_at is not None

    def test_delete_post(self, db_session, test_user, test_folder):
        post = vault_service.create_post(
            db_session, test_user.id, test_folder.id, PostCreate(title="Deletable")
        )
        vault_service.delete_post(db_session, test_user.id, post.id)
        with pytest.raises(HTTPException):
            vault_service.get_post(db_session, test_user.id, post.id)

    def test_pin_post(self, db_session, test_user, test_post):
        assert test_post.is_pinned is False
        updated = vault_service.pin_post(db_session, test_user.id, test_post.id, True)
        assert updated.is_pinned is True

    def test_get_post_wrong_user_raises(self, db_session, test_post):
        with pytest.raises(HTTPException):
            vault_service.get_post(db_session, uuid.uuid4(), test_post.id)

    def test_own_version_checks_post_ownership(self, db_session, test_version):
        with pytest.raises(HTTPException):
            vault_service._own_version(db_session, uuid.uuid4(), test_version.id)


# ---------------------------------------------------------------------------
# Version CRUD
# ---------------------------------------------------------------------------

class TestVersionCrud:
    def test_save_version_first(self, db_session, test_user, test_post):
        version = vault_service.save_version(
            db_session, test_user.id, test_post.id,
            VersionSave(content="Hello world content.", source="manual")
        )
        assert version.version_number == 1
        assert test_post.current_version == 1

    def test_save_version_increments(self, db_session, test_user, test_post):
        vault_service.save_version(db_session, test_user.id, test_post.id,
                                   VersionSave(content="v1 content", source="manual"))
        v2 = vault_service.save_version(db_session, test_user.id, test_post.id,
                                        VersionSave(content="v2 content", source="manual"))
        assert v2.version_number == 2
        assert test_post.current_version == 2

    def test_save_version_char_count(self, db_session, test_user, test_post):
        content = "Exactly this long."
        version = vault_service.save_version(
            db_session, test_user.id, test_post.id,
            VersionSave(content=content, source="manual")
        )
        assert version.char_count == len(content)

    def test_list_versions_ordered(self, db_session, test_user, test_post):
        vault_service.save_version(db_session, test_user.id, test_post.id,
                                   VersionSave(content="v1", source="manual"))
        vault_service.save_version(db_session, test_user.id, test_post.id,
                                   VersionSave(content="v2", source="manual"))
        versions = vault_service.list_versions(db_session, test_user.id, test_post.id)
        nums = [v.version_number for v in versions]
        assert nums == sorted(nums)

    def test_get_version(self, db_session, test_user, test_version):
        fetched = vault_service.get_version(db_session, test_user.id, test_version.id)
        assert fetched.id == test_version.id

    def test_rename_version(self, db_session, test_user, test_version):
        updated = vault_service.rename_version(
            db_session, test_user.id, test_version.id, VersionRename(version_label="Draft v1")
        )
        assert updated.change_summary == "Draft v1"

    def test_delete_version_updates_current(self, db_session, test_user, test_post):
        vault_service.save_version(db_session, test_user.id, test_post.id,
                                   VersionSave(content="v1", source="manual"))
        v2 = vault_service.save_version(db_session, test_user.id, test_post.id,
                                        VersionSave(content="v2", source="manual"))
        vault_service.delete_version(db_session, test_user.id, v2.id)
        assert test_post.current_version == 1


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

class TestAnalytics:
    def test_upsert_post_analytics_insert(self, db_session, test_user, test_post):
        result = vault_service.upsert_post_analytics(
            db_session, test_post.id, test_user.id, impressions=100, reactions=10
        )
        assert result.impressions == 100
        assert result.reactions == 10

    def test_upsert_post_analytics_update_no_duplicate(self, db_session, test_user, test_post):
        vault_service.upsert_post_analytics(
            db_session, test_post.id, test_user.id, impressions=50, reactions=5
        )
        updated = vault_service.upsert_post_analytics(
            db_session, test_post.id, test_user.id, impressions=200, reactions=20
        )
        assert updated.impressions == 200
        assert updated.reactions == 20
        # Verify only one row exists
        from backend.vault.models import PostAnalytics
        count = db_session.query(PostAnalytics).filter(
            PostAnalytics.post_id == test_post.id
        ).count()
        assert count == 1


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

class TestSearch:
    def test_search_posts_by_title(self, db_session, test_user, test_folder):
        post = vault_service.create_post(
            db_session, test_user.id, test_folder.id, PostCreate(title="MachineLearning2024")
        )
        results = vault_service.search_posts(db_session, test_user.id, "MachineLearning2024")
        assert any(r.post_id == post.id for r in results)

    def test_search_posts_by_version_content(self, db_session, test_user, test_folder):
        post = vault_service.create_post(
            db_session, test_user.id, test_folder.id, PostCreate(title="Plain Title")
        )
        vault_service.save_version(
            db_session, test_user.id, post.id,
            VersionSave(content="UniqueSearchableContent12345", source="manual")
        )
        results = vault_service.search_posts(db_session, test_user.id, "UniqueSearchableContent12345")
        assert any(r.post_id == post.id for r in results)

    def test_search_posts_no_results(self, db_session, test_user):
        results = vault_service.search_posts(db_session, test_user.id, "xyzzy_no_match_ever")
        assert results == []
