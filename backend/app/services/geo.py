"""Where a request comes from: country from the request IP (DB-IP Lite), timezone from
the browser.

Two things use this: the admin dashboard's geography, and the regional availability gate
(FrameSeek is offered in India only, see app/middleware.py). The IP is only looked up,
never stored. The database ships in the image (see Dockerfile).
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

# Set by our own nginx (see web/nginx.conf), which is the only public entry point: the API
# container's ingress is internal, so this header cannot be forged by a visitor.
CLIENT_IP_HEADER = "x-client-ip"

_warned_unusable = False


@lru_cache(maxsize=2)
def _reader(path: str):
    if not Path(path).exists():
        logger.info("No IP country database at %s; countries will be unknown", path)
        return None
    try:
        import maxminddb

        return maxminddb.open_database(path)
    except Exception:
        logger.warning("Could not open the IP country database at %s", path, exc_info=True)
        return None


def _public(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        return False
    return addr.is_global


@lru_cache(maxsize=8)
def _networks(raw: str) -> tuple:
    """Parse a comma-separated list of addresses and CIDR ranges. Cached on the raw string,
    so a configuration change is picked up without a stale cache."""
    networks = []
    for entry in (e.strip() for e in raw.split(",")):
        if not entry:
            continue
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            logger.warning("Ignoring an unparseable address in GEO_ALLOWED_IPS: %s", entry)
    return tuple(networks)


def _allowlisted(ip: str) -> bool:
    networks = _networks(settings.GEO_ALLOWED_IPS)
    if not networks:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in networks)


def client_ip(request: Request) -> str | None:
    """The visitor's address.

    In production every public request arrives through our nginx, which resolves the
    visitor from the address its own ingress saw and passes it in X-Client-IP. Without
    that header (local development, calls from inside the environment) fall back to the
    forwarded chain: each proxy appends to X-Forwarded-For, so the right-most public
    address is the one an ingress saw; anything left of it could have been sent by the
    client.
    """
    forwarded = request.headers.get(CLIENT_IP_HEADER)
    if forwarded and _public(forwarded):
        return forwarded.strip()

    chain = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    for ip in reversed(chain):
        if _public(ip):
            return ip
    host = request.client.host if request.client else None
    return host if host and _public(host) else None


def database_available() -> bool:
    """Whether countries can be resolved at all (the admin dashboard says so when not)."""
    return _reader(settings.GEOIP_DB_PATH) is not None


def country_for_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    reader = _reader(settings.GEOIP_DB_PATH)
    if reader is None:
        return None
    try:
        record = reader.get(ip)
    except Exception:
        return None
    code = ((record or {}).get("country") or {}).get("iso_code")
    return code.upper() if isinstance(code, str) and len(code) == 2 else None


def region_allowed(ip: str | None) -> tuple[bool, str | None]:
    """Whether a request from this address may use FrameSeek, with the country it resolved
    to (None when that could not be determined) for logging.

    An address with no country is refused, so an unlisted or anonymising network is not a
    way around the rule. Two cases still pass: a request with no public address at all
    (platform health probes and other traffic from inside the environment), and one whose
    country database is unreadable, which must not lock everybody out. Startup refuses to
    run without the database, so the second case means a corrupt file, and it is loud.
    """
    if not settings.GEO_BLOCKING_ENABLED:
        return True, None
    if ip is None:
        return True, None
    if _allowlisted(ip):
        return True, None
    if _reader(settings.GEOIP_DB_PATH) is None:
        global _warned_unusable
        if not _warned_unusable:  # once per process: this would otherwise log per request
            _warned_unusable = True
            logger.error("Regional availability is on but the IP country database is unusable; serving everyone")
        return True, None

    country = country_for_ip(ip)
    return country in settings.allowed_countries, country


def clean_timezone(value: str | None) -> str | None:
    if not value or len(value) > 64 or not _TIMEZONE.match(value):
        return None
    return value
