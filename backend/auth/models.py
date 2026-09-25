# this is the models.py file for the authentication module in the backend of the application. It contains the definitions of the database models related to user authentication, such as User, Role, and Permission. These models are used to manage user accounts, roles, and access control within the application.
# so we will have one DB table users which will host the user whoever logins so their user details will be stored here safely and can be used from here for other purposes so basically users and we will implement RLS for this


from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID

from backend.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """App-side mirror of a Supabase Auth identity.

    `id` is the Supabase user UUID (JWT `sub`) — never generated here.
    Credentials (email/password, Google OAuth) live in Supabase's auth.users.
    """

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True)
    username = Column(Text, nullable=True, unique=True)
    email = Column(Text, nullable=True, unique=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default="now()"
    )

    def __repr__(self) -> str:
        return f"<User {self.id}>"