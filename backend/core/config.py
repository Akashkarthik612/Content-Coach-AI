from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    OPENAI_API_KEY: str = ""
    LANGCHAIN_API_KEY_GEMINI: str = ""
    APP_NAME: str = "LinkedIn Coach"
    ENV: str = "development"


settings = Settings()
