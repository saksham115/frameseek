from enum import Enum
from dataclasses import dataclass


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
    PlanType.FREE: PlanConfig(
        name="Free",
        storage_limit_bytes=5 * 1024**3,  # 5 GB
        monthly_search_limit=20,
        retention_days=15,
    ),
    PlanType.PRO: PlanConfig(
        name="Pro",
        storage_limit_bytes=20 * 1024**3,  # 20 GB
        monthly_search_limit=100,
        retention_days=90,
    ),
    PlanType.PRO_MAX: PlanConfig(
        name="Pro Max",
        storage_limit_bytes=50 * 1024**3,  # 50 GB
        monthly_search_limit=500,
        retention_days=90,
    ),
}

# App Store Connect product ID -> PlanType mapping
PRODUCT_PLAN_MAP: dict[str, PlanType] = {
    "frameseek_pro_monthly": PlanType.PRO,
    "frameseek_pro_annual": PlanType.PRO,
    "frameseek_promax_monthly": PlanType.PRO_MAX,
    "frameseek_promax_annual": PlanType.PRO_MAX,
}


def get_plan_config(plan_type: str) -> PlanConfig:
    try:
        return PLAN_CONFIGS[PlanType(plan_type)]
    except (ValueError, KeyError):
        return PLAN_CONFIGS[PlanType.FREE]
