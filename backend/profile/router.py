from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.auth.models import User
from backend.core.dependencies import get_current_user, get_db
from backend.profile.schemas import (
    AccountSettingsResponse,
    OnboardingSubmit,
    ProfileCreate,
    ProfileResponse,
    ProfileUpdate,
    WeeklyTargetUpdate,
)
from backend.profile.service import ProfileService

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("/settings", response_model=AccountSettingsResponse)
def get_account_settings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return ProfileService(db).get_account_settings(user)


@router.post("", response_model=ProfileResponse, status_code=201)
def create_profile(
    data: ProfileCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return ProfileService(db).create_profile(user.id, data)


@router.post("/onboarding", response_model=ProfileResponse, status_code=200)
def submit_onboarding(
    data: OnboardingSubmit,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return ProfileService(db).upsert_from_onboarding(user.id, data)


@router.get("", response_model=ProfileResponse)
def get_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return ProfileService(db).get_profile(user.id)


@router.patch("", response_model=ProfileResponse)
def update_profile(
    data: ProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return ProfileService(db).update_profile(user.id, data)


@router.patch("/weekly-target", response_model=ProfileResponse)
def set_weekly_target(
    data: WeeklyTargetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return ProfileService(db).set_weekly_target(user.id, data)
