"""Where users are: country from the request IP (DB-IP Lite), timezone from the browser.

The IP is only looked up, never stored. The database ships in the image (see Dockerfile);
without it, country is simply unknown.
"""

from __future__ import annotations

import ipaddress
import logging
import re
from functools import lru_cache
from pathlib import Path

from fastapi import Request

from app.config import settings

logger = logging.getLogger(__name__)

_TIMEZONE = re.compile(r"^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}$")


@lru_cache(maxsize=1)
def _reader():
    path = Path(settings.GEOIP_DB_PATH)
    if not path.exists():
        logger.info("No IP country database at %s; countries will be unknown", path)
        return None
    try:
        import maxminddb

        return maxminddb.open_database(str(path))
    except Exception:
        logger.warning("Could not open the IP country database", exc_info=True)
        return None


def _public(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        return False
    return addr.is_global


def client_ip(request: Request) -> str | None:
    """The visitor's address. Each proxy (Container Apps ingress, nginx) appends to
    X-Forwarded-For, so the right-most public address is the one our ingress saw; anything
    left of it could have been sent by the client."""
    chain = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    for ip in reversed(chain):
        if _public(ip):
            return ip
    host = request.client.host if request.client else None
    return host if host and _public(host) else None


def country_for_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    reader = _reader()
    if reader is None:
        return None
    try:
        record = reader.get(ip)
    except Exception:
        return None
    code = ((record or {}).get("country") or {}).get("iso_code")
    return code.upper() if isinstance(code, str) and len(code) == 2 else None


def clean_timezone(value: str | None) -> str | None:
    if not value or len(value) > 64 or not _TIMEZONE.match(value):
        return None
    return value
