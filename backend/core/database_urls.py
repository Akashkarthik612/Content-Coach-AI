"""One Postgres URL accepted by SQLAlchemy/psycopg3 and the LangGraph saver."""

from sqlalchemy.engine import make_url


def sqlalchemy_url(value: str) -> str:
    return make_url(value).set(drivername="postgresql+psycopg").render_as_string(hide_password=False)


def psycopg_url(value: str) -> str:
    return make_url(value).set(drivername="postgresql").render_as_string(hide_password=False)
