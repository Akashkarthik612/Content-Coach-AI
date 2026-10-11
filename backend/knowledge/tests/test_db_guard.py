"""The last test-database guard: the db fixture refuses to truncate anything
but `honne_test`, whatever the connection URL said."""

import os

import pytest
from sqlalchemy import create_engine, make_url, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from tests.fixtures.db import NotTheTestDatabaseError, assert_test_database

pytestmark = pytest.mark.integration

OTHER_DATABASE = "honne_guard_check"


def test_refuses_a_database_other_than_honne_test():
    url = make_url(os.environ["TEST_DATABASE_URL"])
    admin = create_engine(url, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    other = create_engine(url.set(database=OTHER_DATABASE), poolclass=NullPool)
    try:
        with admin.connect() as conn:
            conn.execute(text(f"DROP DATABASE IF EXISTS {OTHER_DATABASE}"))
            conn.execute(text(f"CREATE DATABASE {OTHER_DATABASE}"))
        with Session(other) as session, pytest.raises(NotTheTestDatabaseError, match=OTHER_DATABASE):
            assert_test_database(session)
    finally:
        other.dispose()
        with admin.connect() as conn:
            conn.execute(text(f"DROP DATABASE IF EXISTS {OTHER_DATABASE}"))
        admin.dispose()


def test_accepts_honne_test(db):
    assert_test_database(db)  # the db fixture already ran it; this pins the name
