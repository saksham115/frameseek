from app import plan_config
from app.config import Settings


def test_stripe_prices_load_from_dotenv_for_catalog_and_webhooks(tmp_path, monkeypatch):
    prices = {
        "STRIPE_PRICE_PRO_MONTHLY": "price_test_pro_monthly",
        "STRIPE_PRICE_PRO_ANNUAL": "price_test_pro_annual",
        "STRIPE_PRICE_PRO_MAX_MONTHLY": "price_test_max_monthly",
        "STRIPE_PRICE_PRO_MAX_ANNUAL": "price_test_max_annual",
    }
    for name in prices:
        monkeypatch.delenv(name, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text("\n".join(f"{name}={value}" for name, value in prices.items()))
    monkeypatch.setattr(plan_config, "settings", Settings(_env_file=env_file))

    plans = {plan["id"]: plan for plan in plan_config.public_plans()}
    assert plans["pro"]["price_id"] == prices["STRIPE_PRICE_PRO_MONTHLY"]
    assert plans["pro"]["annual_price_id"] == prices["STRIPE_PRICE_PRO_ANNUAL"]
    assert plans["pro_max"]["price_id"] == prices["STRIPE_PRICE_PRO_MAX_MONTHLY"]
    assert plans["free"]["price_id"] is None
    assert plan_config.price_to_plan(prices["STRIPE_PRICE_PRO_MONTHLY"]) == plan_config.PlanType.PRO
    assert plan_config.price_to_plan(prices["STRIPE_PRICE_PRO_MAX_ANNUAL"]) == plan_config.PlanType.PRO_MAX
    assert plan_config.price_to_plan("price_unknown") == plan_config.PlanType.FREE
