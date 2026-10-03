from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    # Kept small: shares Supabase's session-pooler budget with the
    # checkpointer's psycopg pool (backend/ai/independent_agents/checkpointer.py).
    pool_size=5,
    max_overflow=5,
    # Disables psycopg3 server-side prepared statements — required against a
    # pgbouncer transaction-mode pooler (e.g. Supabase's), which can route a
    # connection to a different backend per transaction and collide on a
    # reused prepared-statement name (psycopg.errors.DuplicatePreparedStatement).
    connect_args={"prepare_threshold": None},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
