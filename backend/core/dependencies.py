from typing import Generator
from uuid import UUID

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
    x_user_id: str = Header(alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    from backend.auth.models import User  # local import avoids circular dependency

    try:
        user_id = UUID(x_user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid X-User-Id header")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
