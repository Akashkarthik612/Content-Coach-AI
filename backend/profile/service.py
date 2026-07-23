import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.profile.models import UserProfile
from backend.profile.schemas import OnboardingSubmit, ProfileCreate, ProfileUpdate

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProfileService:
    """
    All user_profile business logic. Router creates one instance per request,
    passing the DB session in — matches auth/service.py's UserService(db) style.
    """

    def __init__(self, db: Session):
        self.db = db

    # ── Private helpers ────────────────────────────────────────────────────────

    def _own_profile(self, user_id: UUID, profile_id: UUID) -> UserProfile:
        """Vault-pattern ownership guard (id-based lookup + 404/403), kept as the
        reusable, directly-testable ownership primitive. Stage-1 routes resolve
        "my profile" via user_id alone (no profile_id in the URL), so cross-user
        access is structurally impossible there too."""
        profile = self.db.get(UserProfile, profile_id)
        if not profile:
            logger.debug("Profile not found: profile_id=%s", profile_id)
            raise HTTPException(status_code=404, detail="Profile not found")
        if profile.user_id != user_id:
            logger.warning("Forbidden: user_id=%s does not own profile_id=%s", user_id, profile_id)
            raise HTTPException(status_code=403, detail="Forbidden")
        return profile

    # ── Public API ─────────────────────────────────────────────────────────────

    def get_profile(self, user_id: UUID) -> UserProfile:
        profile = self.db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        return profile

    def create_profile(self, user_id: UUID, data: ProfileCreate) -> UserProfile:
        existing = self.db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if existing:
            logger.warning("Create rejected: profile already exists for user_id=%s", user_id)
            raise HTTPException(status_code=409, detail="Profile already exists")
        profile = UserProfile(user_id=user_id, **data.model_dump())
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(profile)
        logger.info("Profile created: user_id=%s", user_id)
        return profile

    def update_profile(self, user_id: UUID, data: ProfileUpdate) -> UserProfile:
        profile = self.get_profile(user_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)
        profile.updated_at = _utcnow()
        self.db.commit()
        self.db.refresh(profile)
        logger.info("Profile updated: user_id=%s", user_id)
        return profile

    def upsert_from_onboarding(self, user_id: UUID, data: OnboardingSubmit) -> UserProfile:
        """Get-or-create + partial merge — unlike create_profile, never 409s on
        an existing row, since a user who re-runs or resumes onboarding (or
        already has a profile from PATCH /api/profile) should just merge in."""
        profile = self.db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if profile is None:
            profile = UserProfile(user_id=user_id)
            self.db.add(profile)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)
        profile.updated_at = _utcnow()
        self.db.commit()
        self.db.refresh(profile)
        logger.info("Profile upserted from onboarding: user_id=%s", user_id)
        return profile
