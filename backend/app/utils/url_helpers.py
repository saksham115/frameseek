"""GCS-first URL resolution for stored files."""

from __future__ import annotations

from pathlib import Path

from app.config import settings
from app.utils.gcs_client import GCSClient


def resolve_storage_url(local_path: str | None, gcs_path: str | None) -> str | None:
    """Return a URL for accessing a stored file.

    When GCS is enabled and a gcs_path exists, always return a signed URL.
    Otherwise fall back to a local ``/storage/...`` relative URL.
    """
    # GCS is the source of truth when enabled
    if gcs_path and GCSClient.is_enabled():
        return GCSClient.get().generate_signed_url(gcs_path)

    # Local fallback (dev mode or old videos without gcs_path)
    if local_path:
        try:
            storage_root = Path(settings.STORAGE_BASE_PATH).resolve()
            file_abs = Path(local_path).resolve()
            rel = file_abs.relative_to(storage_root)
            return f"/storage/{rel}"
        except (ValueError, RuntimeError, OSError):
            pass

    return None
