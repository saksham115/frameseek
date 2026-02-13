from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import auth, videos, search, jobs, folders, analytics, storage


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    from app.database import engine, Base
    from app.models import user, video, frame, job, folder, search_history

    # Validate GCP Vertex AI configuration
    if not settings.GCP_PROJECT_ID:
        raise RuntimeError("GCP_PROJECT_ID is not set. Vertex AI embeddings require GCP configuration.")
    if not settings.GCP_LOCATION:
        raise RuntimeError("GCP_LOCATION is not set. Vertex AI embeddings require GCP configuration.")
    if not settings.GCP_SERVICE_ACCOUNT_PATH:
        raise RuntimeError("GCP_SERVICE_ACCOUNT_PATH is not set. Provide the path to your service account JSON file.")

    from pathlib import Path
    if not Path(settings.GCP_SERVICE_ACCOUNT_PATH).is_file():
        raise RuntimeError(f"Service account file not found: {settings.GCP_SERVICE_ACCOUNT_PATH}")

    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="FrameSeek API",
    description="AI-powered video search platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static storage for serving frames/thumbnails
app.mount("/storage", StaticFiles(directory=settings.STORAGE_BASE_PATH), name="storage")

# Register routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(videos.router, prefix="/api/v1/videos", tags=["videos"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
app.include_router(folders.router, prefix="/api/v1/folders", tags=["folders"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
app.include_router(storage.router, prefix="/api/v1/storage", tags=["storage"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "frameseek-api"}
