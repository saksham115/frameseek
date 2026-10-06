"""Regional availability: FrameSeek is served in India only.

These exercise the middleware over the real app but need no database: a refused request
never reaches a route, and the served-request probe is /subscriptions/config, which only
reads settings.
"""

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.middleware import GEO_BLOCKED_HEADER

SERVED = "/api/v1/subscriptions/config"  # a GET that touches nothing but settings

INDIA = "49.36.0.1"
UNITED_STATES = "8.8.8.8"
BRITAIN = "51.11.0.1"
# Routable, but not in the country database (a documentation range would not count as a
# public address at all).
UNMAPPED = "196.10.52.1"
# The address an Azure Container Apps egress presents: in Central India, so resolving a
# request to this instead of the visitor would serve the world.
DATACENTRE = "20.219.0.1"

_COUNTRIES = {INDIA: "IN", UNITED_STATES: "US", BRITAIN: "GB", DATACENTRE: "IN"}


class _FakeDatabase:
    """Stands in for the DB-IP reader, with the shape maxminddb returns."""

    def get(self, ip):
        code = _COUNTRIES.get(ip)
        return {"country": {"iso_code": code}} if code else None


@pytest.fixture
def geo_client():
    """The app with the gate on and a known IP-to-country mapping."""
    with (
        patch("app.services.geo._reader", lambda path: _FakeDatabase()),
        patch.object(settings, "GEO_BLOCKING_ENABLED", True),
        patch.object(settings, "ALLOWED_COUNTRIES", "IN"),
        patch.object(settings, "GEO_ALLOWED_IPS", ""),
    ):
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_a_request_from_india_is_served(geo_client):
    resp = await geo_client.get(SERVED, headers={"X-Client-IP": INDIA})
    assert resp.status_code == 200


@pytest.mark.parametrize("ip", [UNITED_STATES, BRITAIN])
async def test_a_request_from_outside_india_is_refused(geo_client, ip):
    resp = await geo_client.get(SERVED, headers={"X-Client-IP": ip})
    assert resp.status_code == 451
    assert resp.headers[GEO_BLOCKED_HEADER] == "1"
    assert resp.json()["code"] == "region_not_served"


async def test_an_address_with_no_country_is_refused(geo_client):
    """An unlisted or anonymising network must not be a way around the rule."""
    resp = await geo_client.get(SERVED, headers={"X-Client-IP": UNMAPPED})
    assert resp.status_code == 451


async def test_the_address_our_proxy_resolved_wins_over_the_forwarded_chain(geo_client):
    """Proxying to the API appends hops of our own, and the last of them sits in an Indian
    datacentre. Trusting the chain would serve everyone, so nginx's header decides."""
    resp = await geo_client.get(
        SERVED,
        headers={"X-Client-IP": UNITED_STATES, "X-Forwarded-For": f"{UNITED_STATES}, {DATACENTRE}"},
    )
    assert resp.status_code == 451


async def test_a_visitor_cannot_talk_their_way_in_through_the_forwarded_chain(geo_client):
    """Without our header (a call from inside the environment) the right-most public
    address decides, and a client's own entries sit to the left of it."""
    resp = await geo_client.get(SERVED, headers={"X-Forwarded-For": f"{INDIA}, {UNITED_STATES}"})
    assert resp.status_code == 451


async def test_health_is_never_refused(geo_client):
    """Platform probes and the deploy's public health check, which runs from abroad."""
    resp = await geo_client.get("/health", headers={"X-Client-IP": UNITED_STATES})
    assert resp.status_code != 451


async def test_the_stripe_webhook_is_not_region_checked(geo_client):
    """Stripe calls from its own servers, which are not in India."""
    resp = await geo_client.post(
        "/api/v1/subscriptions/webhook",
        headers={"X-Client-IP": UNITED_STATES},
        content=b"{}",
    )
    assert resp.status_code != 451


async def test_a_listed_address_skips_the_country_check(geo_client):
    with patch.object(settings, "GEO_ALLOWED_IPS", f"198.51.100.7,{UNITED_STATES}/32"):
        resp = await geo_client.get(SERVED, headers={"X-Client-IP": UNITED_STATES})
    assert resp.status_code == 200


async def test_traffic_from_inside_the_environment_is_served(geo_client):
    """Health probes and other internal callers have no public address."""
    resp = await geo_client.get(SERVED, headers={"X-Forwarded-For": "10.0.0.4"})
    assert resp.status_code == 200


async def test_a_browser_is_sent_to_the_explanation_page(geo_client):
    """Opening an API URL directly (the OAuth redirect, for instance) should not land a
    visitor on a JSON body."""
    resp = await geo_client.get(
        "/api/v1/auth/google/start",
        headers={"X-Client-IP": UNITED_STATES, "Accept": "text/html"},
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == f"{settings.FRONTEND_URL}/unavailable"


async def test_a_refusal_carries_the_cross_origin_headers(geo_client):
    """The web app can only read the 451 if CORS wraps the refusal, which depends on the
    order the middleware is added in."""
    origin = settings.cors_origins_list[0]
    resp = await geo_client.get(SERVED, headers={"X-Client-IP": UNITED_STATES, "Origin": origin})
    assert resp.status_code == 451
    assert resp.headers["access-control-allow-origin"] == origin


async def test_nothing_is_refused_while_the_gate_is_off():
    with patch.object(settings, "GEO_BLOCKING_ENABLED", False):
        client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        resp = await client.get(SERVED, headers={"X-Client-IP": UNITED_STATES})
    assert resp.status_code == 200


async def test_an_unusable_country_database_does_not_lock_everybody_out():
    """Startup refuses to run without the database, so this means a corrupt file: serving
    the world briefly beats refusing it."""
    with (
        patch("app.services.geo._reader", lambda path: None),
        patch.object(settings, "GEO_BLOCKING_ENABLED", True),
    ):
        client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        resp = await client.get(SERVED, headers={"X-Client-IP": UNITED_STATES})
    assert resp.status_code == 200


def test_startup_refuses_the_gate_without_a_country_database(tmp_path):
    with (
        patch.object(settings, "GEO_BLOCKING_ENABLED", True),
        patch.object(settings, "GEOIP_DB_PATH", str(tmp_path / "missing.mmdb")),
        patch.object(settings, "JWT_SECRET_KEY", "a-real-secret"),
    ):
        with pytest.raises(RuntimeError, match="no IP country database"):
            settings.validate_runtime()
