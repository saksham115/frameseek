"""Create Azurite containers and enable browser uploads for local development.

Run from backend/: python -m scripts.init_local_storage
"""

from urllib.parse import urlsplit

from azure.core.exceptions import ResourceExistsError
from azure.storage.blob import BlobServiceClient, CorsRule

from app.config import settings


def main() -> None:
    if not settings.AZURE_STORAGE_CONNECTION_STRING:
        raise SystemExit("Set AZURE_STORAGE_CONNECTION_STRING to your local Azurite connection string.")
    client = BlobServiceClient.from_connection_string(settings.AZURE_STORAGE_CONNECTION_STRING)
    if urlsplit(client.url).hostname not in {"localhost", "127.0.0.1", "::1", "azurite"}:
        raise SystemExit("This helper only configures a local Azurite instance.")
    with client:
        for container in (settings.BLOB_CONTAINER_VIDEOS, settings.BLOB_CONTAINER_FRAMES, settings.BLOB_CONTAINER_CLIPS):
            try:
                client.create_container(container)
            except ResourceExistsError:
                pass
        client.set_service_properties(cors=[CorsRule(
            allowed_origins=settings.cors_origins_list,
            allowed_methods=["GET", "PUT", "HEAD", "OPTIONS"],
            allowed_headers=["*"],
            exposed_headers=["ETag", "Content-Length", "Content-Type"],
            max_age_in_seconds=3600,
        )])
    print("Local storage containers and browser CORS are ready.")


if __name__ == "__main__":
    main()
