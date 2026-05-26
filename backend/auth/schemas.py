from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    user_id: UUID
    username: str
    email: Optional[str] = None
