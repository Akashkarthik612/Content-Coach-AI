from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    # Frontend's login form only has an email field (no username field), so this
    # is typically an email at runtime — LocalUserService.login() matches either.
    username: str
    password: str


class AuthResponse(BaseModel):
    user_id: UUID
    username: str
    email: Optional[str] = None
