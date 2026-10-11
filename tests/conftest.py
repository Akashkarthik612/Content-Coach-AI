"""The test-database guards, the level markers and the DB fixtures moved to
the repo-root conftest.py and tests/fixtures/db.py, so they also cover the
colocated backend/**/tests/. Only shared constants stay here."""

# Stands in for the deployed Vercel URL in CORS checks (root conftest.py puts
# it in EXTRA_ALLOWED_ORIGINS before the app is imported).
SMOKE_ORIGIN = "https://honne-smoke.vercel.app"
