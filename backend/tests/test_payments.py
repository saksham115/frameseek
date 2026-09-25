import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.config import Settings, settings

URL = "/api/v1/subscriptions"


@pytest.mark.parametrize("enabled", [False, True])
async def test_public_payment_config(client, monkeypatch, enabled):
    monkeypatch.setattr(settings, "PAYMENTS_ENABLED", enabled)
    response = await client.get(f"{URL}/config")
    assert response.status_code == 200
    assert response.json()["data"] == {"payments_enabled": enabled}


@pytest.mark.parametrize("endpoint", ["checkout", "portal", "webhook"])
async def test_disabled_payments_never_call_stripe(client, test_user, monkeypatch, endpoint):
    monkeypatch.setattr(settings, "PAYMENTS_ENABLED", False)
    # A configured key must not override the flag.
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_unused")
    stripe = MagicMock()
    monkeypatch.setitem(sys.modules, "stripe", stripe)

    response = await client.post(
        f"{URL}/{endpoint}", json={"price_id": "price_test"}, headers=test_user["headers"],
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Payments are currently disabled."
    assert stripe.mock_calls == []


@pytest.mark.parametrize("endpoint", ["checkout", "portal", "webhook"])
async def test_enabled_payments_reach_stripe(client, db_session, test_user, monkeypatch, endpoint):
    monkeypatch.setattr(settings, "PAYMENTS_ENABLED", True)
    stripe = MagicMock()
    monkeypatch.setitem(sys.modules, "stripe", stripe)
    stripe.Customer.create.return_value = SimpleNamespace(id="cus_test")
    stripe.checkout.Session.create.return_value = SimpleNamespace(url="https://checkout.stripe.test/session")
    stripe.billing_portal.Session.create.return_value = SimpleNamespace(url="https://billing.stripe.test/session")
    stripe.Webhook.construct_event.return_value = {"type": "ignored.test.event", "data": {"object": {}}}
    if endpoint == "portal":
        test_user["user"].stripe_customer_id = "cus_test"
        await db_session.commit()

    response = await client.post(
        f"{URL}/{endpoint}", json={"price_id": "price_test"}, headers=test_user["headers"],
    )
    assert response.status_code == 200
    if endpoint == "checkout":
        stripe.Customer.create.assert_called_once()
        stripe.checkout.Session.create.assert_called_once()
        assert response.json()["data"]["url"] == "https://checkout.stripe.test/session"
    elif endpoint == "portal":
        stripe.billing_portal.Session.create.assert_called_once()
        assert response.json()["data"]["url"] == "https://billing.stripe.test/session"
    else:
        stripe.Webhook.construct_event.assert_called_once()
        assert response.json() == {"received": True}


@pytest.mark.parametrize("enabled", [False, True])
def test_production_requires_stripe_keys_only_when_enabled(enabled):
    config = Settings(
        _env_file=None,
        DEBUG=False,
        JWT_SECRET_KEY="test-only-secret",
        AZURE_STORAGE_ACCOUNT_URL="https://storage.test",
        GOOGLE_CLIENT_ID="test-client",
        GOOGLE_CLIENT_SECRET="test-secret",
        PAYMENTS_ENABLED=enabled,
        STRIPE_SECRET_KEY="",
        STRIPE_WEBHOOK_SECRET="",
    )
    if enabled:
        with pytest.raises(RuntimeError, match="Stripe keys"):
            config.validate_runtime()
        config.STRIPE_SECRET_KEY = "sk_test_example"
        config.STRIPE_WEBHOOK_SECRET = "whsec_test_example"
    config.validate_runtime()


def test_payments_default_off_and_can_be_enabled_from_dotenv(tmp_path, monkeypatch):
    monkeypatch.delenv("PAYMENTS_ENABLED", raising=False)
    assert Settings(_env_file=None).PAYMENTS_ENABLED is False
    env_file = tmp_path / ".env"
    env_file.write_text("PAYMENTS_ENABLED=true\n")
    assert Settings(_env_file=env_file).PAYMENTS_ENABLED is True
