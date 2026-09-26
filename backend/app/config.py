from __future__ import annotations

import logging
import os

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


def _load_keyvault_into_env() -> None:
    """If AZURE_KEY_VAULT_URI is set, overlay named secrets into the environment before
    Settings is constructed. Uses managed identity (DefaultAzureCredential), so no key files.
    Env vars that are already set win, so local .env development is unaffected.
    """
    vault_uri = os.getenv("AZURE_KEY_VAULT_URI")
    if not vault_uri:
        return
    try:
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient
    except ImportError:
        logger.warning("azure-keyvault-secrets not installed; skipping Key Vault overlay")
        return

    # Maps Key Vault secret names (kebab-case) to env var names the app reads.
    secret_map = {
        "jwt-secret": "JWT_SECRET_KEY",
        "postgres-connection-string": "DATABASE_URL",
        "stripe-secret-key": "STRIPE_SECRET_KEY",
        "stripe-webhook-secret": "STRIPE_WEBHOOK_SECRET",
        "google-oauth-client-secret": "GOOGLE_CLIENT_SECRET",
        "redis-connection-string": "REDIS_URL",
    }
    try:
        client = SecretClient(vault_url=vault_uri, credential=DefaultAzureCredential())
        for secret_name, env_name in secret_map.items():
            if os.getenv(env_name):
                continue
            try:
                os.environ[env_name] = client.get_secret(secret_name).value
            except Exception as exc:  # a missing optional secret should not crash startup
                logger.info("Key Vault secret %s not loaded: %s", secret_name, exc)
    except Exception as exc:
        logger.warning("Key Vault overlay failed: %s", exc)


_load_keyvault_into_env()


class Settings(BaseSettings):
    # ---- Core data services ----
    DATABASE_URL: str = "postgresql+asyncpg://frameseek:frameseek_dev@localhost:5432/frameseek"
    DATABASE_SSL: bool = False  # required for Azure PostgreSQL
    REDIS_URL: str = "redis://localhost:6379"

    # ---- Azure Blob Storage (replaces GCS) ----
    # Account URL, e.g. https://stfsxxx.blob.core.windows.net . Auth via managed identity.
    AZURE_STORAGE_ACCOUNT_URL: str = ""
    AZURE_STORAGE_CONNECTION_STRING: str = ""  # local dev / Azurite only
    BLOB_CONTAINER_VIDEOS: str = "videos"
    BLOB_CONTAINER_FRAMES: str = "frames"
    BLOB_CONTAINER_CLIPS: str = "clips"
    SAS_EXPIRY_MINUTES: int = 60
    UPLOAD_SAS_EXPIRY_MINUTES: int = 120

    # ---- Azure AI (replaces Vertex AI + self-hosted Whisper) ----
    AZURE_VISION_ENDPOINT: str = ""  # AI Vision multimodal embeddings
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_WHISPER_DEPLOYMENT: str = "whisper"
    AZURE_OPENAI_API_VERSION: str = "2024-06-01"

    # ---- Service Bus (replaces ARQ enqueue) ----
    SERVICE_BUS_FQDN: str = ""  # e.g. sb-frameseek-xxx.servicebus.windows.net
    SERVICE_BUS_QUEUE: str = "video-processing"

    # ---- Auth (Google web OAuth + httpOnly cookie sessions) ----
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"

    # Cookie behaviour. In prod (same site behind Front Door) SECURE=true, SameSite=lax.
    COOKIE_DOMAIN: str = ""  # empty = host-only cookie
    COOKIE_SECURE: bool = False
    ACCESS_COOKIE_NAME: str = "fs_access"
    REFRESH_COOKIE_NAME: str = "fs_refresh"

    # ---- Billing (Stripe, replaces Apple/Google IAP) ----
    PAYMENTS_ENABLED: bool = False
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_PRO_MONTHLY: str = ""
    STRIPE_PRICE_PRO_ANNUAL: str = ""
    STRIPE_PRICE_PRO_MAX_MONTHLY: str = ""
    STRIPE_PRICE_PRO_MAX_ANNUAL: str = ""

    # ---- App ----
    FRONTEND_URL: str = "http://localhost:8080"
    CORS_ORIGINS: str = "http://localhost:8080"  # comma-separated
    MAX_UPLOAD_SIZE_MB: int = 500
    # Ephemeral local scratch for frame extraction / clip rendering inside the container.
    STORAGE_BASE_PATH: str = "./storage"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    AZURE_KEY_VAULT_URI: str = ""

    @property
    def database_connect_args(self) -> dict:
        if not self.DATABASE_SSL:
            return {}
        import ssl

        return {"ssl": ssl.create_default_context()}

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def storage_path(self):
        from pathlib import Path

        path = Path(self.STORAGE_BASE_PATH).resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    def validate_runtime(self) -> None:
        """Fail fast on unsafe config. Called from the app lifespan."""
        placeholders = {"", "change-me-in-production", "changeme"}
        if self.JWT_SECRET_KEY in placeholders:
            raise RuntimeError("JWT_SECRET_KEY is unset or a placeholder. Set a real secret (Key Vault: jwt-secret).")
        if not self.DEBUG:
            if not self.AZURE_STORAGE_ACCOUNT_URL:
                raise RuntimeError("AZURE_STORAGE_ACCOUNT_URL must be set in production.")
            if self.PAYMENTS_ENABLED and (not self.STRIPE_SECRET_KEY or not self.STRIPE_WEBHOOK_SECRET):
                raise RuntimeError("Stripe keys must be set in production when payments are enabled.")
            if not self.GOOGLE_CLIENT_ID or not self.GOOGLE_CLIENT_SECRET:
                raise RuntimeError("Google OAuth credentials must be set in production.")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
