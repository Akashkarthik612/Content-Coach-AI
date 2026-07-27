from typing import Generator

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    authorization: str = Header(alias="Authorization"),
    db: Session = Depends(get_db),
):
    from backend.auth.service import SupabaseAuth, UserSyncService  # local import avoids circular dependency

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ")

    try:
        identity = SupabaseAuth.verify_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return UserSyncService.get_or_create(db, identity)
