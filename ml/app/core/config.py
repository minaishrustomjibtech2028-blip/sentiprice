"""
Central application configuration.

All environment-dependent values (DB connection, secrets, CORS origins)
are read from environment variables via pydantic-settings, so the same
code works locally, in Docker, and in CI without edits.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- App metadata ---
    PROJECT_NAME: str = "SentiPrice AI"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # --- Database ---
    POSTGRES_USER: str = "sentiprice"
    POSTGRES_PASSWORD: str = "sentiprice_dev"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "sentiprice_db"

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # --- Auth (used from Phase 1 onward, defined now for a stable config surface) ---
    JWT_SECRET_KEY: str = "change-me-in-env-this-is-a-dev-default"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- Uploads (product images) ---
    # Served publicly at /media/... by the FastAPI app. In Docker this lives
    # under ./backend (bind-mounted), so uploaded images survive restarts.
    UPLOAD_DIR: str = "uploads"
    MAX_IMAGE_BYTES: int = 5 * 1024 * 1024

    # --- CORS ---
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",  # Vite dev server default
        "http://127.0.0.1:5173",
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
