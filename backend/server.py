from fastapi import FastAPI, APIRouter, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import uuid
import hmac
import hashlib
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
# Accept either MONGO_URL (legacy / platform default) or MONGODB_URI
# (common Atlas connection-string name) so user-provided .env files
# with either variable name work without editing.
mongo_url = os.environ.get('MONGO_URL') or os.environ.get('MONGODB_URI')
if not mongo_url:
    raise RuntimeError(
        "Missing Mongo connection string. Set MONGO_URL or MONGODB_URI in backend/.env."
    )
db_name = os.environ.get('DB_NAME') or 'raven_scout'
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=5000,  # 5 second timeout for Railway startup
    connectTimeoutMS=5000,
    socketTimeoutMS=5000
)
db = client[db_name]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================
# TIER DEFINITIONS (Single source of truth)
# ============================================================
TIERS = {
    "trial": {
        "name": "Trial",
        "analysis_limit": 3,  # Lifetime total
        "is_lifetime": True,
        "weather_api": False,
        "cloud_sync": False,
        "monthly_price": 0,
        "annual_price": 0,
    },
    "core": {
        "name": "Core",
        "analysis_limit": 10,  # Per month
        "is_lifetime": False,
        "weather_api": True,
        "cloud_sync": False,
        "monthly_price": 7.99,
        "annual_price": 79.99,
        # Rollover policy: how many billing cycles' worth of unused
        # analyses a user is allowed to accumulate.
        #   1  -> "carry over to next month only" (replace-mode)
        #   12 -> "carry over for up to a year" (accumulate-mode)
        "rollover_months": 1,
    },
    "pro": {
        "name": "Pro",
        "analysis_limit": 40,  # Per month
        "is_lifetime": False,
        "weather_api": True,
        "cloud_sync": True,
        "monthly_price": 14.99,
        "annual_price": 149.99,
        "rollover_months": 12,
    },
}

# RevenueCat product/entitlement mapping.
#
# `REVENUECAT_ENTITLEMENT_MAP` keys are matched against either:
#   - the active entitlement id (preferred — `core` / `pro` directly), or
#   - any substring of the productIdentifier on an active entitlement
#     (legacy fallback — handles `core_monthly_v2`,
#     `raven_scout_plans:pro-annual-base`, etc.).
# Order doesn't matter: the sync code always picks the highest tier
# (Pro > Core) when multiple entitlements are active.
REVENUECAT_ENTITLEMENT_MAP = {
    "core": "core",
    "pro": "pro",
    "core_monthly": "core",
    "core_annual": "core",
    "pro_monthly": "pro",
    "pro_annual": "pro",
}

# ============================================================
# EXTRA HUNT-ANALYTICS PACKS (one-time, non-expiring)
# ============================================================
# Mapping: canonical pack id -> # of extra analytics credits granted.
# These packs are a top-off / convenience purchase ONLY — they do
# not replace subscription limits. Monthly subscription credits are
# always consumed first; extra credits drain after the monthly
# allowance runs out. Once granted, extras NEVER expire.
#
# Canonical ids match the RevenueCat `credit_packs` offering package
# identifiers (which also happen to be the iOS App Store product ids).
# Legacy / Android-specific product ids are mapped onto these via
# `_PACK_ID_ALIASES` below so the grant endpoint can accept any of:
#   - credits_5 / credits_10 / credits_15            (canonical / iOS)
#   - analytics_pack_5 / analytics_pack_10 / analytics_pack_15  (Play)
#   - ravenscout_extra_analytics_5/10/15             (legacy v1.0 builds)
EXTRA_CREDIT_PACKS = {
    "credits_5":  {"credits": 5,  "price_usd": 5.99,  "label": "5 Hunt Analytics Credits"},
    "credits_10": {"credits": 10, "price_usd": 10.99, "label": "10 Hunt Analytics Credits"},
    "credits_15": {"credits": 15, "price_usd": 14.99, "label": "15 Hunt Analytics Credits"},
}

# Cross-platform product-id aliases. ANY id in this dict resolves to
# the canonical key in `EXTRA_CREDIT_PACKS`. Keep in sync with
# `/app/frontend/src/constants/revenuecat.ts -> CREDIT_PACK_ALIASES`.
_PACK_ID_ALIASES = {
    # Canonical (also iOS product ids).
    "credits_5":  "credits_5",
    "credits_10": "credits_10",
    "credits_15": "credits_15",
    # Google Play consumable product ids.
    "analytics_pack_5":  "credits_5",
    "analytics_pack_10": "credits_10",
    "analytics_pack_15": "credits_15",
    # Legacy v1.0 product ids — keep accepting them so any in-flight
    # restores from older builds still credit the user correctly.
    "ravenscout_extra_analytics_5":  "credits_5",
    "ravenscout_extra_analytics_10": "credits_10",
    "ravenscout_extra_analytics_15": "credits_15",
}


def resolve_pack_id(any_id: str) -> Optional[str]:
    """Resolve any platform pack id to its canonical key in
    EXTRA_CREDIT_PACKS, or None if it isn't a known pack.
    Trims whitespace and is case-sensitive — the store ids are not
    case-insensitive on either platform."""
    if not isinstance(any_id, str):
        return None
    return _PACK_ID_ALIASES.get(any_id.strip())


