from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from unittest.mock import AsyncMock, Mock

import httpx
import pytest

from app.config import settings
from app.services import embedding_service
from app.services.embedding_service import EmbeddingService, EmbeddingUnavailableError


async def test_missing_endpoint_fails_before_requesting_azure_token(monkeypatch):
    monkeypatch.setattr(settings, "AZURE_VISION_ENDPOINT", "")
    service = EmbeddingService()
    service._token = Mock()
    with pytest.raises(EmbeddingUnavailableError, match="endpoint is not configured"):
        await service.generate_text_embedding("a blue frame")
    service._token.assert_not_called()


@pytest.fixture
def azure_http(monkeypatch):
    monkeypatch.setattr(settings, "AZURE_VISION_ENDPOINT", "https://vision.test")
    monkeypatch.setattr(EmbeddingService, "_token", lambda self: "test-token")
    monkeypatch.setattr(embedding_service.random, "uniform", lambda *args: 0)
    sleep = AsyncMock()
    monkeypatch.setattr(embedding_service.asyncio, "sleep", sleep)
    real_client = httpx.AsyncClient

    def install(handler):
        monkeypatch.setattr(
            embedding_service.httpx, "AsyncClient",
            lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
        )
        return sleep

    return install


@pytest.mark.parametrize("headers,delay", [
    ({"Retry-After": "12"}, 12),
    ({"retry-after-ms": "1500"}, 1.5),
    ({"x-ms-retry-after-ms": "2500"}, 2.5),
])
async def test_image_rate_limit_retries_same_frame_after_azure_cooldown(azure_http, tmp_path, headers, delay):
    requests = []

    def handler(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(429, headers=headers)
        return httpx.Response(200, json={"vector": [0.1] * 1024})

    sleep = azure_http(handler)
    image = tmp_path / "frame.jpg"
    image.write_bytes(b"test-image")
    service = EmbeddingService(max_retries=5, retry_budget_seconds=180)
    assert len(await service.generate_image_embedding(str(image))) == 1024
    sleep.assert_awaited_once_with(delay)
    assert [r.content for r in requests] == [b"test-image", b"test-image"]


async def test_http_date_retry_after_is_honored(azure_http):
    calls = 0
    retry_at = datetime.now(timezone.utc) + timedelta(seconds=120)

    def handler(request):
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, headers={"Retry-After": format_datetime(retry_at, usegmt=True)})
        return httpx.Response(200, json={"vector": [0.2]})

    sleep = azure_http(handler)
    await EmbeddingService(retry_budget_seconds=180).generate_text_embedding("butterfly")
    assert 118 <= sleep.await_args.args[0] <= 120


async def test_transient_server_and_network_failures_recover(azure_http):
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, headers={"Retry-After": "invalid"})
        if calls == 2:
            raise httpx.ReadTimeout("temporary timeout", request=request)
        return httpx.Response(200, json={"vector": [0.3]})

    sleep = azure_http(handler)
    assert await EmbeddingService().generate_text_embedding("butterfly") == [0.3]
    assert [call.args[0] for call in sleep.await_args_list] == [1, 2]


@pytest.mark.parametrize("status", [400, 401, 403, 404])
async def test_permanent_errors_are_not_retried(azure_http, status):
    sleep = azure_http(lambda request: httpx.Response(status))
    with pytest.raises(httpx.HTTPStatusError):
        await EmbeddingService().generate_text_embedding("butterfly")
    sleep.assert_not_awaited()


async def test_long_cooldown_does_not_block_interactive_search(azure_http):
    sleep = azure_http(lambda request: httpx.Response(429, headers={"Retry-After": "3600"}))
    with pytest.raises(EmbeddingUnavailableError, match="rate limited"):
        await EmbeddingService().generate_text_embedding("butterfly")
    sleep.assert_not_awaited()


async def test_repeated_throttling_has_bounded_retries(azure_http):
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(429, headers={"Retry-After": "1"})

    sleep = azure_http(handler)
    with pytest.raises(EmbeddingUnavailableError, match="rate limited"):
        await EmbeddingService(max_retries=2).generate_text_embedding("butterfly")
    assert calls == 3
    assert sleep.await_count == 2


async def test_missing_header_backs_off_and_respects_total_wait_budget(azure_http):
    sleep = azure_http(lambda request: httpx.Response(429))
    with pytest.raises(EmbeddingUnavailableError, match="rate limited"):
        await EmbeddingService(max_retries=5, retry_budget_seconds=12).generate_text_embedding("butterfly")
    sleep.assert_awaited_once_with(5)
