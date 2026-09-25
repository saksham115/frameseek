import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.routers import analytics, auth, clips, folders, jobs, search, storage, subscriptions, videos

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.database import engine

    # Fail fast on unsafe config (placeholder JWT secret, missing prod keys).
    settings.validate_runtime()

    # Wire Application Insights when configured (no-op locally).
    import os

    if os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING"):
        try:
            from azure.monitor.opentelemetry import configure_azure_monitor

            configure_azure_monitor(logger_name="app")
            logger.info("Application Insights configured")
        except Exception:
            logger.exception("Failed to configure Application Insights")

    yield
    await engine.dispose()


app = FastAPI(
    title="FrameSeek API",
    description="AI-powered video search platform",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None if not settings.DEBUG else "/docs",
    redoc_url=None if not settings.DEBUG else "/redoc",
)

# Cookie sessions require a concrete origin allowlist (not "*") with credentials enabled.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(videos.router, prefix="/api/v1/videos", tags=["videos"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
app.include_router(folders.router, prefix="/api/v1/folders", tags=["folders"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
app.include_router(storage.router, prefix="/api/v1/storage", tags=["storage"])
app.include_router(clips.router, prefix="/api/v1/clips", tags=["clips"])
app.include_router(subscriptions.router, prefix="/api/v1/subscriptions", tags=["subscriptions"])


@app.get("/health")
async def health_check():
    """Liveness + dependency check. Returns 503 if Postgres is unreachable."""
    from fastapi import Response
    from app.database import async_session

    checks = {"api": "ok"}
    status_code = 200
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception:
        checks["postgres"] = "error"
        status_code = 503

    return Response(
        content=str(checks).replace("'", '"'),
        media_type="application/json",
        status_code=status_code,
    )