# ============================================================
# AUTH HELPERS
# ============================================================
async def get_current_user(request: Request) -> dict:
    """Extract and validate user from session token."""
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_optional_user(request: Request) -> Optional[dict]:
    """Try to get user, return None if not authenticated."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


# ============================================================
# USAGE ENFORCEMENT
# ============================================================
async def check_analysis_allowed(user: dict) -> dict:
    """Check if user can perform an analysis. Returns status dict."""
    tier_key = user.get("tier", "trial")
    tier = TIERS.get(tier_key, TIERS["trial"])

    analysis_count = user.get("analysis_count", 0)
    rollover_count = user.get("rollover_count", 0)

    if tier["is_lifetime"]:
        # Trial: lifetime limit. Extra (purchased, non-expiring)
        # credits also gate analysis here — a trial user who buys
        # a top-off pack must be able to spend it after their 3
        # free lifetime analyses are gone. `consume_one_analysis`
        # already handles the spend correctly; this gate just
        # mirrors that fall-through.
        remaining = max(0, tier["analysis_limit"] - analysis_count)
        extra_credits = max(0, int(user.get("extra_analytics_credits", 0)))
        combined_remaining = remaining + extra_credits
        if combined_remaining <= 0:
            return {
                "allowed": False,
                "remaining": 0,
                "limit": tier["analysis_limit"],
                "tier": tier_key,
                "extra_credits": 0,
                "message": "Trial limit reached. Upgrade or buy extra analytics to continue.",
            }
        return {
            "allowed": True,
            "remaining": remaining,
            "limit": tier["analysis_limit"],
            "tier": tier_key,
            "extra_credits": extra_credits,
        }
    else:
        # Paid tiers: monthly limit + rollover
        cycle_start = user.get("billing_cycle_start")
        if cycle_start:
            if isinstance(cycle_start, str):
                cycle_start = datetime.fromisoformat(cycle_start)
            if cycle_start.tzinfo is None:
                cycle_start = cycle_start.replace(tzinfo=timezone.utc)

            # Check if we need to reset the cycle
            now = datetime.now(timezone.utc)
            if now >= cycle_start + timedelta(days=30):
                # Rollover policy:
                #   rollover_months == 1  -> replace-mode: carry only
                #     this cycle's unused into the next cycle (Core)
                #   rollover_months > 1   -> accumulate-mode: add
                #     this cycle's unused on top of existing rollover,
                #     capped at N months' worth (Pro, N = 12)
                unused_this_cycle = max(0, tier["analysis_limit"] - analysis_count)
                rollover_months = tier.get("rollover_months", 1)
                if rollover_months <= 1:
                    new_rollover = min(unused_this_cycle, tier["analysis_limit"])
                else:
                    rollover_cap = tier["analysis_limit"] * rollover_months
                    new_rollover = min(rollover_count + unused_this_cycle, rollover_cap)

                new_cycle_start = cycle_start + timedelta(days=30)
                while new_cycle_start + timedelta(days=30) < now:
                    new_cycle_start += timedelta(days=30)

                await db.users.update_one(
                    {"user_id": user["user_id"]},
                    {"$set": {
                        "analysis_count": 0,
                        "rollover_count": new_rollover,
                        "billing_cycle_start": new_cycle_start.isoformat(),
                    }}
                )
                analysis_count = 0
                rollover_count = new_rollover

        total_available = tier["analysis_limit"] + rollover_count
        remaining = max(0, total_available - analysis_count)
        # Extra (non-expiring) credits stack ON TOP of the monthly
        # allowance. They are NOT counted into `remaining` (which is
        # specifically the monthly+rollover bucket) — callers can
        # surface both buckets independently. The combined allow
        # check, however, considers them.
        extra_credits = max(0, int(user.get("extra_analytics_credits", 0)))
        combined_remaining = remaining + extra_credits
        if combined_remaining <= 0:
            return {
                "allowed": False,
                "remaining": 0,
                "limit": tier["analysis_limit"],
                "tier": tier_key,
                "extra_credits": 0,
                "message": "Monthly limit reached. Upgrade or buy extra analytics to continue.",
            }
        return {
            "allowed": True,
            "remaining": remaining,
            "limit": tier["analysis_limit"],
            "rollover": rollover_count,
            "tier": tier_key,
            "extra_credits": extra_credits,
        }


async def consume_one_analysis(user: dict) -> dict:
    """
    Atomically consume one analysis credit using the canonical
    rule: monthly subscription credits FIRST, then extra non-expiring
    credits.

    Returns a dict describing what was charged so the caller (and
    the ledger) can record the source. Raises HTTPException(402)
    when the user is out of both buckets — surfaces the same shape
    the limit modal expects on the client.
    """
    uid = user["user_id"]
    tier_key = user.get("tier", "trial")
    tier = TIERS.get(tier_key, TIERS["trial"])
    analysis_count = int(user.get("analysis_count", 0))
    rollover_count = int(user.get("rollover_count", 0))
    extra_credits = max(0, int(user.get("extra_analytics_credits", 0)))

    # Trial users only have a lifetime bucket — extra credits stack
    # on top regardless of cycle.
    if tier["is_lifetime"]:
        monthly_remaining = max(0, tier["analysis_limit"] - analysis_count)
    else:
        monthly_remaining = max(0, (tier["analysis_limit"] + rollover_count) - analysis_count)

    if monthly_remaining > 0:
        # Drain monthly first.
        await db.users.update_one({"user_id": uid}, {"$inc": {"analysis_count": 1}})
        source = "monthly"
    elif extra_credits > 0:
        # Atomically decrement extra_analytics_credits, but ONLY if
        # > 0 — guards against the race where two concurrent analyses
        # try to spend the last credit.
        result = await db.users.update_one(
            {"user_id": uid, "extra_analytics_credits": {"$gt": 0}},
            {"$inc": {"extra_analytics_credits": -1}},
        )
        if result.modified_count == 0:
            # Lost the race. Re-check and 402.
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "out_of_credits",
                    "message": "Out of analytics. Upgrade or buy extra analytics.",
                },
            )
        source = "extra"
    else:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "out_of_credits",
                "message": "Out of analytics. Upgrade or buy extra analytics.",
            },
        )

    # Best-effort ledger entry — never block the analyze flow if the
    # ledger insert fails.
    try:
        await db.analytics_ledger.insert_one({
            "user_id": uid,
            "event": "analysis_used_monthly" if source == "monthly" else "analysis_used_extra_credit",
            "delta": -1,
            "source": source,
            "tier": tier_key,
            "ts": datetime.now(timezone.utc),
        })
    except Exception:  # noqa: BLE001
        logger.warning("analytics_ledger insert failed (non-fatal)", exc_info=True)

    return {"charged": source}


async def grant_extra_credits(
    user_id: str,
    pack_id: str,
    transaction_id: str,
    source: str = "manual",
) -> dict:
    """
    Idempotently credit a user's account from a one-time extra
    analytics-pack purchase.

    Idempotency key: (source, transaction_id) — backed by a unique
    index on `processed_purchases`. A second call with the same
    transaction_id is a no-op and returns the original grant.
    """
    pack = EXTRA_CREDIT_PACKS.get(pack_id)
    if not pack:
        # Try alias resolution before giving up — the client may have
        # passed a Google Play product id (`analytics_pack_5`) or a
        # legacy v1.0 id (`ravenscout_extra_analytics_5`) that maps
        # cleanly onto a canonical pack.
        canonical = resolve_pack_id(pack_id)
        if canonical and canonical in EXTRA_CREDIT_PACKS:
            pack_id = canonical
            pack = EXTRA_CREDIT_PACKS[canonical]
        else:
            raise HTTPException(status_code=400, detail=f"Unknown pack id: {pack_id}")

    credits = int(pack["credits"])
    now = datetime.now(timezone.utc)
    record = {
        "_id": f"{source}:{transaction_id}",  # unique key — collisions are no-ops
        "user_id": user_id,
        "pack_id": pack_id,
        "transaction_id": transaction_id,
        "source": source,
        "credits": credits,
        "price_usd": pack["price_usd"],
        "ts": now,
    }
    try:
        await db.processed_purchases.insert_one(record)
    except Exception as e:  # noqa: BLE001
        # Duplicate key → already processed. Return the existing row.
        existing = await db.processed_purchases.find_one({"_id": record["_id"]}, {"_id": 0})
        if existing:
            logger.info("grant_extra_credits: idempotent replay for %s", record["_id"])
            user_doc = await db.users.find_one({"user_id": user_id}, {"extra_analytics_credits": 1, "_id": 0})
            return {
                "ok": True,
                "duplicate": True,
                "credits_granted": 0,
                "extra_analytics_credits": int((user_doc or {}).get("extra_analytics_credits", 0)),
                "pack_id": pack_id,
            }
        # Some other DB error — surface it.
        raise HTTPException(status_code=500, detail=f"grant_extra_credits failed: {e}") from e

    update_result = await db.users.update_one(
        {"user_id": user_id},
        {"$inc": {"extra_analytics_credits": credits}, "$set": {"updated_at": now}},
    )
    if update_result.matched_count == 0:
        # Roll back the idempotency row so the user can retry under
        # the right account.
        await db.processed_purchases.delete_one({"_id": record["_id"]})
        raise HTTPException(status_code=404, detail="User not found")

    try:
        await db.analytics_ledger.insert_one({
            "user_id": user_id,
            "event": "extra_pack_purchase",
            "delta": credits,
            "pack_id": pack_id,
            "transaction_id": transaction_id,
            "source": source,
            "ts": now,
        })
    except Exception:  # noqa: BLE001
        logger.warning("analytics_ledger insert failed (non-fatal)", exc_info=True)

    user_doc = await db.users.find_one({"user_id": user_id}, {"extra_analytics_credits": 1, "_id": 0})
    return {
        "ok": True,
        "duplicate": False,
        "credits_granted": credits,
        "extra_analytics_credits": int((user_doc or {}).get("extra_analytics_credits", 0)),
        "pack_id": pack_id,
    }


async def increment_usage(user_id: str):
    """Legacy helper retained for backward compatibility — only
    increments the monthly counter. Prefer `consume_one_analysis`
    for new code paths so extra credits are honoured."""
    await db.users.update_one(
        {"user_id": user_id},
        {"$inc": {"analysis_count": 1}}
    )


# ============================================================
# AUTH ROUTES
# ============================================================
@api_router.post("/auth/session")
async def exchange_session(request: Request):
    """Exchange Emergent Auth session_id for app session."""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    # Call Emergent Auth to get user data
    async with httpx.AsyncClient(timeout=10) as hclient:
        resp = await hclient.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        auth_data = resp.json()

    email = auth_data.get("email")
    name = auth_data.get("name", "")
    picture = auth_data.get("picture", "")

    # Find or create user
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "last_login": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "tier": "trial",
            "analysis_count": 0,
            "billing_cycle_start": datetime.now(timezone.utc).isoformat(),
            "rollover_count": 0,
            "revenuecat_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_login": datetime.now(timezone.utc).isoformat(),
        })

    # Create session
    session_token = f"rs_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    response = JSONResponse({
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "session_token": session_token,
    })
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none",
        path="/", max_age=7 * 24 * 60 * 60,
    )
    return response


# ------------------------------------------------------------------
# /api/auth/google  — PORTABLE auth for Railway / non-Emergent hosts
# ------------------------------------------------------------------
# The client (Expo mobile app) obtains a Google ID token natively via
# @react-native-google-signin/google-signin or expo-auth-session.
# It POSTs the ID token here; we verify the signature against
# Google's JWKS, check the audience matches GOOGLE_CLIENT_ID, and
# mint our own session_token.
#
# REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT
# URLS, THIS BREAKS THE AUTH.
#
# Migration behavior: upsert users by email so existing accounts
# (those originally created via the Emergent Google Auth flow) keep
# their tier / analysis_count / revenuecat_id. Only net-new emails
# start fresh on the "trial" tier.

class GoogleAuthBody(BaseModel):
    id_token: str


@api_router.post("/auth/google")
async def auth_google(body: GoogleAuthBody):
    # Accept a comma-separated list of acceptable audiences so both
    # the Web and iOS OAuth client ids are valid. Google Sign-In on
    # iOS with a `webClientId` configured typically returns an ID
    # token with aud=<web client>, but certain SDK versions / cached
    # sessions can emit aud=<iOS client> instead — accepting both
    # avoids a class of "Invalid Google credential" false negatives.
    raw = (os.environ.get("GOOGLE_CLIENT_ID") or "").strip()
    also = (os.environ.get("GOOGLE_CLIENT_ID_IOS") or "").strip()
    ids = [i.strip() for i in (raw + "," + also).split(",") if i.strip()]
    if not ids:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_CLIENT_ID not configured on server",
        )

    # Verify the ID token against Google's JWKS. This checks
    # signature, issuer (accounts.google.com), expiry, and — when
    # passed — the audience. We verify signature once (audience=None)
    # and then enforce aud membership manually so we can accept a
    # list. Raises ValueError on ANY tampering / signature mismatch.
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        claims = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            audience=None,           # audience checked below
            clock_skew_in_seconds=10,
        )
        aud = claims.get("aud")
        if aud not in ids:
            raise ValueError(f"audience {aud!r} not in accepted list")
    except ValueError as e:
        logger.warning(f"Google ID token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    except Exception as e:
        logger.error(f"Google ID token verification crashed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="No email in Google credential")
    if not claims.get("email_verified", True):
        # Some accounts return false. Don't hard-fail but log.
        logger.warning(f"Google email not verified: {email}")

    name = claims.get("name", "")
    picture = claims.get("picture", "")
    google_sub = claims.get("sub")  # stable Google user id

    # Upsert the user by email. Existing users keep tier / usage.
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    now_iso = datetime.now(timezone.utc).isoformat()

    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": name,
                "picture": picture,
                "google_sub": google_sub,
                "last_login": now_iso,
            }},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "google_sub": google_sub,
            "tier": "trial",
            "analysis_count": 0,
            "billing_cycle_start": now_iso,
            "rollover_count": 0,
            "revenuecat_id": None,
            "created_at": now_iso,
            "last_login": now_iso,
        })

    # Mint our session token (same format as /auth/session so the
    # rest of the stack works unchanged).
    session_token = f"rs_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": now_iso,
        "provider": "google_oauth",
    })

    return JSONResponse({
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "session_token": session_token,
    })




@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    usage = await check_analysis_allowed(user)
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture", ""),
        "tier": user.get("tier", "trial"),
        "usage": usage,
        # True if the account has an email/password credential attached.
        # False for Google-only users — the Profile UI uses this to show
        # "Set Password" instead of "Change Password".
        "has_password": bool(user.get("password_hash")),
    }


@api_router.post("/auth/logout")
async def logout(request: Request):
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})

    response = JSONResponse({"success": True})
    response.delete_cookie(key="session_token", path="/")
    return response



# ============================================================
# ANALYTICS USAGE & EXTRA-CREDIT PACKS
# ============================================================
class ExtraCreditsGrantPayload(BaseModel):
    """Payload for the in-app (mock) purchase grant endpoint.

    The "real" RevenueCat pipeline POSTs to /purchases/revenuecat-webhook
    instead — see that handler for HMAC verification details.
    """
    pack_id: str = Field(..., description="One of EXTRA_CREDIT_PACKS keys")
    transaction_id: str = Field(..., min_length=4, max_length=200,
                                description="Idempotency key — store-side txn id, RC purchase token, etc.")


def _build_analytics_usage_payload(user: dict) -> dict:
    """Shared shape used by GET /user/analytics-usage and the limit modal."""
    tier_key = user.get("tier", "trial")
    tier = TIERS.get(tier_key, TIERS["trial"])
    analysis_count = int(user.get("analysis_count", 0))
    rollover_count = int(user.get("rollover_count", 0))
    extra_credits = max(0, int(user.get("extra_analytics_credits", 0)))

    if tier["is_lifetime"]:
        monthly_limit = tier["analysis_limit"]
        monthly_used = analysis_count
        monthly_remaining = max(0, monthly_limit - analysis_count)
        reset_date = None  # lifetime — never resets
    else:
        monthly_limit = tier["analysis_limit"] + rollover_count
        monthly_used = min(analysis_count, monthly_limit)
        monthly_remaining = max(0, monthly_limit - analysis_count)
        cycle_start = user.get("billing_cycle_start")
        if isinstance(cycle_start, str):
            try:
                cycle_start = datetime.fromisoformat(cycle_start)
            except ValueError:
                cycle_start = None
        reset_date = (cycle_start + timedelta(days=30)).isoformat() if cycle_start else None

    return {
        "plan": tier_key,
        "monthlyAnalyticsLimit": monthly_limit,
        "monthlyAnalyticsUsed": monthly_used,
        "monthlyAnalyticsRemaining": monthly_remaining,
        "extraAnalyticsCredits": extra_credits,
        "totalRemaining": monthly_remaining + extra_credits,
        "resetDate": reset_date,
        "packs": [
            {"id": pid, "credits": p["credits"], "price_usd": p["price_usd"], "label": p["label"]}
            for pid, p in EXTRA_CREDIT_PACKS.items()
        ],
    }


@api_router.get("/user/analytics-usage")
async def get_analytics_usage(request: Request):
    """Return the user's monthly analytics usage AND extra-credit balance.

    Source of truth for the in-app usage display and the out-of-credits
    modal. Triggers a passive cycle reset if the user has crossed a
    billing-cycle boundary (re-uses the same logic as `check_analysis_allowed`).
    """
    user = await get_current_user(request)
    # Run the cycle-reset side effect in `check_analysis_allowed` so
    # the usage payload reflects any reset that just happened.
    await check_analysis_allowed(user)
    user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _build_analytics_usage_payload(user or {})


@api_router.post("/analytics/consume")
async def consume_analytics(request: Request):
    """Server-authoritative single-credit consume.

    Use this when the analyze flow is split across services (e.g. a
    background worker that wants to reserve a credit before running
    a long job) and direct `consume_one_analysis` isn't accessible.
    Returns 402 with `{code: "out_of_credits"}` when both buckets are
    empty so the client can show the limit modal.
    """
    user = await get_current_user(request)
    allowed = await check_analysis_allowed(user)
    if not allowed.get("allowed"):
        raise HTTPException(
            status_code=402,
            detail={"code": "out_of_credits", "message": allowed.get("message", "Out of analytics.")},
        )
    charge = await consume_one_analysis(user)
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {
        "ok": True,
        "charged": charge["charged"],
        "usage": _build_analytics_usage_payload(fresh or {}),
    }


@api_router.post("/purchases/extra-credits")
async def purchase_extra_credits(payload: ExtraCreditsGrantPayload, request: Request):
    """Grant extra analytics credits from a one-time pack purchase.

    Idempotent on (source='in_app', transaction_id). The mobile app
    calls this AFTER RevenueCat / StoreKit reports a successful
    purchase — the `transaction_id` MUST be the platform-issued
    transaction id so that retries during e.g. network flakiness
    don't double-credit.

    NOTE: in production the canonical credit grant should come from
    `/purchases/revenuecat-webhook` (server-to-server, signed). This
    endpoint exists as a belt-and-suspenders client confirmation —
    the unique-key idempotency means the second grant from the
    webhook is a no-op.
    """
    user = await get_current_user(request)
    return await grant_extra_credits(
        user_id=user["user_id"],
        pack_id=payload.pack_id,
        transaction_id=payload.transaction_id,
        source="in_app",
    )


def _verify_revenuecat_signature(raw_body: bytes, headers) -> bool:
    """Validate RevenueCat's HMAC-SHA256 webhook signature.

    Returns True if the header is missing AND no shared secret is
    configured (so dev environments don't have to set one up). When
    a secret IS configured, the header MUST be present and match.
    """
    secret = os.environ.get("REVENUECAT_WEBHOOK_SECRET", "").strip()
    sig_header = headers.get("X-RevenueCat-Signature") or headers.get("x-revenuecat-signature")
    if not secret:
        # Dev-mode short-circuit. PRODUCTION MUST SET THIS.
        if not sig_header:
            return True
        # If the header is present AND we have no secret, fail closed.
        return False
    if not sig_header:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig_header.strip())


@api_router.post("/purchases/revenuecat-webhook")
async def revenuecat_webhook(request: Request):
    """Receive RevenueCat NON-RENEWING-PURCHASE events for extra-credit packs.

    Security:
      - HMAC-SHA256 signature in `X-RevenueCat-Signature` header
        (configure REVENUECAT_WEBHOOK_SECRET in the backend env).
      - User identified via `app_user_id` (we mirror this onto our
        `user_id`).
      - Idempotency via the (source='revenuecat', transaction_id)
        composite unique key on `processed_purchases`.

    We only act on `NON_RENEWING_PURCHASE` events whose product_id
    is a known pack. Renewals/transfers/cancellations of subscription
    products are handled elsewhere.
    """
    raw = await request.body()
    if not _verify_revenuecat_signature(raw, request.headers):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = (body.get("event") or {}) if isinstance(body, dict) else {}
    event_type = event.get("type")
    if event_type != "NON_RENEWING_PURCHASE":
        # Subscription events are handled by the existing subscription
        # webhook plumbing. Acknowledge and ignore.
        return {"ok": True, "ignored": event_type}

    user_id = event.get("app_user_id") or event.get("original_app_user_id")
    product_id = event.get("product_id")
    transaction_id = event.get("transaction_id") or event.get("id")
    if not (user_id and product_id and transaction_id):
        raise HTTPException(status_code=400, detail="Missing required event fields")

    if product_id not in EXTRA_CREDIT_PACKS:
        # Allow Google Play / legacy product ids via the alias resolver
        # before giving up.
        canonical = resolve_pack_id(product_id)
        if canonical and canonical in EXTRA_CREDIT_PACKS:
            product_id = canonical
        else:
            # Unknown pack — log and 200 so RC doesn't keep retrying.
            logger.info("revenuecat_webhook: ignoring unknown product_id=%s", product_id)
            return {"ok": True, "ignored": "unknown_product"}

    return await grant_extra_credits(
        user_id=user_id,
        pack_id=product_id,
        transaction_id=str(transaction_id),
        source="revenuecat",
    )



# ============================================================
# SUBSCRIPTION ROUTES
# ============================================================
@api_router.get("/subscription/status")
async def get_subscription_status(request: Request):
    user = await get_current_user(request)
    tier_key = user.get("tier", "trial")
    tier_info = TIERS.get(tier_key, TIERS["trial"])
    usage = await check_analysis_allowed(user)
    return {
        "tier": tier_key,
        "tier_info": tier_info,
        "usage": usage,
        "all_tiers": TIERS,
    }


@api_router.post("/subscription/sync-revenuecat")
async def sync_revenuecat(request: Request):
    """Sync subscription status from RevenueCat (called from mobile after purchase).

    Reads `customerInfo.entitlements.active` and resolves the highest
    active tier. Recognises:
      1. Canonical entitlement keys (`pro` / `core`) — preferred.
      2. Legacy `*_entitlement` keys — kept for older builds.
      3. productIdentifier substrings via REVENUECAT_ENTITLEMENT_MAP —
         ultimate fallback for non-standard configs.
    Pro always outranks Core.
    """
    user = await get_current_user(request)
    body = await request.json()
    rc_user_id = body.get("revenuecat_user_id")
    entitlements = body.get("entitlements", {}) or {}

    found_pro = False
    found_core = False
    for ent_key, ent_data in entitlements.items():
        if not isinstance(ent_data, dict):
            continue
        if ent_data.get("isActive") is False:
            continue
        # Active by default if isActive is omitted (legacy clients).
        is_active = ent_data.get("isActive", True)
        if not is_active:
            continue

        key_lower = (ent_key or "").lower()
        product = (ent_data.get("productIdentifier") or "").lower()

        # 1. Direct canonical entitlement keys.
        if key_lower == "pro":
            found_pro = True
            continue
        if key_lower == "core":
            found_core = True
            continue
        # 2. Legacy `*_entitlement` keys.
        if key_lower == "pro_entitlement":
            found_pro = True
            continue
        if key_lower == "core_entitlement":
            found_core = True
            continue
        # 3. productIdentifier prefix lookup.
        for product_prefix, tier in REVENUECAT_ENTITLEMENT_MAP.items():
            if product_prefix in product:
                if tier == "pro":
                    found_pro = True
                elif tier == "core":
                    found_core = True
                break

    new_tier = "pro" if found_pro else ("core" if found_core else "trial")

    old_tier = user.get("tier", "trial")
    update_data = {"revenuecat_id": rc_user_id, "tier": new_tier}

    # If upgrading, reset cycle
    if new_tier != old_tier and new_tier != "trial":
        update_data["billing_cycle_start"] = datetime.now(timezone.utc).isoformat()
        if old_tier == "trial":
            update_data["analysis_count"] = 0
            update_data["rollover_count"] = 0

    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update_data})
    logger.info(f"User {user['user_id']} tier synced: {old_tier} -> {new_tier}")

    return {"success": True, "tier": new_tier}


@api_router.post("/subscription/webhook")
async def revenuecat_subscription_webhook(request: Request):
    """RevenueCat server-to-server webhook for subscription events.

    Recognises Apple v2 (`core_monthly_v2`/`core_annual_v2`/
    `pro_monthly_v2`/`pro_annual_v2`) and Google Play
    (`raven_scout_plans:core/pro-monthly/annual-base`) subscription
    products. Maps them to the canonical `core` / `pro` tiers via
    `REVENUECAT_ENTITLEMENT_MAP`. Pro outranks Core if both are
    somehow active simultaneously.
    """
    body = await request.json()
    event = body.get("event", {})
    event_type = event.get("type", "")
    app_user_id = event.get("app_user_id", "")

    logger.info(f"RevenueCat webhook: {event_type} for {app_user_id}")

    if not app_user_id:
        return {"success": True}

    user = await db.users.find_one({"revenuecat_id": app_user_id}, {"_id": 0})
    if not user:
        user = await db.users.find_one({"user_id": app_user_id}, {"_id": 0})
    if not user:
        logger.warning(f"Webhook: User not found for {app_user_id}")
        return {"success": True}

    # Handle subscription events
    if event_type in ["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE"]:
        product_id = (event.get("product_id") or "").lower()
        # Pro takes precedence so users on a mid-upgrade grace period
        # don't get demoted by an out-of-order Core renewal event.
        new_tier = "trial"
        for prefix, tier in REVENUECAT_ENTITLEMENT_MAP.items():
            if prefix in product_id:
                if tier == "pro":
                    new_tier = "pro"
                    break
                if tier == "core" and new_tier != "pro":
                    new_tier = "core"

        update = {"tier": new_tier}
        if event_type == "INITIAL_PURCHASE":
            update["billing_cycle_start"] = datetime.now(timezone.utc).isoformat()
            update["analysis_count"] = 0
            update["rollover_count"] = 0

        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})

    elif event_type in ["CANCELLATION", "EXPIRATION"]:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"tier": "trial"}}
        )

    return {"success": True}


@api_router.get("/subscription/tiers")
async def get_tiers():
    """Public endpoint: return all available tiers."""
    return {"tiers": TIERS}


# ============================================================
# CLOUD MEDIA (Pro tier — AWS S3 pre-signed upload flow)
# ============================================================
# Storage key format: hunts/{userId}/{huntId}/{role}/{imageId}.{ext}
# The mobile client never sees AWS credentials — it asks us to mint a
# short-lived signed URL and uploads the bytes directly to S3.
import s3_service  # noqa: E402


_ALLOWED_MEDIA_EXT = {"jpg", "jpeg", "png", "webp", "heic", "heif"}
# Allowed image MIME types for cloud upload. Anything else is rejected
# at the presign endpoint so the caller never wastes a round-trip
# trying to PUT a non-image to S3.
_ALLOWED_MEDIA_MIMES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}
_ALLOWED_MEDIA_ROLES = {"primary", "context", "thumbnail"}


class PresignUploadBody(BaseModel):
    imageId: str = Field(..., min_length=1, max_length=128)
    huntId: Optional[str] = Field(None, max_length=128)
    role: str = Field("primary")
    mime: str = Field("image/jpeg")
    extension: str = Field("jpg")


class PresignDownloadBody(BaseModel):
    storageKey: str = Field(..., min_length=1)


class MediaDeleteBody(BaseModel):
    storageKey: str = Field(..., min_length=1)


def _require_cloud_media_user(user: dict) -> None:
    """Only Pro users may use cloud media storage."""
    tier_key = user.get("tier", "trial")
    if tier_key != "pro":
        raise HTTPException(
            status_code=403,
            detail="Cloud media storage is a Pro tier feature.",
        )


def _guard_storage_key_owner(user: dict, key: str) -> None:
    """Ensure the storage key belongs to this user.

    Key format: hunts/{userId}/{huntId}/{role}/{imageId}.{ext}
    Rejects path traversal and cross-user access.
    """
    if ".." in key or key.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid storage key")
    parts = key.split("/")
    if len(parts) < 2 or parts[0] != "hunts":
        raise HTTPException(status_code=400, detail="Invalid storage key")
    owner = parts[1]
    if owner != user["user_id"]:
        raise HTTPException(status_code=403, detail="Storage key does not belong to caller")


@api_router.post("/media/presign-upload")
async def presign_media_upload(body: PresignUploadBody, request: Request):
    """Mint a short-lived pre-signed PUT URL for a Pro user to upload
    a single compressed image directly to S3.

    Request is authenticated — key is scoped to the caller's user_id.
    """
    user = await get_current_user(request)
    _require_cloud_media_user(user)

    role = (body.role or "primary").lower()
    if role not in _ALLOWED_MEDIA_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {sorted(_ALLOWED_MEDIA_ROLES)}")
    ext = (body.extension or "jpg").lstrip(".").lower()
    if ext == "jpeg":
        ext = "jpg"
    if ext not in _ALLOWED_MEDIA_EXT:
        raise HTTPException(status_code=400, detail=f"extension must be one of {sorted(_ALLOWED_MEDIA_EXT)}")

    mime = (body.mime or "image/jpeg").lower()
    if mime not in _ALLOWED_MEDIA_MIMES:
        # Strict allowlist — reject any non-image MIME, plus image
        # types we do not support (e.g. tiff/gif/svg). This protects
        # the bucket from being used as generic file storage and makes
        # downstream image processing safe to assume one of these
        # known formats.
        raise HTTPException(
            status_code=400,
            detail=f"mime must be one of {sorted(_ALLOWED_MEDIA_MIMES)}",
        )

    if not s3_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Cloud media storage is not configured on this server.",
        )

    key = s3_service.build_storage_key(
        user_id=user["user_id"],
        hunt_id=body.huntId,
        role=role,
        image_id=body.imageId,
        extension=ext,
    )

    try:
        upload_url, asset_url, expires_in = s3_service.presign_upload(key, mime)
        # Track this presign as a pending upload. If the user
        # eventually saves a hunt that references this key, the row
        # is removed (committed). If not, the orphan-cleanup sweep
        # will delete the S3 object after `older_than_seconds` has
        # elapsed — preventing forever-orphaned objects from
        # abandoned/crashed hunt-creation flows.
        try:
            await db.pending_uploads.update_one(
                {"user_id": user["user_id"], "s3_key": key},
                {
                    "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
                    "$set": {
                        "user_id": user["user_id"],
                        "s3_key": key,
                        "image_id": body.imageId,
                        "hunt_id": body.huntId,
                        "role": role,
                        "mime": mime,
                    },
                },
                upsert=True,
            )
        except Exception:  # noqa: BLE001
            # Tracking is best-effort — failing here must NOT block
            # the actual presign response.
            logger.warning(
                "pending_uploads tracking failed for key=%s (non-fatal)", key,
            )
        logger.info(
            f"presign_upload OK user={user['user_id']} hunt={body.huntId} "
            f"role={role} key={key} ttl={expires_in}"
        )
    except Exception as e:
        logger.exception(f"presign_upload failed user={user.get('user_id')} key={key} mime={mime}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate upload URL")

    return {
        "uploadUrl": upload_url,
        "assetUrl": asset_url,
        "storageKey": key,
        "expiresIn": expires_in,
        "privateDelivery": s3_service.is_private_delivery(),
        "mime": mime,
    }


@api_router.get("/media/health")
async def media_health(request: Request):
    """Quick S3 health check — runs a HeadBucket round-trip with the
    server's currently-loaded credentials. Useful to immediately
    diagnose whether Pro uploads will work without doing a full upload
    flow on a real device.

    Returns 200 with `{ ok: true, bucket, region }` when the bucket is
    reachable. Returns 200 with `{ ok: false, error }` when the bucket
    is misconfigured / unreachable so the caller can render the error
    instead of having to parse a 500.
    """
    # Authenticated to avoid leaking bucket existence to unauthenticated
    # callers, but we DO NOT gate on Pro tier — admins / Trial / Core
    # users with valid sessions can also probe the integration.
    await get_current_user(request)
    cfg = {
        "configured": s3_service.is_configured(),
        "bucket": s3_service.get_bucket(),
        "region": s3_service.get_region(),
        "private_delivery": s3_service.is_private_delivery(),
    }
    if not cfg["configured"]:
        return {"ok": False, "error": "S3 not configured", **cfg}
    ok, err = s3_service.head_bucket()
    return {"ok": ok, "error": err, **cfg}


# Default age threshold for orphan cleanup. A presigned upload URL
# is good for 15 minutes; we give the client a generous 24-hour
# completion window before considering an object abandoned. Anything
# fresher than this stays for the next sweep.
ORPHAN_DEFAULT_AGE_SECONDS = 24 * 60 * 60  # 24h
ORPHAN_MIN_AGE_SECONDS = 15 * 60           # 15m floor (presign TTL)
ORPHAN_MAX_BATCH = 500                     # cap per call


@api_router.post("/media/cleanup-orphans")
async def cleanup_orphan_media(request: Request):
    """Delete S3 objects that were presigned but never committed to a
    saved hunt. Scoped to the calling user — never touches another
    account's keys.

    The sweep walks `pending_uploads` for the caller, filters to rows
    older than `older_than_seconds` (default 24h, min 15m to respect
    the presign TTL), confirms each key is NOT referenced in any of
    the user's saved hunts (defense-in-depth join), then deletes the
    S3 object and the pending row.

    Safe to call repeatedly. Returns counts and any failed keys so
    the caller can render a status banner.
    """
    user = await get_current_user(request)
    _require_cloud_media_user(user)
    uid = user["user_id"]

    # Optional override via query string. Floors at 15 minutes so we
    # never race with a still-active presign URL.
    older_than = ORPHAN_DEFAULT_AGE_SECONDS
    raw = request.query_params.get("older_than_seconds")
    if raw:
        try:
            older_than = max(ORPHAN_MIN_AGE_SECONDS, int(raw))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid older_than_seconds")

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=older_than)
    pending_cursor = db.pending_uploads.find(
        {"user_id": uid, "created_at": {"$lt": cutoff}},
    ).limit(ORPHAN_MAX_BATCH)
    pending = await pending_cursor.to_list(length=ORPHAN_MAX_BATCH)

    if not pending:
        return {
            "ok": True,
            "scanned": 0,
            "deleted": 0,
            "kept_committed": 0,
            "failed": [],
            "older_than_seconds": older_than,
        }

    # Defense in depth: never delete a key that is referenced by any
    # of the user's saved hunts, even if its pending row somehow
    # survived the commit cleanup. A single $in lookup is cheap.
    candidate_keys = [p["s3_key"] for p in pending]
    committed_cursor = db.hunts.find(
        {"user_id": uid, "image_s3_keys": {"$in": candidate_keys}},
        {"image_s3_keys": 1, "_id": 0},
    )
    committed_set: set[str] = set()
    async for h in committed_cursor:
        for k in (h.get("image_s3_keys") or []):
            committed_set.add(k)

    deleted = 0
    failed: list[dict] = []
    kept_committed = 0
    s3_ready = s3_service.is_configured()

    for row in pending:
        key = row["s3_key"]
        if key in committed_set:
            # Object is now actually used — drop the stale pending row
            # and keep the S3 object. Self-healing path.
            try:
                await db.pending_uploads.delete_one({"_id": row["_id"]})
            except Exception:  # noqa: BLE001
                pass
            kept_committed += 1
            continue

        # Ownership guard — paranoia, since user_id is in the query
        # already, but proves to ourselves we never delete cross-user.
        try:
            _guard_storage_key_owner(user, key)
        except HTTPException:
            failed.append({"key": key, "reason": "ownership_mismatch"})
            continue

        if not s3_ready:
            failed.append({"key": key, "reason": "s3_not_configured"})
            continue

        try:
            ok = s3_service.delete_object(key)
        except Exception as exc:  # noqa: BLE001
            ok = False
            logger.warning("orphan_cleanup: s3 delete failed for %s: %s", key, exc)
        if not ok:
            failed.append({"key": key, "reason": "s3_delete_failed"})
            continue

        try:
            await db.pending_uploads.delete_one({"_id": row["_id"]})
        except Exception:  # noqa: BLE001
            # The S3 object is already gone — leaving the pending row
            # behind is harmless (next sweep will retry the delete and
            # find a 404, which we treat as success).
            pass
        deleted += 1

    logger.info(
        "orphan_cleanup user=%s scanned=%d deleted=%d kept_committed=%d failed=%d older_than=%ds",
        uid, len(pending), deleted, kept_committed, len(failed), older_than,
    )
    return {
        "ok": True,
        "scanned": len(pending),
        "deleted": deleted,
        "kept_committed": kept_committed,
        "failed": failed,
        "older_than_seconds": older_than,
    }


@api_router.post("/media/presign-download")
async def presign_media_download(body: PresignDownloadBody, request: Request):
    """Mint a short-lived pre-signed GET URL for a Pro user's asset.

    Only needed when the bucket is private (no CloudFront/public base
    configured). Keys are checked to ensure they belong to the caller.
    """
    user = await get_current_user(request)
    _require_cloud_media_user(user)
    _guard_storage_key_owner(user, body.storageKey)
    if not s3_service.is_configured():
        raise HTTPException(status_code=503, detail="Cloud media storage is not configured")

    try:
        download_url, expires_in = s3_service.presign_download(body.storageKey)
    except Exception as e:
        logger.error(f"presign_download failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate download URL")

    return {
        "downloadUrl": download_url,
        "expiresIn": expires_in,
    }


@api_router.post("/media/delete")
async def delete_media_object(body: MediaDeleteBody, request: Request):
    """Best-effort cloud delete for a single object.

    Key ownership is enforced; the endpoint is idempotent and returns
    `success=True` even when the object is already absent.
    """
    user = await get_current_user(request)
    _require_cloud_media_user(user)
    _guard_storage_key_owner(user, body.storageKey)

    if not s3_service.is_configured():
        # Pretend success so client can clean up local state; log it.
        logger.warning("media/delete called but S3 not configured; skipping remote delete")
        return {"success": False, "reason": "S3 not configured"}

    ok = s3_service.delete_object(body.storageKey)
    return {"success": ok}


# ============================================================
# MODELS (unchanged)
# ============================================================
class HuntConditions(BaseModel):
    animal: str
    hunt_date: str
    time_window: str
    wind_direction: str
    temperature: Optional[str] = None
    precipitation: Optional[str] = None
    property_type: Optional[str] = "public"

    # Freeform region NOTE displayed back in analysis output — NEVER
    # drives region resolution. Think of this as a text annotation
    # (e.g. the user jotting "private lease in Leon County") rather
    # than an authoritative override. Automatic region inference is
    # strictly GPS-driven for safety; to override, use the dedicated
    # `manual_region_override` field below.
    region: Optional[str] = None

    # Optional GPS context — PRIMARY driver of automatic region
    # resolution. Coordinates win over `map_centroid_*`; both feed
    # into `resolve_effective_region`.
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    map_centroid_lat: Optional[float] = None
    map_centroid_lon: Optional[float] = None

    # EXPLICIT override for the region classifier. Only set from an
    # intentional admin / debug / boundary-case flow — e.g. an admin
    # UI, a "my region is actually X" correction button, or a test
    # fixture. The presence of a non-null, normalizable value here is
    # what flips `regionResolutionSource` to "manual_override".
    # Normal hunts should leave this null.
    manual_region_override: Optional[str] = None

    # Legacy optional hunt style — older clients send one canonical id
    # here. Newer clients send structured hunt_weapon + hunt_method
    # below, while this field remains populated for back-compat.
    hunt_style: Optional[str] = None
    # Structured weapon/method context. These let the prompt pipeline
    # layer weapon range separately from method/setup geometry.
    hunt_weapon: Optional[str] = None
    hunt_method: Optional[str] = None

class AnalyzeRequestLocationAsset(BaseModel):
    """Inline payload shape for a Hunt GPS Asset attached to an
    /analyze-hunt request (Task 7).

    Matches the canonical HuntLocationAsset wire shape from the model
    in /app/backend/models/hunt_location_asset.py, but kept loose
    here (no enum / range checks) because:
      * The validators on HuntLocationAssetCreate already gate the
        write path (POST /api/hunts/{id}/assets).
      * Bad analyze inputs should NOT 422 the analysis itself —
        we just skip a malformed entry inside the prompt builder.
    """
    asset_id: Optional[str] = None
    type: Optional[str] = None
    name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = None


class AnalyzeRequest(BaseModel):
    conditions: HuntConditions
    map_image_base64: str
    additional_images: Optional[List[str]] = None
    # Task 7: when supplied, the analyze endpoint loads the hunt's
    # user-provided GPS assets from Mongo and threads them into the
    # prompt context. Optional + additive — legacy clients (no
    # hunt_id) behave exactly as before.
    hunt_id: Optional[str] = None
    # Task 7: inline assets supplied directly by the New Hunt flow
    # before the hunt has a server-side row. Takes precedence over
    # the Mongo lookup when both are present.
    location_assets: Optional[List[AnalyzeRequestLocationAsset]] = None
    # Task 11 follow-up: when supplied, AI-returned overlays are
    # normalized via overlay_normalizer and persisted into
    # analysis_overlay_items, attached to this saved_map_image_id.
    # Optional + best-effort — analyze never blocks on persistence.
    saved_map_image_id: Optional[str] = None

class OverlayMarker(BaseModel):
    type: str
    label: str
    x_percent: float
    y_percent: float
    width_percent: Optional[float] = None
    height_percent: Optional[float] = None
    reasoning: str
    confidence: str

class AnalysisResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    overlays: List[OverlayMarker]
    summary: str
    top_setups: List[str]
    wind_notes: str
    best_time: str
    key_assumptions: List[str]
    species_tips: List[str]

class AnalyzeResponse(BaseModel):
    success: bool
    result: Optional[AnalysisResult] = None
    error: Optional[str] = None
    usage: Optional[dict] = None
    # Canonical hunting region resolved server-side for this analysis.
    # Persisted by the client alongside the hunt so overlays/reloads
    # carry the same regional lock as the LLM reasoning.
    region_resolution: Optional[dict] = None
    # Canonical hunt-style resolved server-side from the user's
    # explicit selection. Persisted by the client alongside the hunt.
    hunt_style_resolution: Optional[dict] = None


# ============================================================
# SPECIES DATA (unchanged)
# ============================================================
# Legacy SPECIES_DATA dict — now sourced from `species_registry` so
# adding a new species only requires a registry entry + prompt pack.
# The shape (`{id: {name, icon, description, behavior_rules}}`) is
# preserved for the analysis pipeline callers.
from species_registry import legacy_species_data

SPECIES_DATA = legacy_species_data()


# ============================================================
# AI ANALYSIS (unchanged)
# ============================================================
async def analyze_map_with_ai(conditions: HuntConditions, map_image_base64: str, additional_images: Optional[List[str]] = None, tier: str = "trial", hunt_location_assets: Optional[List[dict]] = None) -> dict:
    """Run GPT-5.2 Vision analysis on the hunt map.

    LLM selection:
      - If OPENAI_API_KEY is set, talk to OpenAI directly via the
        official `openai` SDK. This is the PORTABLE path — works on
        Railway, Fly.io, Docker, or any non-Emergent host.
      - Else fall back to EMERGENT_LLM_KEY + emergentintegrations
        (legacy in-Emergent dev only).
    Either way the downstream parse/validate pipeline is identical.
    """
    from prompt_builder import assemble_system_prompt, assemble_user_prompt, get_repair_prompt, get_evidence_level
    from schema_validator import parse_llm_response, validate_and_normalize, convert_v2_to_v1

    openai_key = os.environ.get("OPENAI_API_KEY")
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not openai_key and not emergent_key:
        raise ValueError(
            "Missing LLM credentials. Set OPENAI_API_KEY (preferred, works "
            "anywhere) or EMERGENT_LLM_KEY (Emergent-hosted only)."
        )
    use_openai_direct = bool(openai_key)

    species = SPECIES_DATA.get(conditions.animal)
    if not species:
        raise ValueError(f"Unknown species: {conditions.animal}")

    # Determine actual images to send (tier-gated)
    images_to_send = [map_image_base64]
    if tier == "pro" and additional_images:
        images_to_send.extend(additional_images)

    actual_image_count = len(images_to_send)
    conditions_dict = conditions.model_dump()

    # Resolve the effective hunting region once, then reuse the
    # resolution for BOTH the prompt builder and the response payload.
    #
    # Precedence (SAFETY-CRITICAL — see species_prompts.regions):
    #   1. explicit `manual_region_override` — intentional override flow
    #   2. GPS latitude/longitude — PRIMARY auto-resolution path
    #   3. map centroid — fallback when no GPS
    #   4. generic_default
    #
    # The freeform `region` field on HuntConditions is a user-facing
    # note ONLY and deliberately does NOT participate in resolution.
    # That prevents a casual "Midwest" annotation from silently
    # overriding the user's actual East Texas GPS fix.
    from species_prompts import (
        get_hunt_style_label,
        is_method_style,
        is_weapon_style,
        normalize_hunt_method,
        normalize_hunt_style,
        normalize_hunt_weapon,
        resolve_effective_region,
    )
    map_centroid = None
    if conditions.map_centroid_lat is not None and conditions.map_centroid_lon is not None:
        map_centroid = (conditions.map_centroid_lat, conditions.map_centroid_lon)
    region_resolution = resolve_effective_region(
        gps_lat=conditions.latitude,
        gps_lon=conditions.longitude,
        map_centroid=map_centroid,
        manual_override=conditions.manual_region_override,
    )
    logger.info(
        f"Region resolved: id={region_resolution.region_id} "
        f"source={region_resolution.source} label='{region_resolution.region_label}'"
    )

    # Hunt-context resolution — canonical ids only. New clients send
    # weapon and method separately; older clients send a single
    # hunt_style, which we classify into the appropriate slot.
    legacy_hunt_style = normalize_hunt_style(conditions.hunt_style)
    canonical_hunt_weapon = normalize_hunt_weapon(conditions.hunt_weapon)
    canonical_hunt_method = normalize_hunt_method(conditions.hunt_method)
    if not canonical_hunt_weapon and is_weapon_style(legacy_hunt_style):
        canonical_hunt_weapon = legacy_hunt_style
    if not canonical_hunt_method and is_method_style(legacy_hunt_style):
        canonical_hunt_method = legacy_hunt_style
    canonical_hunt_style = canonical_hunt_method or canonical_hunt_weapon or legacy_hunt_style
    hunt_style_resolution = {
        "styleId": canonical_hunt_style,
        "styleLabel": get_hunt_style_label(canonical_hunt_style),
        "weaponId": canonical_hunt_weapon,
        "weaponLabel": get_hunt_style_label(canonical_hunt_weapon),
        "methodId": canonical_hunt_method,
        "methodLabel": get_hunt_style_label(canonical_hunt_method),
        "source": "user_selected" if canonical_hunt_style else "unspecified",
        "rawInput": conditions.hunt_style,
        "rawWeapon": conditions.hunt_weapon,
        "rawMethod": conditions.hunt_method,
    }
    logger.info(
        f"Hunt style resolved: id={canonical_hunt_style} "
        f"weapon={canonical_hunt_weapon} method={canonical_hunt_method} "
        f"source={hunt_style_resolution['source']}"
    )

    # ------------------------------------------------------------------
    # Enhanced species prompt rollout — additive, allowlist-gated.
    # The helper NEVER raises; on any failure we fall back to legacy
    # kwargs (all use_enhanced_* = False) and the prompt is byte-
    # identical to the pre-rollout build.
    # ------------------------------------------------------------------
    rollout_decision = None
    enhanced_kwargs: dict = {}
    try:
        from enhanced_rollout import evaluate_enhanced_rollout
        rollout_decision = evaluate_enhanced_rollout(
            user_subscription_tier=tier,
            species=conditions.animal,
            region_id=region_resolution.region_id if region_resolution else None,
            hunt_context=None,  # no client-supplied trigger inputs yet
        )
        enhanced_kwargs = dict(rollout_decision.kwargs or {})
        # Structured log for analytics dashboards. Never includes
        # image data, tokens, coordinates, or raw prompts.
        logger.info(
            "enhanced_rollout decision tier=%s species=%s pack=%s region=%s "
            "enabled=%s modules=%s reason=%s",
            rollout_decision.tier_evaluated,
            rollout_decision.species_evaluated,
            rollout_decision.species_pack_id,
            rollout_decision.region_evaluated,
            rollout_decision.enabled,
            ",".join(rollout_decision.modules) or "-",
            rollout_decision.reason,
        )
    except Exception as exc:  # noqa: BLE001
        # Helper is hardened to not raise — but if the import itself
        # fails (e.g. circular import in dev), fall through cleanly.
        logger.warning("enhanced_rollout: evaluation failed (%s) — using legacy", exc)
        rollout_decision = None
        enhanced_kwargs = {}

    # Build prompts using modular builder (region-aware, style-aware)
    system_prompt = assemble_system_prompt(
        animal=conditions.animal,
        conditions=conditions_dict,
        species_data=SPECIES_DATA,
        image_count=actual_image_count,
        tier=tier,
        region_resolution=region_resolution,
        hunt_style=canonical_hunt_style,
        hunt_weapon=canonical_hunt_weapon,
        hunt_method=canonical_hunt_method,
        hunt_location_assets=hunt_location_assets,
        **enhanced_kwargs,
    )
    user_prompt_text = assemble_user_prompt(
        species_name=species["name"],
        conditions=conditions_dict,
        image_count=actual_image_count,
    )

    logger.info(f"Prompt built: tier={tier}, images={actual_image_count}, species={conditions.animal}, schema=v2")

    # Add image labels to user prompt if multi-image
    if actual_image_count > 1:
        labels = ["Image 1: PRIMARY coordinate reference map"]
        for i in range(1, actual_image_count):
            labels.append(f"Image {i + 1}: Supporting reference view")
        user_prompt_text = "\n".join(labels) + "\n\n" + user_prompt_text

    session_id = str(uuid.uuid4())
    if use_openai_direct:
        # ------------- PORTABLE PATH: OpenAI SDK directly -------------
        from openai import AsyncOpenAI
        client_openai = AsyncOpenAI(api_key=openai_key)

        # GPT-5.2 Vision multipart content: [{"type":"text"}, {"type":"image_url"}, ...]
        user_content: list = [{"type": "text", "text": user_prompt_text}]
        for img in images_to_send:
            clean = img.split(",", 1)[1] if "," in img else img
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{clean}"},
            })

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
        # First call
        completion = await client_openai.chat.completions.create(
            model="gpt-5.2",
            messages=messages,
        )
        response = completion.choices[0].message.content or ""

        async def _send_repair(repair_text: str) -> str:
            messages.append({"role": "assistant", "content": response})
            messages.append({"role": "user", "content": repair_text})
            c = await client_openai.chat.completions.create(
                model="gpt-5.2",
                messages=messages,
            )
            return c.choices[0].message.content or ""
    else:
        # ------------- LEGACY PATH: emergentintegrations -------------
        # This package is Emergent-internal and NOT on public PyPI.
        # Wrapped in try/except so a Railway / public deploy that
        # doesn't have the package installed simply errors out here
        # (instead of at import-time, which would crash module load).
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        except ImportError as e:
            raise ValueError(
                "OPENAI_API_KEY not set and emergentintegrations is not "
                "installed (expected on Railway/external hosts). Set "
                "OPENAI_API_KEY in your environment."
            ) from e
        image_contents = []
        for idx, img in enumerate(images_to_send):
            clean = img.split(",", 1)[1] if "," in img else img
            image_contents.append(ImageContent(image_base64=clean))

        chat = LlmChat(api_key=emergent_key, session_id=session_id, system_message=system_prompt)
        chat.with_model("openai", "gpt-5.2")

        user_message = UserMessage(text=user_prompt_text, file_contents=image_contents)
        response = await chat.send_message(user_message)

        async def _send_repair(repair_text: str) -> str:
            return await chat.send_message(UserMessage(text=repair_text))

    logger.info(f"AI response received: len={len(response)}")

    # Parse and validate
    parse_ok, parsed, parse_err = parse_llm_response(response)

    if not parse_ok:
        logger.warning(f"Parse failed: {parse_err}. Attempting repair...")
        repair_prompt = get_repair_prompt(response)
        repair_response = await _send_repair(repair_prompt)
        parse_ok, parsed, parse_err = parse_llm_response(repair_response)
        if not parse_ok:
            raise ValueError(f"LLM response repair failed: {parse_err}")
        logger.info("Repair succeeded")

    # Check schema version
    schema_ver = parsed.get("schema_version")
    if schema_ver == "v2":
        is_valid, validation_errors, normalized = validate_and_normalize(parsed)
        if validation_errors:
            logger.info(f"Validation normalized {len(validation_errors)} issues: {validation_errors[:3]}")

        # Return both v2 (full) and v1 (legacy compat)
        v1_compat = convert_v2_to_v1(normalized)
        return {
            "schema_version": "v2",
            "v2": normalized,
            "v1": v1_compat,
            "region_resolution": region_resolution.as_dict(),
            "hunt_style_resolution": hunt_style_resolution,
            "enhanced_rollout": rollout_decision.to_response_meta() if rollout_decision else None,
        }
    else:
        # Old-style v1 response — wrap it
        logger.info("LLM returned v1-style response, wrapping")
        return {
            "schema_version": "v1",
            "v2": None,
            "v1": parsed,
            "region_resolution": region_resolution.as_dict(),
            "hunt_style_resolution": hunt_style_resolution,
            "enhanced_rollout": rollout_decision.to_response_meta() if rollout_decision else None,
        }


# ============================================================
# ROUTES
# ============================================================
@api_router.get("/")
async def root():
    return {"message": "Raven Scout API", "version": "2.0.0"}

@api_router.get("/health")
async def health():
    """Railway health check - always returns OK for container health"""
    return {"status": "ok", "service": "ravenscout-api"}

@api_router.get("/health/db")
async def health_db():
    """Database connectivity check"""
    try:
        # Test MongoDB connection
        await client.admin.command('ping')
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": "disconnected", "error": str(e)}

@api_router.get("/species")
async def get_species(request: Request):
    """Return the species catalog for the signed-in user.

    - Always includes every currently ``enabled`` species.
    - Each entry carries a ``locked`` flag that the UI uses to decide
      whether to route to the subscription screen on tap.
    - For unauthenticated callers, locks are computed against the
      ``trial`` tier (most restrictive) so the public schema is the
      same shape.
    - ``categories`` is the stable UI grouping order.
    """
    # Best-effort user fetch — anonymous callers still get a valid
    # tier-locked catalog (mostly used by the setup screen once the
    # user is authed, but we want the endpoint usable for screenshots).
    tier = "trial"
    try:
        user = await get_current_user(request)
        tier = user.get("tier", "trial")
    except HTTPException:
        tier = "trial"

    from species_registry import (
        list_species,
        is_species_unlocked,
        to_api_dict,
        get_categories,
    )

    catalog = []
    for s in list_species(include_disabled=False, user_tier=tier, only_unlocked=False):
        locked = not is_species_unlocked(s.id, tier)
        catalog.append(to_api_dict(s, locked=locked))

    return {
        "user_tier": tier,
        "categories": get_categories(),
        "species": catalog,
    }


@api_router.post("/analyze-hunt")
async def analyze_hunt(request: Request):
    """AI analysis endpoint - ENFORCES subscription limits."""
    body = await request.json()

    try:
        analyze_req = AnalyzeRequest(**body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Auth + usage check
    user = await get_current_user(request)
    usage = await check_analysis_allowed(user)

    if not usage["allowed"]:
        return AnalyzeResponse(success=False, error=usage["message"], usage=usage)

    # Enforce species tier gating — don't let a trial user bypass the
    # UI lock and POST animal="elk" directly.
    tier_key = user.get("tier", "trial")
    from species_registry import is_species_unlocked, get_species_by_id
    requested_species = (analyze_req.conditions.animal or "").strip().lower()
    if requested_species and not is_species_unlocked(requested_species, tier_key):
        cfg = get_species_by_id(requested_species)
        species_name = cfg.name if cfg else requested_species.title()
        min_tier = cfg.min_tier.title() if cfg else "Core"
        raise HTTPException(
            status_code=403,
            detail=f"{species_name} is a {min_tier} feature. Upgrade your plan to analyze it.",
        )

    # Check weather API access for trial users

    try:
        logger.info(f"Analyzing hunt for {analyze_req.conditions.animal} (user: {user['user_id']}, tier: {tier_key}, images: 1+{len(analyze_req.additional_images or [])})")

        # Task 7: gather user-provided GPS assets for the prompt.
        # Priority order:
        #   1. Inline `location_assets` on the request body (the New
        #      Hunt flow stashes pendingAssets there before the hunt
        #      has a server row). Used directly without persistence.
        #   2. Mongo lookup keyed on (user_id, hunt_id) — covers
        #      re-analyse flows where the hunt already exists.
        # Best-effort throughout: a Mongo blip MUST NOT block the
        # analyze flow.
        loaded_assets: List[dict] = []
        if analyze_req.location_assets:
            for entry in analyze_req.location_assets:
                d = entry.model_dump(exclude_none=False)
                # The prompt builder expects `asset_id` to be a stable
                # string — synthesise one if the inline entry doesn't
                # carry it (frontend uses localId pa_*).
                if not d.get("asset_id"):
                    d["asset_id"] = "pending"
                loaded_assets.append(d)
            logger.info(
                f"Analyze: using {len(loaded_assets)} inline location asset(s)"
            )
        elif analyze_req.hunt_id:
            try:
                cursor = db.hunt_location_assets.find(
                    {"user_id": user["user_id"], "hunt_id": analyze_req.hunt_id},
                    {"_id": 0},
                ).sort("created_at", 1)
                loaded_assets = [doc async for doc in cursor]
                logger.info(
                    f"Loaded {len(loaded_assets)} hunt location asset(s) for "
                    f"hunt={analyze_req.hunt_id}"
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    f"hunt asset load failed for hunt={analyze_req.hunt_id}: {exc}"
                )
                loaded_assets = []

        raw_result = await analyze_map_with_ai(
            analyze_req.conditions,
            analyze_req.map_image_base64,
            additional_images=analyze_req.additional_images if tier_key == "pro" else None,
            tier=tier_key,
            hunt_location_assets=loaded_assets if loaded_assets else None,
        )

        # Increment usage — drains monthly subscription credits FIRST,
        # then dips into purchased extra credits (non-expiring) when
        # the monthly bucket is empty.
        await consume_one_analysis(user)
        updated_usage = await check_analysis_allowed(
            await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
        )

        # Build response: include both v1 compat and v2 full data
        result_id = str(uuid.uuid4())
        v1_data = raw_result.get("v1", {})

        # v1 compat for frontend overlay rendering
        result = {
            "id": result_id,
            "schema_version": raw_result.get("schema_version", "v1"),
            "overlays": v1_data.get("overlays", []),
            "summary": v1_data.get("summary", ""),
            "top_setups": v1_data.get("top_setups", []),
            "wind_notes": v1_data.get("wind_notes", ""),
            "best_time": v1_data.get("best_time", ""),
            "key_assumptions": v1_data.get("key_assumptions", []),
            "species_tips": v1_data.get("species_tips", []),
        }

        # Attach v2 data if available
        if raw_result.get("v2"):
            result["v2"] = raw_result["v2"]

        # Task 11 follow-up: persist AI overlays into
        # analysis_overlay_items so the SAVED MARKERS panel on
        # /results restores them after a reload. Best-effort —
        # logged but never blocks the analyze response.
        try:
            from persist_ai_overlays import persist_ai_overlays
            persist_summary = await persist_ai_overlays(
                db,
                user_id=user["user_id"],
                hunt_id=analyze_req.hunt_id,
                analysis_id=result_id,
                saved_map_image_id=analyze_req.saved_map_image_id,
                overlays=result.get("overlays") or [],
                hunt_assets=loaded_assets,
            )
            logger.info(
                "persist_ai_overlays summary user=%s hunt=%s -> %s",
                user["user_id"], analyze_req.hunt_id, persist_summary,
            )
            # Surface the analysis_id on the response so the client
            # can correlate persisted items with this run.
            result["analysis_id"] = result_id
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "persist_ai_overlays unexpected failure: %s", exc,
            )

        # Enhanced-rollout decision is exposed as a TOP-LEVEL sibling
        # field on the response, NOT as a nested key on `result`. This
        # keeps `data.result` byte-identical to the pre-rollout shape
        # so older frontend builds that strictly typecheck `result`
        # don't trip on an unknown property. Contains only the safe
        # subset (enabled / modules / reason) — no coordinates,
        # no prompts, no images.
        enhanced_meta = raw_result.get("enhanced_rollout")

        return JSONResponse({
            "success": True,
            "result": result,
            "usage": updated_usage,
            "region_resolution": raw_result.get("region_resolution"),
            "hunt_style_resolution": raw_result.get("hunt_style_resolution"),
            "enhanced_rollout": enhanced_meta,
        })
    except json.JSONDecodeError:
        return JSONResponse({"success": False, "error": "Failed to parse AI response. Please try again.", "usage": None})
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        raw_msg = str(e)
        low = raw_msg.lower()
        # Translate noisy LiteLLM / OpenAI upstream errors into
        # actionable user-facing text so the client alert is not just
        # a stack-trace fragment.
        if "budget has been exceeded" in low or "max budget" in low:
            user_msg = (
                "AI analysis budget exceeded for this account. "
                "Please top up your Emergent Universal Key in your profile, "
                "then try again."
            )
        elif "badgatewayerror" in low or "error code: 502" in low or "bad gateway" in low:
            user_msg = (
                "The AI service is temporarily unavailable (502 Bad Gateway). "
                "This is an upstream issue — please retry in a minute."
            )
        elif "rate limit" in low or "too many requests" in low:
            user_msg = (
                "AI rate limit hit. Wait 10-20 seconds before retrying."
            )
        elif "timeout" in low or "timed out" in low:
            user_msg = (
                "AI analysis timed out. Try again with a smaller map image "
                "or a stronger connection."
            )
        else:
            user_msg = raw_msg
        return JSONResponse({"success": False, "error": user_msg, "usage": None})


# ============================================================
# WEATHER API (unchanged, but with tier check)
# ============================================================
WEATHER_TIME_RANGES = {
    "morning": (5, 12),
    "evening": (12, 20),
    "all-day": (5, 20),
}

class WeatherRequest(BaseModel):
    lat: float
    lon: float
    date: str
    time_window: str = "morning"

class WeatherData(BaseModel):
    wind_direction: str
    wind_speed_mph: float
    temperature_f: float
    precipitation_chance: int
    cloud_cover: int
    condition: str
    humidity: int
    pressure_mb: float
    sunrise: Optional[str] = None
    sunset: Optional[str] = None
    location_name: Optional[str] = None
    fetched_at: str
    is_forecast: bool = True

class WeatherResponse(BaseModel):
    success: bool
    data: Optional[WeatherData] = None
    error: Optional[str] = None

@api_router.post("/weather", response_model=WeatherResponse)
async def get_weather(request: Request):
    body = await request.json()
    try:
        weather_req = WeatherRequest(**body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Check if user has weather access (trial users get manual only)
    user = await get_optional_user(request)
    if user:
        tier_key = user.get("tier", "trial")
        if tier_key == "trial":
            return WeatherResponse(success=False, error="Weather sync requires Core or Pro plan. Upgrade to auto-fill weather data.")

    api_key = os.environ.get("WEATHER_API_KEY")
    if not api_key:
        return WeatherResponse(success=False, error="Weather API not configured")

    try:
        query = f"{weather_req.lat},{weather_req.lon}"
        target_date = datetime.strptime(weather_req.date, "%Y-%m-%d").date()
        today = datetime.now().date()
        days_diff = (target_date - today).days

        if days_diff < 0:
            url = f"http://api.weatherapi.com/v1/forecast.json?key={api_key}&q={query}&days=1"
        elif days_diff <= 14:
            url = f"http://api.weatherapi.com/v1/forecast.json?key={api_key}&q={query}&days={min(days_diff + 1, 14)}&dt={weather_req.date}"
        else:
            url = f"http://api.weatherapi.com/v1/future.json?key={api_key}&q={query}&dt={weather_req.date}"

        async with httpx.AsyncClient(timeout=15) as hclient:
            resp = await hclient.get(url)
            resp.raise_for_status()
            data = resp.json()

        start_hour, end_hour = WEATHER_TIME_RANGES.get(weather_req.time_window, (5, 20))
        forecast_day = None

        if "forecast" in data and data["forecast"]["forecastday"]:
            for fd in data["forecast"]["forecastday"]:
                if fd["date"] == weather_req.date:
                    forecast_day = fd
                    break
            if not forecast_day:
                forecast_day = data["forecast"]["forecastday"][0]

        if not forecast_day:
            return WeatherResponse(success=False, error="No forecast data available")

        hours = forecast_day.get("hour", [])
        relevant_hours = [h for h in hours if start_hour <= int(h["time"].split(" ")[1].split(":")[0]) < end_hour]

        if not relevant_hours:
            relevant_hours = hours[:6] if hours else []

        if relevant_hours:
            avg_temp = sum(h["temp_f"] for h in relevant_hours) / len(relevant_hours)
            avg_wind = sum(h["wind_mph"] for h in relevant_hours) / len(relevant_hours)
            avg_precip = sum(h["chance_of_rain"] for h in relevant_hours) / len(relevant_hours)
            avg_cloud = sum(h["cloud"] for h in relevant_hours) / len(relevant_hours)
            avg_humidity = sum(h["humidity"] for h in relevant_hours) / len(relevant_hours)
            avg_pressure = sum(h["pressure_mb"] for h in relevant_hours) / len(relevant_hours)
            mid = relevant_hours[len(relevant_hours) // 2]
            wind_dir = mid["wind_dir"]
            condition = mid["condition"]["text"]
        else:
            day_data = forecast_day.get("day", {})
            avg_temp = day_data.get("avgtemp_f", 50)
            avg_wind = day_data.get("maxwind_mph", 5)
            avg_precip = day_data.get("daily_chance_of_rain", 0)
            avg_cloud, avg_humidity, avg_pressure = 50, 50, 1013
            wind_dir = "N"
            condition = day_data.get("condition", {}).get("text", "Unknown")

        astro = forecast_day.get("astro", {})
        location = data.get("location", {})

        weather = WeatherData(
            wind_direction=wind_dir, wind_speed_mph=round(avg_wind, 1),
            temperature_f=round(avg_temp, 1), precipitation_chance=round(avg_precip),
            cloud_cover=round(avg_cloud), condition=condition,
            humidity=round(avg_humidity), pressure_mb=round(avg_pressure, 1),
            sunrise=astro.get("sunrise"), sunset=astro.get("sunset"),
            location_name=f"{location.get('name', '')}, {location.get('region', '')}",
            fetched_at=datetime.now(timezone.utc).isoformat(), is_forecast=days_diff >= 0,
        )
        return WeatherResponse(success=True, data=weather)

    except httpx.HTTPStatusError as e:
        return WeatherResponse(success=False, error=f"Weather API error: {e.response.status_code}")
    except Exception as e:
        logger.error(f"Weather error: {e}")
        return WeatherResponse(success=False, error=str(e))


# ============================================================
# CLIENT TELEMETRY
# ============================================================
class ClientEventBody(BaseModel):
    event: str
    data: Optional[dict] = None
    platform: Optional[str] = None
    platform_version: Optional[str] = None
    user_agent: Optional[str] = None
    ts: Optional[str] = None


@api_router.post("/log/client-event")
async def log_client_event(body: ClientEventBody):
    """Best-effort client-side diagnostics sink.
    Fire-and-forget from the app — used for tracking storage failures,
    fallback usage, etc. Never raises to the client."""
    try:
        logger.warning(
            "[client-event] event=%s platform=%s version=%s data=%s",
            body.event,
            body.platform or "?",
            body.platform_version or "?",
            json.dumps(body.data or {}, default=str)[:500],
        )
    except Exception as e:
        logger.info(f"client-event log failed: {e}")
    return {"ok": True}


# ============================================================
# HUNTS CRUD — Server-side hunt persistence + cross-device sync
# ============================================================
#
# Collection: `hunts`
# Indices (created lazily on startup below):
#   user_id + created_at desc — list current user's history
#   hunt_id unique per user   — upsert-friendly client-originated ids
#
# Auth: every route below requires a valid session (get_current_user).
# Ownership: hunts are scoped per user_id — a user can NEVER read or
# mutate another user's hunt even by guessing hunt_id.
#
# Schema is intentionally permissive on nested fields (metadata /
# analysis_result / analysis_context / media_refs) to stay in sync
# with the frontend's PersistedHuntAnalysis without requiring a
# migration each time the analysis shape evolves.

class HuntUpsertBody(BaseModel):
    """Client payload for POST /api/hunts and PUT /api/hunts/{id}."""
    hunt_id: str = Field(..., min_length=4, max_length=64)
    # Canonical metadata — the server validates known keys but passes
    # the rest through to Mongo so new frontend fields don't 400.
    metadata: dict
    analysis: Optional[dict] = None
    analysis_context: Optional[dict] = None
    media_refs: Optional[List[str]] = None
    primary_media_ref: Optional[str] = None
    image_s3_keys: Optional[List[str]] = None
    storage_strategy: Optional[str] = None
    # Free-form pass-through for forward compatibility.
    extra: Optional[dict] = None


def _scrub_hunt(doc: dict) -> dict:
    """Strip _id, return a JSON-safe copy of a hunt Mongo document."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    # Convert datetimes to ISO strings for the frontend.
    for k in ("created_at", "updated_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


async def _ensure_hunts_indexes() -> None:
    """Idempotent index setup — safe to call repeatedly."""
    try:
        await db.hunts.create_index([("user_id", 1), ("created_at", -1)])
        await db.hunts.create_index(
            [("user_id", 1), ("hunt_id", 1)],
            unique=True,
            name="user_hunt_unique",
        )
    except Exception as e:
        logger.warning(f"hunts index setup failed (non-fatal): {e}")


# @app.on_event("startup")
# async def _startup_hunts_indexes():
#     await _ensure_hunts_indexes()


@api_router.post("/hunts")
async def upsert_hunt(body: HuntUpsertBody, request: Request):
    """Create or replace a hunt. Idempotent on (user_id, hunt_id).

    Frontend calls this from `finalizeProvisionalHunt` after a fresh
    analysis, and from the overlay editor after saved edits. Sending
    the same hunt_id again updates the existing doc and bumps
    updated_at.
    """
    user = await get_current_user(request)
    uid = user["user_id"]
    now = datetime.now(timezone.utc)

    # Build the document. `$setOnInsert` keeps created_at stable across
    # re-upserts; `$set` refreshes everything else.
    update_doc = {
        "$setOnInsert": {
            "user_id": uid,
            "hunt_id": body.hunt_id,
            "created_at": now,
        },
        "$set": {
            "updated_at": now,
            "metadata": body.metadata or {},
            "analysis": body.analysis or {},
            "analysis_context": body.analysis_context or {},
            "media_refs": body.media_refs or [],
            "primary_media_ref": body.primary_media_ref,
            "image_s3_keys": body.image_s3_keys or [],
            "storage_strategy": body.storage_strategy,
            "extra": body.extra or {},
        },
    }

    try:
        await db.hunts.update_one(
            {"user_id": uid, "hunt_id": body.hunt_id},
            update_doc,
            upsert=True,
        )
    except Exception as e:
        logger.error(f"hunts upsert failed for user={uid} hunt={body.hunt_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not save hunt")

    # Clear pending_uploads rows for any keys this hunt now references.
    # Once a key lives inside a saved hunt's image_s3_keys, the orphan
    # cleanup sweep must NOT delete it — removing the row here is what
    # makes that distinction. Best-effort: a transient failure leaves
    # the row pending and the sweep will see the key is now committed
    # (it joins against `hunts.image_s3_keys` before deleting anything).
    keys_to_commit = body.image_s3_keys or []
    if keys_to_commit:
        try:
            await db.pending_uploads.delete_many(
                {"user_id": uid, "s3_key": {"$in": list(keys_to_commit)}},
            )
        except Exception:  # noqa: BLE001
            logger.warning(
                "pending_uploads cleanup failed for hunt=%s (non-fatal)",
                body.hunt_id,
            )

    saved = await db.hunts.find_one(
        {"user_id": uid, "hunt_id": body.hunt_id},
        {"_id": 0},
    )
    return {"ok": True, "hunt": _scrub_hunt(saved or {})}


@api_router.get("/hunts")
async def list_hunts(request: Request, limit: int = 50, skip: int = 0):
    """List the current user's hunts, newest first. Paginated."""
    user = await get_current_user(request)
    uid = user["user_id"]

    # Clamp pagination to sane bounds.
    limit = max(1, min(limit, 200))
    skip = max(0, skip)

    cursor = (
        db.hunts.find({"user_id": uid}, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    hunts = [_scrub_hunt(h) async for h in cursor]
    total = await db.hunts.count_documents({"user_id": uid})
    return {"ok": True, "total": total, "limit": limit, "skip": skip, "hunts": hunts}


@api_router.get("/hunts/{hunt_id}")
async def get_hunt(hunt_id: str, request: Request, include_assets: bool = True):
    """Fetch a single hunt scoped to the current user.

    By default also hydrates the hunt's GPS assets (Hunt Location
    Assets — see /app/backend/hunt_geo_router.py) into the response
    under the `location_assets` key. Pass `include_assets=false` to
    skip the join when the caller doesn't need them.
    """
    user = await get_current_user(request)
    uid = user["user_id"]
    doc = await db.hunts.find_one({"user_id": uid, "hunt_id": hunt_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Hunt not found")

    hunt_payload = _scrub_hunt(doc)

    if include_assets:
        # Lazy-import to avoid a circular at module load (the asset
        # helper lives in models/, which already imports from server
        # only via the router builder).
        from models import asset_doc_to_dict  # noqa: WPS433

        try:
            cursor = (
                db.hunt_location_assets.find(
                    {"user_id": uid, "hunt_id": hunt_id}, {"_id": 0}
                )
                .sort("created_at", 1)
            )
            assets = [asset_doc_to_dict(d) async for d in cursor]
        except Exception as exc:  # noqa: BLE001
            # Hydration failures must NEVER break the hunt read path.
            # Log + return an empty list so the UI can still render.
            logger.warning(
                "get_hunt: asset hydration failed for user=%s hunt=%s: %s",
                uid,
                hunt_id,
                exc,
            )
            assets = []
        hunt_payload["location_assets"] = assets

    return {"ok": True, "hunt": hunt_payload}


class HuntPatchBody(BaseModel):
    """Partial update — only fields supplied are written."""
    metadata: Optional[dict] = None
    analysis: Optional[dict] = None
    analysis_context: Optional[dict] = None
    media_refs: Optional[List[str]] = None
    primary_media_ref: Optional[str] = None
    image_s3_keys: Optional[List[str]] = None
    storage_strategy: Optional[str] = None
    extra: Optional[dict] = None


@api_router.put("/hunts/{hunt_id}")
async def update_hunt(hunt_id: str, body: HuntPatchBody, request: Request):
    """Partial update (e.g. overlay edits saved from the results screen)."""
    user = await get_current_user(request)
    uid = user["user_id"]
    now = datetime.now(timezone.utc)

    update_fields = {"updated_at": now}
    for key in (
        "metadata",
        "analysis",
        "analysis_context",
        "media_refs",
        "primary_media_ref",
        "image_s3_keys",
        "storage_strategy",
        "extra",
    ):
        val = getattr(body, key, None)
        if val is not None:
            update_fields[key] = val

    result = await db.hunts.update_one(
        {"user_id": uid, "hunt_id": hunt_id},
        {"$set": update_fields},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Hunt not found")

    saved = await db.hunts.find_one(
        {"user_id": uid, "hunt_id": hunt_id},
        {"_id": 0},
    )
    return {"ok": True, "hunt": _scrub_hunt(saved or {})}


@api_router.delete("/hunts/{hunt_id}")
async def delete_hunt(hunt_id: str, request: Request):
    """
    Fully delete a hunt: removes the Mongo document AND every S3
    object listed in its `image_s3_keys`. Best-effort on S3 — a
    single object failure is logged but does not block the Mongo
    delete (orphan cleanup is preferable to a hunt that can't be
    deleted at all). Idempotent: 404 if it didn't exist.
    """
    user = await get_current_user(request)
    uid = user["user_id"]

    # Step 1: load the hunt so we know which S3 keys belong to it.
    # Filtering by user_id also enforces ownership for the S3 deletes.
    hunt_doc = await db.hunts.find_one(
        {"user_id": uid, "hunt_id": hunt_id},
        {"image_s3_keys": 1},
    )
    if not hunt_doc:
        raise HTTPException(status_code=404, detail="Hunt not found")

    # Step 2: delete the S3 objects (if any). Per-key best-effort —
    # we keep going even if one fails so partial cleanup still
    # happens and Mongo doesn't get out of sync with S3 long term.
    s3_keys = hunt_doc.get("image_s3_keys") or []
    s3_deleted = 0
    s3_failed: list[str] = []
    if s3_keys and s3_service.is_configured():
        for key in s3_keys:
            # Defense in depth: never delete keys that don't belong
            # to this user, even if Mongo somehow stored a stray.
            try:
                _guard_storage_key_owner(user, key)
            except HTTPException:
                logger.warning("delete_hunt: skipped foreign s3 key %s", key)
                s3_failed.append(key)
                continue
            try:
                if s3_service.delete_object(key):
                    s3_deleted += 1
                else:
                    s3_failed.append(key)
            except Exception as exc:  # noqa: BLE001
                logger.warning("delete_hunt: s3 delete failed for %s: %s", key, exc)
                s3_failed.append(key)
    elif s3_keys and not s3_service.is_configured():
        logger.warning(
            "delete_hunt: %d s3 keys orphaned because S3 is not configured",
            len(s3_keys),
        )
        s3_failed = list(s3_keys)

    # Step 3: delete the Mongo doc. We do this last so a transient
    # S3 failure leaves the hunt visible (and retryable) instead of
    # silently disappearing while its assets linger.
    result = await db.hunts.delete_one({"user_id": uid, "hunt_id": hunt_id})

    # Step 4: cascade-clean associated GPS location assets so they
    # don't dangle orphaned in the hunt_location_assets collection.
    # Best-effort — failures are logged but don't block the response.
    try:
        await db.hunt_location_assets.delete_many(
            {"user_id": uid, "hunt_id": hunt_id},
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "delete_hunt: location asset cleanup failed for hunt=%s: %s",
            hunt_id,
            exc,
        )

    # Step 5: cascade-clean analysis overlay items (Task 6) for the
    # same hunt. Same best-effort semantics.
    try:
        await db.analysis_overlay_items.delete_many(
            {"user_id": uid, "hunt_id": hunt_id},
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "delete_hunt: overlay item cleanup failed for hunt=%s: %s",
            hunt_id,
            exc,
        )

    return {
        "ok": True,
        "deleted": result.deleted_count,
        "s3": {
            "requested": len(s3_keys),
            "deleted": s3_deleted,
            "failed": s3_failed,
        },
    }



# ============================================================
# APP SETUP
# ============================================================

# Mount password/email + profile endpoints onto the /api router.
# Factored out into password_auth.py so server.py stays navigable.
from password_auth import build_password_auth_router
api_router.include_router(build_password_auth_router(db, get_current_user))

# Mount hunt-geo endpoints (Hunt Location Assets + Saved Map Image
# geo metadata). Lives in hunt_geo_router.py for the same reason.
from hunt_geo_router import build_hunt_geo_router, ensure_hunt_geo_indexes
api_router.include_router(build_hunt_geo_router(db, get_current_user))

app.include_router(api_router)


# ----------------------------------------------------------------
# Global validation-error handler
# ----------------------------------------------------------------
# FastAPI's default 422 handler echoes the offending input value back
# in `errors[].input`. When the input contains non-JSON-finite floats
# (NaN, +Inf, -Inf) — or non-serialisable objects like the embedded
# `ctx.error` ValueError that Pydantic surfaces from custom field
# validators — Starlette's JSONResponse.render() crashes with
# `ValueError: Out of range float values are not JSON compliant`
# (or `TypeError: ... not JSON serializable`), turning a clean 422
# into a 500. We coerce the payload through `jsonable_encoder` and
# rewrite non-finite floats so the response always serialises.
import math as _math
from fastapi.encoders import jsonable_encoder as _jsonable_encoder


def _sanitise_non_finite(obj):
    if isinstance(obj, float):
        if _math.isnan(obj):
            return "NaN"
        if _math.isinf(obj):
            return "Infinity" if obj > 0 else "-Infinity"
        return obj
    if isinstance(obj, dict):
        return {k: _sanitise_non_finite(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitise_non_finite(v) for v in obj]
    return obj


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(_request: Request, exc: RequestValidationError):
    # jsonable_encoder turns embedded ValueError / Decimal / datetime
    # objects into JSON-safe primitives; _sanitise_non_finite then
    # finishes the job for NaN / +Inf / -Inf which jsonable_encoder
    # leaves as float.
    safe_errors = _sanitise_non_finite(_jsonable_encoder(exc.errors()))
    return JSONResponse(status_code=422, content={"detail": safe_errors})


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.on_event("startup")
async def _startup_indexes():
    """Ensure all collection indexes exist. Idempotent and best-effort:
    failures are logged inside each helper so a transient Mongo blip
    at boot doesn't crash the API.
    """
    try:
        await _ensure_hunts_indexes()
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"hunts index setup failed at startup: {exc}")
    try:
        await ensure_hunt_geo_indexes(db)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"hunt_geo index setup failed at startup: {exc}")
