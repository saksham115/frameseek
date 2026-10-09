"""Which version of the Terms of Service and Privacy Policy is in force.

Keep TERMS_EFFECTIVE_AT in step with LEGAL_EFFECTIVE_DATE in web/src/lib/legal.ts.
Acceptances older than it no longer count, so everyone accepts the new version on their
next visit (the app treats them as not having accepted yet).
"""

from datetime import datetime, timezone

TERMS_EFFECTIVE_AT = datetime(2026, 10, 8, tzinfo=timezone.utc)

# Videos uploaded before retention was enforced get their full retention period counted
# from here, so nobody loses a video without having seen the updated terms first.
RETENTION_ENFORCED_FROM = TERMS_EFFECTIVE_AT

# Deleted accounts keep a minimal record this long (support, abuse, restoring by signing
# back in) before the name, email and sign-in identifiers are removed for good.
DELETED_ACCOUNT_GRACE_DAYS = 30


def accepted_current_terms(accepted_at: datetime | None) -> bool:
    if accepted_at is None:
        return False
    if accepted_at.tzinfo is None:
        accepted_at = accepted_at.replace(tzinfo=timezone.utc)
    return accepted_at >= TERMS_EFFECTIVE_AT
