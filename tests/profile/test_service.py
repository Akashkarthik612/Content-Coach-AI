"""Unit tests for profile/service.py — ProfileService CRUD + ownership enforcement."""

import uuid

import pytest
from fastapi import HTTPException

from backend.profile.schemas import ProfileCreate, ProfileUpdate
from backend.profile.service import ProfileService


def _make_create(**overrides) -> ProfileCreate:
    data = dict(
        industry="saas",
        role="Product Manager",
        target_audience="B2B founders",
        writing_style="direct, no fluff",
    )
    data.update(overrides)
    return ProfileCreate(**data)


class TestProfileCrud:
    def test_create_profile_persists(self, db_session, test_user):
        profile = ProfileService(db_session).create_profile(test_user.id, _make_create())
        assert profile.id is not None
        assert profile.user_id == test_user.id
        assert profile.industry == "saas"
        assert profile.formatting_prefs == {}
        assert profile.linkedin_headline is None
        assert profile.linkedin_about is None

    def test_create_profile_with_headline_and_about(self, db_session, test_user):
        profile = ProfileService(db_session).create_profile(
            test_user.id,
            _make_create(linkedin_headline="PM @ Acme", linkedin_about="I build things."),
        )
        assert profile.linkedin_headline == "PM @ Acme"
        assert profile.linkedin_about == "I build things."

    def test_create_profile_duplicate_raises_409(self, db_session, test_user):
        ProfileService(db_session).create_profile(test_user.id, _make_create())
        with pytest.raises(HTTPException) as exc_info:
            ProfileService(db_session).create_profile(test_user.id, _make_create())
        assert exc_info.value.status_code == 409

    def test_get_profile_missing_raises_404(self, db_session, test_user):
        with pytest.raises(HTTPException) as exc_info:
            ProfileService(db_session).get_profile(test_user.id)
        assert exc_info.value.status_code == 404

    def test_get_profile_returns_existing(self, db_session, test_user):
        created = ProfileService(db_session).create_profile(test_user.id, _make_create())
        fetched = ProfileService(db_session).get_profile(test_user.id)
        assert fetched.id == created.id

    def test_update_profile_partial_leaves_other_fields_untouched(self, db_session, test_user):
        ProfileService(db_session).create_profile(
            test_user.id, _make_create(linkedin_headline="Old headline")
        )
        updated = ProfileService(db_session).update_profile(
            test_user.id, ProfileUpdate(industry="fintech")
        )
        assert updated.industry == "fintech"
        assert updated.role == "Product Manager"
        assert updated.linkedin_headline == "Old headline"

    def test_update_profile_missing_raises_404(self, db_session, test_user):
        with pytest.raises(HTTPException) as exc_info:
            ProfileService(db_session).update_profile(test_user.id, ProfileUpdate(industry="x"))
        assert exc_info.value.status_code == 404


class TestOwnProfileGuard:
    def test_own_profile_wrong_user_raises_403(self, db_session, test_user):
        import bcrypt
        from backend.auth.models import User

        other = User(
            id=uuid.uuid4(),
            username="other_profile_owner",
            email="other_profile_owner@x.com",
            password_hash=bcrypt.hashpw(b"x", bcrypt.gensalt()).decode(),
        )
        db_session.add(other)
        db_session.flush()

        profile = ProfileService(db_session).create_profile(test_user.id, _make_create())

        with pytest.raises(HTTPException) as exc_info:
            ProfileService(db_session)._own_profile(other.id, profile.id)
        assert exc_info.value.status_code == 403

    def test_own_profile_missing_raises_404(self, db_session, test_user):
        with pytest.raises(HTTPException) as exc_info:
            ProfileService(db_session)._own_profile(test_user.id, uuid.uuid4())
        assert exc_info.value.status_code == 404

    def test_own_profile_correct_owner_returns_profile(self, db_session, test_user):
        profile = ProfileService(db_session).create_profile(test_user.id, _make_create())
        found = ProfileService(db_session)._own_profile(test_user.id, profile.id)
        assert found.id == profile.id
