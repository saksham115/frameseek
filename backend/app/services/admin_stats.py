"""Usage numbers for the admin dashboard, straight from the database.

Each query is a single aggregate; day-by-day series come from generate_series so days with
no activity show as zero instead of disappearing.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.template_catalog import list_templates


def _plain(row) -> dict:
    # Postgres numeric comes back as Decimal, which would serialise as a string.
    return {k: (float(v) if isinstance(v, Decimal) else v) for k, v in dict(row).items()}


async def _one(db: AsyncSession, sql: str, **params) -> dict:
    row = (await db.execute(text(sql), params)).mappings().first()
    return _plain(row) if row else {}


async def _all(db: AsyncSession, sql: str, **params) -> list[dict]:
    return [_plain(r) for r in (await db.execute(text(sql), params)).mappings().all()]


def _days(days_back: int) -> str:
    return f"generate_series((now() AT TIME ZONE 'UTC')::date - {int(days_back) - 1}, (now() AT TIME ZONE 'UTC')::date, interval '1 day')"


async def overview(db: AsyncSession, days: int) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    p = {"since": since}

    users = await _one(db, """
        SELECT
          count(*) FILTER (WHERE deleted_at IS NULL) AS total,
          count(*) FILTER (WHERE deleted_at IS NULL AND created_at >= :since) AS new_in_range,
          count(*) FILTER (WHERE deleted_at IS NULL AND created_at >= now() - interval '7 days') AS new_7d,
          count(*) FILTER (WHERE deleted_at IS NULL AND last_seen_at >= now() - interval '1 day') AS active_1d,
          count(*) FILTER (WHERE deleted_at IS NULL AND last_seen_at >= now() - interval '7 days') AS active_7d,
          count(*) FILTER (WHERE deleted_at IS NULL AND last_seen_at >= now() - interval '30 days') AS active_30d,
          count(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted,
          count(*) FILTER (WHERE deleted_at IS NULL AND tos_accepted_at IS NULL) AS terms_pending,
          count(*) FILTER (WHERE deleted_at IS NULL AND country_code IS NULL) AS unknown_country
        FROM users
    """, **p)
    users["with_videos"] = (await _one(db, """
        SELECT count(DISTINCT v.user_id) AS n FROM videos v JOIN users u ON u.user_id = v.user_id
        WHERE v.deleted_at IS NULL AND u.deleted_at IS NULL
    """)).get("n", 0)
    users["with_creations"] = (await _one(db, """
        SELECT count(DISTINCT user_id) AS n FROM creations WHERE deleted_at IS NULL
    """)).get("n", 0)

    signups_daily = await _all(db, f"""
        SELECT d::date AS day,
          (SELECT count(*) FROM users u WHERE (u.created_at AT TIME ZONE 'UTC')::date = d::date) AS signups,
          (SELECT count(*) FROM user_active_days a WHERE a.day = d::date) AS active
        FROM {_days(days)} d ORDER BY d
    """)

    plans = await _all(db, """
        SELECT plan_type AS plan, count(*) AS users FROM users WHERE deleted_at IS NULL
        GROUP BY plan_type ORDER BY users DESC
    """)
    countries = await _all(db, """
        SELECT country_code AS code, count(*) AS users,
          count(*) FILTER (WHERE last_seen_at >= now() - interval '30 days') AS active_30d,
          count(*) FILTER (WHERE created_at >= :since) AS new_in_range
        FROM users WHERE deleted_at IS NULL AND country_code IS NOT NULL
        GROUP BY country_code ORDER BY users DESC
    """, **p)
    timezones = await _all(db, """
        SELECT timezone AS tz, count(*) AS users FROM users
        WHERE deleted_at IS NULL AND timezone IS NOT NULL
        GROUP BY timezone ORDER BY users DESC LIMIT 12
    """)

    content = await _one(db, """
        SELECT
          count(*) AS videos,
          count(*) FILTER (WHERE status = 'ready') AS ready,
          count(*) FILTER (WHERE status IN ('queued', 'processing', 'uploaded')) AS in_progress,
          count(*) FILTER (WHERE status = 'error') AS failed,
          count(*) FILTER (WHERE status = 'error' AND created_at >= :since) AS failed_in_range,
          count(*) FILTER (WHERE created_at >= :since) AS uploaded_in_range,
          coalesce(sum(duration_seconds) FILTER (WHERE status = 'ready'), 0) / 3600.0 AS hours,
          coalesce(avg(duration_seconds) FILTER (WHERE status = 'ready'), 0) / 60.0 AS avg_minutes,
          count(*) FILTER (WHERE has_transcript) AS transcribed,
          coalesce(sum(frame_count), 0) AS frames,
          coalesce(avg(EXTRACT(EPOCH FROM (processed_at - created_at)))
            FILTER (WHERE status = 'ready' AND processed_at IS NOT NULL AND created_at >= :since), 0) / 60.0
            AS avg_processing_minutes
        FROM videos WHERE deleted_at IS NULL
    """, **p)
    content["storage_bytes"] = (await _one(db, """
        SELECT coalesce(sum(storage_used_bytes), 0) AS b FROM users WHERE deleted_at IS NULL
    """)).get("b", 0)
    content["storage_limit_bytes"] = (await _one(db, """
        SELECT coalesce(sum(storage_limit_bytes), 0) AS b FROM users WHERE deleted_at IS NULL
    """)).get("b", 0)
    uploads_daily = await _all(db, f"""
        SELECT d::date AS day,
          (SELECT count(*) FROM videos v WHERE (v.created_at AT TIME ZONE 'UTC')::date = d::date) AS videos,
          (SELECT coalesce(sum(v.duration_seconds), 0) / 3600.0 FROM videos v
             WHERE (v.created_at AT TIME ZONE 'UTC')::date = d::date) AS hours
        FROM {_days(days)} d ORDER BY d
    """)

    searches = await _one(db, """
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE created_at >= :since) AS in_range,
          count(DISTINCT user_id) FILTER (WHERE created_at >= :since) AS searchers_in_range,
          coalesce(avg(search_time_ms) FILTER (WHERE created_at >= :since), 0) AS avg_ms,
          coalesce(avg(CASE WHEN results_count = 0 THEN 1.0 ELSE 0.0 END) FILTER (WHERE created_at >= :since), 0)
            AS zero_result_rate
        FROM search_history
    """, **p)
    searches["quota_requests_in_range"] = (await _one(db, """
        SELECT count(*) AS n FROM search_quota_requests WHERE created_at >= :since
    """, **p)).get("n", 0)
    searches_daily = await _all(db, f"""
        SELECT d::date AS day,
          (SELECT count(*) FROM search_history s WHERE (s.created_at AT TIME ZONE 'UTC')::date = d::date) AS searches
        FROM {_days(days)} d ORDER BY d
    """)

    creations = await _one(db, """
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE created_at >= :since) AS in_range,
          count(*) FILTER (WHERE NOT EXISTS (
            SELECT 1 FROM renders r WHERE r.creation_id = c.creation_id AND r.status = 'ready')) AS drafts
        FROM creations c WHERE deleted_at IS NULL
    """, **p)
    creations["rendered"] = (creations.get("total") or 0) - (creations.get("drafts") or 0)
    renders = await _one(db, """
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE created_at >= :since) AS in_range,
          count(*) FILTER (WHERE status = 'ready' AND created_at >= :since) AS ready_in_range,
          count(*) FILTER (WHERE status = 'failed' AND created_at >= :since) AS failed_in_range,
          count(*) FILTER (WHERE status IN ('queued', 'rendering')) AS active,
          coalesce(avg(EXTRACT(EPOCH FROM (completed_at - created_at)))
            FILTER (WHERE status = 'ready' AND created_at >= :since), 0) AS avg_seconds,
          coalesce(sum(duration_seconds) FILTER (WHERE status = 'ready'), 0) / 60.0 AS minutes_rendered,
          count(*) FILTER (WHERE status = 'ready' AND resolution >= 1080) AS hd
        FROM renders
    """, **p)
    finished = (renders.get("ready_in_range") or 0) + (renders.get("failed_in_range") or 0)
    renders["success_rate"] = (renders.get("ready_in_range") or 0) / finished if finished else None
    renders_daily = await _all(db, f"""
        SELECT d::date AS day,
          (SELECT count(*) FROM renders r WHERE (r.created_at AT TIME ZONE 'UTC')::date = d::date AND r.status = 'ready') AS ready,
          (SELECT count(*) FROM renders r WHERE (r.created_at AT TIME ZONE 'UTC')::date = d::date AND r.status = 'failed') AS failed
        FROM {_days(days)} d ORDER BY d
    """)

    names = {t["id"]: t["name"] for t in list_templates()}
    templates = await _all(db, """
        SELECT c.template_id, count(*) AS creations,
          count(DISTINCT r.creation_id) FILTER (WHERE r.status = 'ready') AS rendered
        FROM creations c LEFT JOIN renders r ON r.creation_id = c.creation_id
        WHERE c.deleted_at IS NULL GROUP BY c.template_id ORDER BY creations DESC
    """)
    for t in templates:
        t["name"] = names.get(t["template_id"], t["template_id"])
    formats = await _all(db, """
        SELECT settings->>'format' AS format, count(*) AS creations FROM creations
        WHERE deleted_at IS NULL GROUP BY 1 ORDER BY creations DESC
    """)
    music = await _one(db, """
        SELECT
          count(*) FILTER (WHERE settings->'music'->>'track_id' IS NOT NULL) AS stock,
          count(*) FILTER (WHERE settings->'music'->>'track_id' IS NULL AND settings->'music'->>'asset_id' IS NOT NULL) AS own,
          count(*) FILTER (WHERE settings->'music'->>'track_id' IS NULL AND settings->'music'->>'asset_id' IS NULL) AS none
        FROM creations WHERE deleted_at IS NULL
    """)

    feedback = await _one(db, """
        SELECT count(*) AS total, count(*) FILTER (WHERE created_at >= :since) AS in_range FROM user_feedback
    """, **p)
    feedback["by_category"] = await _all(db, """
        SELECT category, count(*) AS n FROM user_feedback WHERE created_at >= :since
        GROUP BY category ORDER BY n DESC
    """, **p)
    deletions = await _one(db, """
        SELECT count(*) AS total, count(*) FILTER (WHERE created_at >= :since) AS in_range
        FROM account_deletion_feedback
    """, **p)
    deletions["reasons"] = await _all(db, """
        SELECT reason, count(*) AS n FROM account_deletion_feedback WHERE created_at >= :since
        GROUP BY reason ORDER BY n DESC
    """, **p)

    return {
        "generated_at": datetime.now(timezone.utc),
        "days": days,
        "geo_enabled": _geo_enabled(),
        "users": users,
        "daily": _merge_daily(signups_daily, uploads_daily, searches_daily, renders_daily),
        "plans": plans,
        "countries": countries,
        "timezones": timezones,
        "content": content,
        "searches": searches,
        "creations": creations,
        "renders": renders,
        "templates": templates,
        "formats": formats,
        "music": music,
        "feedback": feedback,
        "deletions": deletions,
    }


def _geo_enabled() -> bool:
    from app.services.geo import _reader

    return _reader() is not None


def _merge_daily(*series: list[dict]) -> list[dict]:
    merged: dict = {}
    for rows in series:
        for r in rows:
            merged.setdefault(r["day"], {"day": r["day"]}).update(r)
    return [merged[k] for k in sorted(merged)]


_USER_SORTS = {
    "joined": "u.created_at",
    "last_seen": "u.last_seen_at",
    "storage": "u.storage_used_bytes",
    "videos": "videos",
    "searches": "searches",
    "creations": "creations",
}


async def users(db: AsyncSession, q: str | None, sort: str, page: int, limit: int) -> dict:
    where = "u.deleted_at IS NULL"
    params: dict = {"limit": limit, "offset": (page - 1) * limit}
    if q and q.strip():
        where += " AND (u.email ILIKE :q OR u.name ILIKE :q OR u.country_code = upper(:raw))"
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        params |= {"q": f"%{escaped}%", "raw": q.strip()[:2]}
    order = _USER_SORTS.get(sort, "u.created_at")
    rows = await _all(db, f"""
        SELECT u.user_id, u.email, u.name, u.plan_type, u.country_code, u.timezone,
          u.created_at, u.last_seen_at, u.storage_used_bytes, u.monthly_search_count,
          (SELECT count(*) FROM videos v WHERE v.user_id = u.user_id AND v.deleted_at IS NULL) AS videos,
          (SELECT count(*) FROM search_history s WHERE s.user_id = u.user_id) AS searches,
          (SELECT count(*) FROM creations c WHERE c.user_id = u.user_id AND c.deleted_at IS NULL) AS creations,
          (SELECT count(*) FROM renders r WHERE r.user_id = u.user_id AND r.status = 'ready') AS renders
        FROM users u WHERE {where}
        ORDER BY {order} DESC NULLS LAST, u.created_at DESC
        LIMIT :limit OFFSET :offset
    """, **params)
    total = (await _one(db, f"SELECT count(*) AS n FROM users u WHERE {where}", **params)).get("n", 0)
    return {"users": rows, "total": total, "page": page, "limit": limit}


async def feedback(db: AsyncSession, page: int, limit: int) -> dict:
    rows = await _all(db, """
        SELECT feedback_id, email, category, message, page, created_at FROM user_feedback
        ORDER BY created_at DESC LIMIT :limit OFFSET :offset
    """, limit=limit, offset=(page - 1) * limit)
    total = (await _one(db, "SELECT count(*) AS n FROM user_feedback")).get("n", 0)
    return {"feedback": rows, "total": total, "page": page, "limit": limit}


async def admins(db: AsyncSession) -> list[dict]:
    rows = await _all(db, "SELECT email, added_by, created_at FROM admins ORDER BY created_at")
    listed = [{"email": e, "added_by": None, "created_at": None, "source": "config"} for e in sorted(settings.admin_emails)]
    config = {a["email"] for a in listed}
    listed += [{**r, "source": "dashboard"} for r in rows if r["email"] not in config]
    seen = await _all(db, """
        SELECT lower(email) AS email, name, last_seen_at FROM users
        WHERE deleted_at IS NULL AND lower(email) = ANY(:emails)
    """, emails=[a["email"] for a in listed])
    by_email = {s["email"]: s for s in seen}
    for a in listed:
        u = by_email.get(a["email"])
        a["name"] = u["name"] if u else None
        a["last_seen_at"] = u["last_seen_at"] if u else None
        a["has_account"] = u is not None
    return listed
