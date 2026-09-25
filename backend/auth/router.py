from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.auth.schemas import AvailabilityResponse
from backend.auth.services import AuthAvailabilityService
from backend.core.database import get_db

# Mounted unconditionally — the frontend calls this before Supabase's signUp()
# to reject a taken username/email up front instead of discovering the
# collision later when the backend shadow-provisions the user row.
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/availability", response_model=AvailabilityResponse)
def check_availability(
    username: str | None = None,
    email: str | None = None,
    db: Session = Depends(get_db),
) -> AvailabilityResponse:
    username_available, email_available = AuthAvailabilityService.check(db, username, email)
    return AvailabilityResponse(
        username_available=username_available, email_available=email_available
    )
