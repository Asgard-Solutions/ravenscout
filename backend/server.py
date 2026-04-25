from fastapi import FastAPI, APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import uuid
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

REVENUECAT_ENTITLEMENT_MAP = {
    "core_monthly": "core",
    "core_annual": "core",
    "pro_monthly": "pro",
    "pro_annual": "pro",
}


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
        # Trial: lifetime limit
        remaining = max(0, tier["analysis_limit"] - analysis_count)
        if remaining <= 0:
            return {"allowed": False, "remaining": 0, "limit": tier["analysis_limit"],
                    "tier": tier_key, "message": "Trial limit reached. Upgrade to continue."}
        return {"allowed": True, "remaining": remaining, "limit": tier["analysis_limit"], "tier": tier_key}
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
        if remaining <= 0:
            return {"allowed": False, "remaining": 0, "limit": tier["analysis_limit"],
                    "tier": tier_key, "message": "Monthly limit reached. Upgrade or wait for next cycle."}
        return {"allowed": True, "remaining": remaining, "limit": tier["analysis_limit"],
                "rollover": rollover_count, "tier": tier_key}


async def increment_usage(user_id: str):
    """Increment analysis count for user."""
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
    google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not google_client_id:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_CLIENT_ID not configured on server",
        )

    # Verify the ID token against Google's JWKS. This checks
    # signature, issuer (accounts.google.com), audience (our
    # GOOGLE_CLIENT_ID), and expiry. Raises ValueError on ANY
    # tampering or mismatch.
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        claims = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            google_client_id,
            clock_skew_in_seconds=10,
        )
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
    """Sync subscription status from RevenueCat (called from mobile after purchase)."""
    user = await get_current_user(request)
    body = await request.json()
    rc_user_id = body.get("revenuecat_user_id")
    entitlements = body.get("entitlements", {})

    # Determine tier from active entitlements
    new_tier = "trial"
    for entitlement_id, ent_data in entitlements.items():
        if ent_data.get("isActive"):
            product = ent_data.get("productIdentifier", "")
            for product_prefix, tier in REVENUECAT_ENTITLEMENT_MAP.items():
                if product_prefix in product:
                    new_tier = tier
                    break

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
async def revenuecat_webhook(request: Request):
    """RevenueCat server-to-server webhook for subscription events."""
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
        product_id = event.get("product_id", "")
        new_tier = "trial"
        for prefix, tier in REVENUECAT_ENTITLEMENT_MAP.items():
            if prefix in product_id:
                new_tier = tier
                break

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
    except Exception as e:
        logger.error(f"presign_upload failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate upload URL")

    return {
        "uploadUrl": upload_url,
        "assetUrl": asset_url,
        "storageKey": key,
        "expiresIn": expires_in,
        "privateDelivery": s3_service.is_private_delivery(),
        "mime": mime,
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

    # Optional hunt style — archery / rifle / blind / saddle /
    # public_land / spot_and_stalk. See species_prompts.hunt_styles.
    hunt_style: Optional[str] = None

class AnalyzeRequest(BaseModel):
    conditions: HuntConditions
    map_image_base64: str
    additional_images: Optional[List[str]] = None

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
async def analyze_map_with_ai(conditions: HuntConditions, map_image_base64: str, additional_images: Optional[List[str]] = None, tier: str = "trial") -> dict:
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
        normalize_hunt_style,
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

    # Hunt-style resolution — canonical id only; freeform input is
    # normalized here so the prompt pipeline + response + client all
    # persist the same canonical value.
    canonical_hunt_style = normalize_hunt_style(conditions.hunt_style)
    hunt_style_resolution = {
        "styleId": canonical_hunt_style,
        "styleLabel": get_hunt_style_label(canonical_hunt_style),
        "source": "user_selected" if canonical_hunt_style else "unspecified",
        "rawInput": conditions.hunt_style,
    }
    logger.info(
        f"Hunt style resolved: id={canonical_hunt_style} "
        f"source={hunt_style_resolution['source']}"
    )

    # Build prompts using modular builder (region-aware, style-aware)
    system_prompt = assemble_system_prompt(
        animal=conditions.animal,
        conditions=conditions_dict,
        species_data=SPECIES_DATA,
        image_count=actual_image_count,
        tier=tier,
        region_resolution=region_resolution,
        hunt_style=canonical_hunt_style,
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
        raw_result = await analyze_map_with_ai(
            analyze_req.conditions,
            analyze_req.map_image_base64,
            additional_images=analyze_req.additional_images if tier_key == "pro" else None,
            tier=tier_key,
        )

        # Increment usage
        await increment_usage(user["user_id"])
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

        return JSONResponse({
            "success": True,
            "result": result,
            "usage": updated_usage,
            "region_resolution": raw_result.get("region_resolution"),
            "hunt_style_resolution": raw_result.get("hunt_style_resolution"),
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
async def get_hunt(hunt_id: str, request: Request):
    """Fetch a single hunt scoped to the current user."""
    user = await get_current_user(request)
    uid = user["user_id"]
    doc = await db.hunts.find_one({"user_id": uid, "hunt_id": hunt_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Hunt not found")
    return {"ok": True, "hunt": _scrub_hunt(doc)}


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

app.include_router(api_router)

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
