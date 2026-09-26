"""Object-storage URL resolution.

Always a short-lived SAS URL from Blob Storage: there is no unauthenticated static
media mount anymore (the old ``/storage`` mount was an access-control hole). The local
path fallback remains only for local dev where Blob isn't configured.
"""

from __future__ import annotations

from app.utils.gcs_client import GCSClient


def resolve_storage_url(local_path: str | None, gcs_path: str | None) -> str | None:
    """Return a signed, expiring URL for a stored object, or None if unavailable."""
    if gcs_path and GCSClient.is_enabled():
        return GCSClient.get().generate_signed_url(gcs_path)
    return None
