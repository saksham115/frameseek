from unittest.mock import Mock

import pytest

from app.config import settings
from app.services.embedding_service import EmbeddingService, EmbeddingUnavailableError


async def test_missing_endpoint_fails_before_requesting_azure_token(monkeypatch):
    monkeypatch.setattr(settings, "AZURE_VISION_ENDPOINT", "")
    service = EmbeddingService()
    service._token = Mock()
    with pytest.raises(EmbeddingUnavailableError, match="endpoint is not configured"):
        await service.generate_text_embedding("a blue frame")
    service._token.assert_not_called()
