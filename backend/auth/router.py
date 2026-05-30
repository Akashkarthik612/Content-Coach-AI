from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.auth.schemas import AuthResponse, LoginRequest, RegisterRequest
from backend.auth.service import UserService
from backend.core.dependencies import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    user = UserService(db).register(body.username, body.email, body.password)
    return AuthResponse(user_id=user.id, username=user.username, email=user.email)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = UserService(db).login(body.username, body.password)
    return AuthResponse(user_id=user.id, username=user.username, email=user.email)
