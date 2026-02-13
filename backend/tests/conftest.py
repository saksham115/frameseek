import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.database import Base, get_db
from app.models.user import User
from app.utils.security import create_access_token, create_refresh_token, hash_password

# ---------------------------------------------------------------------------
# Test DB URL – reuse settings host/port but target the `frameseek_test` DB.
# NullPool avoids connection reuse across event loops.
# ---------------------------------------------------------------------------
_base_url = settings.DATABASE_URL
_test_db_url = _base_url.rsplit("/", 1)[0] + "/frameseek_test"

engine = create_async_engine(_test_db_url, echo=False, poolclass=NullPool)
TestingSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

_tables_created = False


# ---------------------------------------------------------------------------
# Function-scoped DB session — for test fixture setup / assertions.
# Creates tables on first use, truncates after each test.
# ---------------------------------------------------------------------------
@pytest.fixture
async def db_session():
    global _tables_created
    if not _tables_created:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        _tables_created = True

    async with TestingSessionLocal() as session:
        yield session
        # Best-effort commit; swallow errors so truncation always runs.
        try:
            await session.commit()
        except Exception:
            await session.rollback()

    # Truncate all tables after the test — always runs.
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE TABLE "
                "search_history, user_analytics, frames, jobs, videos, folders, users "
                "CASCADE"
            )
        )


# ---------------------------------------------------------------------------
# Temp storage directory
# ---------------------------------------------------------------------------
@pytest.fixture
def storage_dir(tmp_path):
    (tmp_path / "videos").mkdir()
    (tmp_path / "frames").mkdir()
    return tmp_path


# ---------------------------------------------------------------------------
# ASGI test client with dependency overrides & external-service mocks
# ---------------------------------------------------------------------------
@pytest.fixture
async def client(db_session: AsyncSession, storage_dir):
    from app.main import app

    # Override get_db → give the app its own sessions from the test engine.
    async def _override_get_db():
        async with TestingSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db

    # Mock extract_metadata (ffprobe)
    mock_metadata = MagicMock()
    mock_metadata.duration_seconds = 120.5
    mock_metadata.fps = 30.0
    mock_metadata.width = 1920
    mock_metadata.height = 1080
    mock_metadata.codec = "h264"

    # Mock vector_db (Qdrant)
    mock_vector_db = MagicMock()
    mock_vector_db.search.return_value = []
    mock_vector_db.create_collection.return_value = True
    mock_vector_db.upsert_embeddings.return_value = 0
    mock_vector_db.delete_embeddings.return_value = 0

    # Mock enqueue_job (ARQ / Redis)
    mock_enqueue = AsyncMock()

    # Mock EmbeddingService.generate_text_embedding
    mock_text_embedding = AsyncMock(return_value=[0.1] * 1408)

    with (
        patch("app.services.video_service.extract_metadata", return_value=mock_metadata) as _mock_extract,
        patch("app.services.search_service.vector_db", mock_vector_db),
        patch("app.workers.worker.enqueue_job", mock_enqueue),
        patch("app.services.search_service.EmbeddingService") as MockEmbedSvc,
        patch.object(settings, "STORAGE_BASE_PATH", str(storage_dir)),
        patch("app.database.async_session", TestingSessionLocal),
    ):
        MockEmbedSvc.return_value.generate_text_embedding = mock_text_embedding
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            ac.mock_extract_metadata = _mock_extract
            ac.mock_vector_db = mock_vector_db
            ac.mock_enqueue = mock_enqueue
            ac.mock_embed_service = MockEmbedSvc
            ac.storage_dir = storage_dir
            yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def _make_tokens(user: User) -> dict:
    token_data = {
        "sub": str(user.user_id),
        "email": user.email,
        "name": user.name,
        "plan": user.plan_type,
    }
    access = create_access_token(token_data)
    refresh = create_refresh_token(token_data)
    return {
        "access_token": access,
        "refresh_token": refresh,
        "headers": {"Authorization": f"Bearer {access}"},
    }


async def _create_user_in_db(
    session: AsyncSession,
    *,
    email: str = "test@example.com",
    name: str = "Test User",
    password: str = "testpassword123",
) -> dict:
    user = User(
        email=email,
        name=name,
        password_hash=hash_password(password),
    )
    session.add(user)
    await session.flush()
    await session.commit()
    tokens = _make_tokens(user)
    return {
        "user": user,
        "user_id": user.user_id,
        "password": password,
        **tokens,
    }


# ---------------------------------------------------------------------------
# Pre-built user fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
async def test_user(db_session: AsyncSession) -> dict:
    return await _create_user_in_db(db_session, email="alice@test.com", name="Alice")


@pytest.fixture
async def second_user(db_session: AsyncSession) -> dict:
    return await _create_user_in_db(db_session, email="bob@test.com", name="Bob")


# ---------------------------------------------------------------------------
# Pre-built data fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
async def test_video(db_session: AsyncSession, test_user: dict):
    from app.models.video import Video

    video = Video(
        user_id=test_user["user_id"],
        title="Test Video",
        original_filename="test.mp4",
        file_path="/tmp/fake/test.mp4",
        file_size_bytes=1024000,
        status="uploaded",
        source_type="local",
    )
    db_session.add(video)
    await db_session.flush()
    await db_session.commit()
    return video


@pytest.fixture
async def ready_video(db_session: AsyncSession, test_user: dict):
    from app.models.video import Video

    video = Video(
        user_id=test_user["user_id"],
        title="Ready Video",
        original_filename="ready.mp4",
        file_path="/tmp/fake/ready.mp4",
        file_size_bytes=2048000,
        status="ready",
        source_type="local",
        frame_count=60,
        duration_seconds=120,
    )
    db_session.add(video)
    await db_session.flush()
    await db_session.commit()
    return video


@pytest.fixture
async def test_folder(db_session: AsyncSession, test_user: dict):
    from app.models.folder import Folder

    folder = Folder(
        user_id=test_user["user_id"],
        name="Test Folder",
        path="/Test Folder",
    )
    db_session.add(folder)
    await db_session.flush()
    await db_session.commit()
    return folder


@pytest.fixture
async def test_job(db_session: AsyncSession, test_user: dict, test_video):
    from app.models.job import Job

    job = Job(
        user_id=test_user["user_id"],
        video_id=test_video.video_id,
        job_type="video_processing",
        frame_interval_seconds=2.0,
        status="queued",
    )
    db_session.add(job)
    # Mark video as queued too
    test_video.status = "queued"
    await db_session.flush()
    await db_session.commit()
    return job
