from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.auth.schemas import AvailabilityResponse
from backend.auth.service import AuthAvailabilityService
from backend.core.dependencies import get_db

# Mounted unconditionally (both auth providers write to the same `users` table) — the
# frontend calls this before Supabase's signUp()/local register() to reject a taken
# username/email up front instead of discovering the collision later.
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/availability", response_model=AvailabilityResponse)
def check_availability(
    username: Optional[str] = None,
    email: Optional[str] = None,
    db: Session = Depends(get_db),
):
    username_available, email_available = AuthAvailabilityService.check(db, username, email)
    return AvailabilityResponse(username_available=username_available, email_available=email_available)
