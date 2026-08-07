from typing import AsyncGenerator, Generator
from uuid import UUID

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.database import AsyncSessionLocal, SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_db_async() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as db:
        yield db


def get_current_user(
    authorization: str = Header(alias="Authorization", default=""),
    x_user_id: str = Header(alias="X-User-Id", default=""),
    db: Session = Depends(get_db),
):
    if settings.AUTH_PROVIDER == "local":
        return _get_current_user_local(x_user_id, db)
    return _get_current_user_supabase(authorization, db)


def _get_current_user_local(x_user_id: str, db: Session):
    from backend.auth.models import User  # local import avoids circular dependency

    try:
        user_id = UUID(x_user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Missing or invalid X-User-Id header")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Unknown user")
    return user


def _get_current_user_supabase(authorization: str, db: Session):
    from backend.auth.service import SupabaseAuth, UserSyncService  # local import avoids circular dependency

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ")

    try:
        identity = SupabaseAuth.verify_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return UserSyncService.get_or_create(db, identity)
