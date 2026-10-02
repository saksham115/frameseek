from dataclasses import dataclass
from enum import Enum

from app.config import settings


class PlanType(str, Enum):
    FREE = "free"
    PRO = "pro"
    PRO_MAX = "pro_max"


@dataclass(frozen=True)
class TemplateLimits:
    monthly_renders: int
    max_creation_seconds: int
    max_resolution: int  # short edge in pixels
    watermark: bool
    music_library: bool
    commercial_music: bool
    presets: bool
    priority: bool


@dataclass(frozen=True)
class PlanConfig:
    name: str
    storage_limit_bytes: int
    monthly_search_limit: int
    retention_days: int
    templates: TemplateLimits


PLAN_CONFIGS: dict[PlanType, PlanConfig] = {
    PlanType.FREE: PlanConfig(
        "Free", 5 * 1024**3, 50, 15,
        TemplateLimits(5, 60, 720, watermark=True, music_library=False, commercial_music=False, presets=False, priority=False),
    ),
    PlanType.PRO: PlanConfig(
        "Pro", 20 * 1024**3, 100, 90,
        TemplateLimits(50, 180, 1080, watermark=False, music_library=True, commercial_music=False, presets=False, priority=False),
    ),
    PlanType.PRO_MAX: PlanConfig(
        "Pro Max", 50 * 1024**3, 500, 90,
        TemplateLimits(200, 600, 1080, watermark=False, music_library=True, commercial_music=True, presets=True, priority=True),
    ),
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


def template_limits(plan_type: str) -> TemplateLimits:
    """The template limits that apply to this plan right now. Until TEMPLATE_LIMITS_ENFORCED
    is on (with payments), Free accounts get Pro limits so nobody hits a wall they can't
    pay past; paid plans keep their own."""
    cfg = get_plan_config(plan_type)
    if not settings.TEMPLATE_LIMITS_ENFORCED and cfg is PLAN_CONFIGS[PlanType.FREE]:
        return PLAN_CONFIGS[PlanType.PRO].templates
    return cfg.templates


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
            "monthly_renders": cfg.templates.monthly_renders,
            "max_creation_seconds": cfg.templates.max_creation_seconds,
            "max_resolution": cfg.templates.max_resolution,
            "watermark": cfg.templates.watermark,
        })
    return out
