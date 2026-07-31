from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.auth_local.schemas import AuthResponse, LoginRequest, RegisterRequest
from backend.auth_local.service import LocalUserService
from backend.core.dependencies import get_db

# Dev-only local auth — mounted by main.py only when settings.AUTH_PROVIDER == "local".
router = APIRouter(prefix="/api/auth", tags=["auth-local"])


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    user = LocalUserService(db).register(body.username, body.email, body.password)
    return AuthResponse(user_id=user.id, username=user.username, email=user.email)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = LocalUserService(db).login(body.username, body.password)
    return AuthResponse(user_id=user.id, username=user.username, email=user.email)
