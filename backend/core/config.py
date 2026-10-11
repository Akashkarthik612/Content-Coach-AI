import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

from backend.core.aws_secrets import get_secret

load_dotenv()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    OPENAI_API_KEY: str = ""
    LANGCHAIN_API_KEY_GEMINI: str = ""
    # Points the Gemini client at another host. Only the smoke tests set it
    # (tests/smoke/fake_gemini.py); leave it unset everywhere else.
    GEMINI_BASE_URL: str = ""
    TAVILY_API_KEY: str = ""
    APP_NAME: str = "LinkedIn Coach"
    ENV: str = "development"

    # Supabase Auth — verifies the JWT issued by supabase-js on the frontend via
    # Supabase's public JWKS endpoint (SUPABASE_URL + "/auth/v1/.well-known/jwks.json")
    SUPABASE_URL: str = ""

    # Service-role key for Supabase's Admin API (e.g. deleting an auth identity on
    # account deletion). Bypasses RLS — server-side only, never expose to the frontend.
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Auth provider switch — "supabase" (default, used in prod) or "local" (dev-only
    # bcrypt + X-User-Id auth, see backend/auth_local/). Never set to "local" outside
    # a local dev environment.
    AUTH_PROVIDER: str = "supabase"

    # LinkedIn OAuth
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    LINKEDIN_REDIRECT_URI: str = "http://localhost:8000/api/linkedin/auth/callback"
    FRONTEND_URL: str = "http://localhost:5173"

    # Comma-separated extra CORS origins (e.g. the deployed Vercel URL) added
    # on top of the hardcoded localhost/CloudFront list in main.py, so a new
    # frontend domain is an env var change, not a code change.
    EXTRA_ALLOWED_ORIGINS: str = ""

    # Independent agents' chat threads (backend/ai/independent_agents/threads.py).
    # A thread ends after THREAD_TURN_LIMIT turns and the user is asked to start
    # a new chat; threads idle longer than THREAD_RETENTION_DAYS are deleted.
    THREAD_TURN_LIMIT: int = 15
    THREAD_RETENTION_DAYS: int = 7

    # Knowledge store (backend/knowledge/). EMBEDDING_DIM is fixed in the
    # knowledge_chunks.embedding column type; changing it needs a migration
    # and a full re-embed.
    EMBEDDING_MODEL: str = "gemini-embedding-2"
    EMBEDDING_DIM: int = 768

    @property
    def EMBEDDING_MODEL_TAG(self) -> str:
        """Stored on every chunk; search only compares vectors with this tag."""
        return f"{self.EMBEDDING_MODEL}@{self.EMBEDDING_DIM}"

    # Google Drive connector (backend/knowledge/connectors/). The redirect URI
    # is the frontend route that finishes the OAuth flow with the user's JWT.
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    GOOGLE_DRIVE_REDIRECT_URI: str = ""  # local: http://localhost:5173/connect/gdrive/callback
    # Fernet key: encrypts Drive tokens at rest and seals the OAuth state.
    KNOWLEDGE_TOKEN_KEY: str = ""

    # Ingestion limits (backend/knowledge/pipeline.py, sync.py).
    CHUNK_MAX_TOKENS: int = 512
    MAX_DOCUMENT_CHARS: int = 750_000
    MAX_DOWNLOAD_BYTES: int = 20 * 1024 * 1024
    MAX_FILES_PER_SOURCE: int = 2000
    # One sync run per source at a time; renewed after every file.
    SYNC_LEASE_SECONDS: int = 900

    # Test-only: point Drive + Google OAuth at a fake (tests/smoke/fake_google.py),
    # like GEMINI_BASE_URL. Must stay unset in production.
    GOOGLE_BASE_URL: str = ""
    # backend.* loggers (configured in main.py).
    LOG_LEVEL: str = "INFO"

    # Background poller (backend/knowledge/sync_poller.py): every interval,
    # sync the sources that are due. Tests and CI turn it off.
    KNOWLEDGE_SYNC_ENABLED: bool = True
    KNOWLEDGE_SYNC_INTERVAL_SECONDS: int = 300
    KNOWLEDGE_SYNC_MAX_CONCURRENCY: int = 2
    KNOWLEDGE_SYNC_SOURCE_TIMEOUT_SECONDS: int = 600  # must stay under SYNC_LEASE_SECONDS
    KNOWLEDGE_SYNC_BATCH_SIZE: int = 50
    KNOWLEDGE_SYNC_FIRST_RUN_DELAY_SECONDS: int = 30



@lru_cache
def get_settings() -> Settings:
    env = os.getenv("ENV", "development").lower()

    if env in ("production", "ec2", "prod"):
        secret_name = os.environ["AWS_SECRET_NAME"]
        region = os.getenv("AWS_REGION", "eu-west-3")
        secrets = get_secret(secret_name, region)
        for k, v in secrets.items():
            os.environ[k] = str(v)

    return Settings()


settings = get_settings()
