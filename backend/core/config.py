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
    LANGCHAIN_API_KEY_GEMINI_2: str = ""  # optional fallback — see backend/ai/api_key_rotation.py
    TAVILY_API_KEY: str = ""
    APP_NAME: str = "LinkedIn Coach"
    ENV: str = "development"

    # LinkedIn OAuth
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    LINKEDIN_REDIRECT_URI: str = "http://localhost:8000/api/linkedin/auth/callback"
    FRONTEND_URL: str = "http://localhost:5173"



@lru_cache
def get_settings() -> Settings:
    env = os.getenv("ENV", "development").lower()

    if env in ("production", "ec2", "prod"):
        secret_name = os.environ["AWS_SECRET_NAME"]
        region = os.getenv("AWS_REGION", "eu-west-3")
        secrets = get_secret(secret_name, region)
        for k, v in secrets.items():
            os.environ.setdefault(k, str(v))

    return Settings()


settings = get_settings()
