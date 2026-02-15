"""Google Cloud Storage client — singleton wrapper."""

from __future__ import annotations

import logging
import mimetypes
from datetime import timedelta
from pathlib import Path
from threading import Lock

from google.cloud import storage
from google.oauth2 import service_account

from app.config import settings

logger = logging.getLogger(__name__)

_lock = Lock()
_instance: GCSClient | None = None


class GCSClient:
    """Thin wrapper around google-cloud-storage with signed URL support."""

    def __init__(self, bucket_name: str, credentials: service_account.Credentials):
        self._storage_client = storage.Client(
            project=settings.GCP_PROJECT_ID,
            credentials=credentials,
        )
        self._bucket = self._storage_client.bucket(bucket_name)
        self._credentials = credentials

    # ------------------------------------------------------------------
    # Singleton
    # ------------------------------------------------------------------

    @classmethod
    def is_enabled(cls) -> bool:
        return bool(settings.GCS_BUCKET_NAME)

    @classmethod
    def get(cls) -> GCSClient:
        global _instance
        if _instance is None:
            with _lock:
                if _instance is None:
                    creds = service_account.Credentials.from_service_account_file(
                        settings.GCP_SERVICE_ACCOUNT_PATH,
                    )
                    _instance = cls(settings.GCS_BUCKET_NAME, creds)
        return _instance

    # ------------------------------------------------------------------
    # Upload / Delete / Signed URL
    # ------------------------------------------------------------------

    def upload_file(
        self,
        local_path: str | Path,
        gcs_path: str,
        content_type: str | None = None,
    ) -> str:
        """Upload a local file to GCS. Returns the gcs_path."""
        local_path = Path(local_path)
        if content_type is None:
            content_type = mimetypes.guess_type(str(local_path))[0] or "application/octet-stream"

        blob = self._bucket.blob(gcs_path)
        blob.upload_from_filename(str(local_path), content_type=content_type)
        logger.info("Uploaded %s -> gs://%s/%s", local_path.name, self._bucket.name, gcs_path)
        return gcs_path

    def delete_prefix(self, prefix: str) -> int:
        """Delete all objects under *prefix*. Returns count deleted."""
        blobs = list(self._bucket.list_blobs(prefix=prefix))
        if not blobs:
            return 0
        self._bucket.delete_blobs(blobs)
        logger.info("Deleted %d objects under gs://%s/%s", len(blobs), self._bucket.name, prefix)
        return len(blobs)

    def download_file(self, gcs_path: str, local_path: str) -> None:
        """Download a GCS object to a local file path."""
        blob = self._bucket.blob(gcs_path)
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(local_path)
        logger.info("Downloaded gs://%s/%s -> %s", self._bucket.name, gcs_path, local_path)

    def generate_signed_url(
        self,
        gcs_path: str,
        expiry_minutes: int | None = None,
    ) -> str:
        """Generate a V4 signed URL for reading an object."""
        if expiry_minutes is None:
            expiry_minutes = settings.GCS_SIGNED_URL_EXPIRY_MINUTES

        blob = self._bucket.blob(gcs_path)
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=expiry_minutes),
            method="GET",
            credentials=self._credentials,
        )
        return url
