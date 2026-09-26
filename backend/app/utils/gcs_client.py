"""Object storage client: Azure Blob Storage.

Kept at this module path with the class name ``GCSClient`` so the ~15 existing call
sites (routers, services, workers) keep working unchanged through the GCP→Azure swap.
It routes a logical path like ``videos/<user>/<id>/original.mp4`` to the matching Blob
container (``videos``/``frames``/``clips``) and the remainder as the blob name.

Auth: managed identity (DefaultAzureCredential) in Azure, or a connection string for
local dev / Azurite. Read/write URLs are short-lived SAS tokens.
"""

from __future__ import annotations

import logging
import mimetypes
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock

from azure.storage.blob import (
    BlobSasPermissions,
    BlobServiceClient,
    ContentSettings,
    generate_blob_sas,
)

from app.config import settings

logger = logging.getLogger(__name__)

_lock = Lock()
_instance: "GCSClient | None" = None

_PREFIX_TO_CONTAINER = {
    "videos": settings.BLOB_CONTAINER_VIDEOS,
    "frames": settings.BLOB_CONTAINER_FRAMES,
    "clips": settings.BLOB_CONTAINER_CLIPS,
}


class GCSClient:
    """Thin Azure Blob wrapper with a GCS-compatible surface."""

    def __init__(self, service_client: BlobServiceClient, account_key: str | None):
        self._svc = service_client
        self._account_key = account_key
        self._delegation_key = None
        self._delegation_expiry = datetime.now(timezone.utc)

    # ------------------------------------------------------------------ singleton
    @classmethod
    def is_enabled(cls) -> bool:
        return bool(settings.AZURE_STORAGE_ACCOUNT_URL or settings.AZURE_STORAGE_CONNECTION_STRING)

    @classmethod
    def get(cls) -> "GCSClient":
        global _instance
        if _instance is None:
            with _lock:
                if _instance is None:
                    if settings.AZURE_STORAGE_CONNECTION_STRING:
                        svc = BlobServiceClient.from_connection_string(
                            settings.AZURE_STORAGE_CONNECTION_STRING
                        )
                        # Extract the account key so we can sign SAS in local dev.
                        key = None
                        for part in settings.AZURE_STORAGE_CONNECTION_STRING.split(";"):
                            if part.startswith("AccountKey="):
                                key = part[len("AccountKey="):]
                        _instance = cls(svc, key)
                    else:
                        from azure.identity import DefaultAzureCredential

                        svc = BlobServiceClient(
                            account_url=settings.AZURE_STORAGE_ACCOUNT_URL,
                            credential=DefaultAzureCredential(),
                        )
                        _instance = cls(svc, None)
        return _instance

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _split(path: str) -> tuple[str, str]:
        prefix, _, rest = path.partition("/")
        container = _PREFIX_TO_CONTAINER.get(prefix)
        if container is None:
            # Unknown prefix: treat the whole path as living in the videos container.
            return settings.BLOB_CONTAINER_VIDEOS, path
        return container, rest

    def _get_user_delegation_key(self):
        # Cached until shortly before expiry; used to sign SAS under managed identity.
        now = datetime.now(timezone.utc)
        if self._delegation_key is None or now >= self._delegation_expiry - timedelta(minutes=5):
            start = now - timedelta(minutes=5)
            # The delegation key must cover the entire upload/read SAS lifetime.
            expiry = now + timedelta(minutes=max(settings.SAS_EXPIRY_MINUTES, settings.UPLOAD_SAS_EXPIRY_MINUTES) + 10)
            self._delegation_key = self._svc.get_user_delegation_key(start, expiry)
            self._delegation_expiry = expiry
        return self._delegation_key

    def _sign(self, container: str, blob: str, permission: BlobSasPermissions, expiry_minutes: int, content_disposition: str | None = None) -> str:
        expiry = datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes)
        kwargs = dict(
            account_name=self._svc.account_name,
            container_name=container,
            blob_name=blob,
            permission=permission,
            expiry=expiry,
        )
        if self._account_key:
            kwargs["account_key"] = self._account_key
        else:
            kwargs["user_delegation_key"] = self._get_user_delegation_key()
        if content_disposition:
            kwargs["content_disposition"] = content_disposition
        token = generate_blob_sas(**kwargs)
        return f"{self._svc.url.rstrip('/')}/{container}/{blob}?{token}"

    # ------------------------------------------------------------------ ops
    def upload_file(self, local_path: str | Path, gcs_path: str, content_type: str | None = None) -> str:
        local_path = Path(local_path)
        if content_type is None:
            content_type = mimetypes.guess_type(str(local_path))[0] or "application/octet-stream"
        container, blob = self._split(gcs_path)
        client = self._svc.get_blob_client(container=container, blob=blob)
        with open(local_path, "rb") as fh:
            client.upload_blob(fh, overwrite=True, content_settings=ContentSettings(content_type=content_type))
        logger.info("Uploaded %s -> %s/%s", local_path.name, container, blob)
        return gcs_path

    def download_file(self, gcs_path: str, local_path: str) -> None:
        container, blob = self._split(gcs_path)
        client = self._svc.get_blob_client(container=container, blob=blob)
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)
        with open(local_path, "wb") as fh:
            fh.write(client.download_blob().readall())
        logger.info("Downloaded %s/%s -> %s", container, blob, local_path)

    def delete_prefix(self, prefix: str) -> int:
        container, blob_prefix = self._split(prefix)
        container_client = self._svc.get_container_client(container)
        names = [b.name for b in container_client.list_blobs(name_starts_with=blob_prefix)]
        for name in names:
            container_client.delete_blob(name)
        logger.info("Deleted %d objects under %s/%s", len(names), container, blob_prefix)
        return len(names)

    def blob_exists(self, gcs_path: str) -> bool:
        container, blob = self._split(gcs_path)
        return self._svc.get_blob_client(container=container, blob=blob).exists()

    def get_blob_size(self, gcs_path: str) -> int:
        container, blob = self._split(gcs_path)
        return self._svc.get_blob_client(container=container, blob=blob).get_blob_properties().size

    def generate_signed_url(self, gcs_path: str, expiry_minutes: int | None = None, *, content_disposition: str | None = None) -> str:
        """Short-lived read (GET) SAS URL."""
        container, blob = self._split(gcs_path)
        return self._sign(
            container, blob, BlobSasPermissions(read=True), expiry_minutes or settings.SAS_EXPIRY_MINUTES,
            content_disposition=content_disposition,
        )

    def generate_upload_sas(self, gcs_path: str, expiry_minutes: int | None = None) -> str:
        """Short-lived write (PUT) SAS URL for direct browser-to-Blob upload."""
        container, blob = self._split(gcs_path)
        return self._sign(
            container,
            blob,
            BlobSasPermissions(create=True, write=True),
            expiry_minutes or settings.UPLOAD_SAS_EXPIRY_MINUTES,
        )
