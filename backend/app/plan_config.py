from dataclasses import dataclass
from enum import Enum

from app.config import settings


class PlanType(str, Enum):
    FREE = "free"
    PRO = "pro"
    PRO_MAX = "pro_max"


@dataclass(frozen=True)
class PlanConfig:
    name: str
    storage_limit_bytes: int
    monthly_search_limit: int
    retention_days: int


PLAN_CONFIGS: dict[PlanType, PlanConfig] = {
    PlanType.FREE: PlanConfig("Free", 5 * 1024**3, 50, 15),
    PlanType.PRO: PlanConfig("Pro", 20 * 1024**3, 100, 90),
    PlanType.PRO_MAX: PlanConfig("Pro Max", 50 * 1024**3, 500, 90),
}


# Stripe price IDs come from settings, including the local .env file.
# Each plan can have monthly and annual prices. Any that map to a paid plan let the
# webhook resolve which plan a Stripe subscription grants.
def _price_env(plan: PlanType, interval: str) -> str | None:
    return getattr(settings, f"STRIPE_PRICE_{plan.name}_{interval.upper()}", "") or None


def _plan_prices() -> dict[PlanType, dict[str, str | None]]:
    return {
        plan: {interval: _price_env(plan, interval) for interval in ("monthly", "annual")}
        for plan in (PlanType.PRO, PlanType.PRO_MAX)
    }


def price_to_plan(price_id: str) -> PlanType:
    for plan, prices in _plan_prices().items():
        if price_id in (prices.get("monthly"), prices.get("annual")):
            return plan
    return PlanType.FREE


def get_plan_config(plan_type: str) -> PlanConfig:
    try:
        return PLAN_CONFIGS[PlanType(plan_type)]
    except (ValueError, KeyError):
        return PLAN_CONFIGS[PlanType.FREE]


def public_plans() -> list[dict]:
    """Plan catalog for the web paywall."""
    out: list[dict] = []
    for plan in (PlanType.FREE, PlanType.PRO, PlanType.PRO_MAX):
        cfg = PLAN_CONFIGS[plan]
        prices = _plan_prices().get(plan, {})
        out.append({
            "id": plan.value,
            "name": cfg.name,
            "price_id": prices.get("monthly"),  # default checkout uses the monthly price
            "annual_price_id": prices.get("annual"),
            "storage_gb": cfg.storage_limit_bytes // (1024**3),
            "monthly_searches": cfg.monthly_search_limit,
        })
    return out
