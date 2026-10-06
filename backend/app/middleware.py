"""Regional availability: FrameSeek is offered in India only.

Every public request reaches the API through our nginx (the API container's ingress is
internal), so this one gate covers the whole platform. Blocked callers get 451 with a
marker header the web app turns into an explanatory screen; a browser opening an API URL
directly is sent to that screen instead of a JSON body.
"""

from __future__ import annotations

import logging

from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.services.geo import client_ip, region_allowed

logger = logging.getLogger(__name__)

# Lets the web app tell this apart from any other refusal (see web/src/api/client.ts).
GEO_BLOCKED_HEADER = "X-Geo-Blocked"

# Never region-checked: the platform's health probe and the deploy's public health check,
# and Stripe's webhook, which is a server-to-server call from outside India.
EXEMPT_PATHS = frozenset({"/health", "/api/v1/subscriptions/webhook"})

# Where a blocked browser navigation lands (a route in the web app).
BLOCKED_PAGE = "/unavailable"


class RegionBlockMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Preflights carry no credentials and are answered before this in the stack, but a
        # refused one would surface as a confusing CORS error rather than our own screen.
        if request.method == "OPTIONS" or request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        ip = client_ip(request)
        allowed, country = region_allowed(ip)
        if allowed:
            return await call_next(request)

        logger.info(
            "Refused a request from outside the served region: country=%s path=%s",
            country or "unknown",
            request.url.path,
        )
        wants_html = "text/html" in request.headers.get("accept", "")
        if wants_html:
            return RedirectResponse(f"{settings.FRONTEND_URL.rstrip('/')}{BLOCKED_PAGE}", status_code=302)
        return JSONResponse(
            status_code=451,
            content={
                "detail": "FrameSeek is only available in India.",
                "code": "region_not_served",
                "country": country,
            },
            headers={GEO_BLOCKED_HEADER: "1"},
        )
