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
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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
    },
    "pro": {
        "name": "Pro",
        "analysis_limit": 100,  # Per month
        "is_lifetime": False,
        "weather_api": True,
        "cloud_sync": True,
        "monthly_price": 14.99,
        "annual_price": 149.99,
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
                # Calculate rollover (max 1 month carryover, capped at tier limit)
                unused = max(0, tier["analysis_limit"] - analysis_count)
                new_rollover = min(unused, tier["analysis_limit"])

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


_ALLOWED_MEDIA_EXT = {"jpg", "jpeg", "png", "webp"}
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

    mime = body.mime or "image/jpeg"
    if not mime.startswith("image/"):
        raise HTTPException(status_code=400, detail="mime must be an image/* type")

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
    region: Optional[str] = None
    # Optional GPS context — when provided we use it to auto-resolve
    # the canonical hunting region that drives regional prompt
    # modifiers. `region` above is still accepted as a freeform
    # manual override (and wins when set / normalizable).
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    map_centroid_lat: Optional[float] = None
    map_centroid_lon: Optional[float] = None

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


# ============================================================
# SPECIES DATA (unchanged)
# ============================================================
SPECIES_DATA = {
    "deer": {
        "name": "Whitetail Deer", "icon": "deer",
        "description": "Focus on bedding-to-feeding transitions. Prioritize funnels, saddles, and edges. Wind advantage is critical.",
        "behavior_rules": [
            "Deer move from bedding to feeding areas during dawn and dusk transitions",
            "Funnels, saddles, and terrain edges concentrate deer movement",
            "Wind direction is critical - always set up downwind of expected travel",
            "Mature bucks use cover and terrain to stay hidden during daylight",
            "Water sources are magnets during hot weather",
            "Rut activity changes movement patterns significantly"
        ]
    },
    "turkey": {
        "name": "Wild Turkey", "icon": "turkey",
        "description": "Focus on roost-to-strut zones. Open areas near cover edges. Morning setup positioning is key.",
        "behavior_rules": [
            "Turkeys roost in tall trees, often near water or ridgelines",
            "Morning fly-down leads to strut zones in open areas",
            "Set up between roost and open areas like fields or clearings",
            "Turkeys prefer edges between cover and open ground",
            "Avoid setting up too close to roost trees",
            "Afternoon turkeys return toward roost through familiar travel routes"
        ]
    },
    "hog": {
        "name": "Wild Hog", "icon": "hog",
        "description": "Focus on water, thick cover, and feeding zones. Night movement tendencies. Ambush near trails and crossings.",
        "behavior_rules": [
            "Hogs are primarily nocturnal, most active at dusk and dawn",
            "Water and wallowing areas are critical attractants",
            "Thick cover provides daytime bedding areas",
            "Hogs travel established trails between bedding, water, and food",
            "Agricultural fields and food plots attract hog activity",
            "Trail crossings and pinch points are ideal ambush locations"
        ]
    }
}


# ============================================================
# AI ANALYSIS (unchanged)
# ============================================================
async def analyze_map_with_ai(conditions: HuntConditions, map_image_base64: str, additional_images: Optional[List[str]] = None, tier: str = "trial") -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    from prompt_builder import assemble_system_prompt, assemble_user_prompt, get_repair_prompt, get_evidence_level
    from schema_validator import parse_llm_response, validate_and_normalize, convert_v2_to_v1

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise ValueError("EMERGENT_LLM_KEY not configured")

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
    # Precedence: manual override (freeform `region`) > GPS > map centroid > default.
    from species_prompts import resolve_effective_region
    map_centroid = None
    if conditions.map_centroid_lat is not None and conditions.map_centroid_lon is not None:
        map_centroid = (conditions.map_centroid_lat, conditions.map_centroid_lon)
    region_resolution = resolve_effective_region(
        gps_lat=conditions.latitude,
        gps_lon=conditions.longitude,
        map_centroid=map_centroid,
        manual_override=conditions.region,
    )
    logger.info(
        f"Region resolved: id={region_resolution.region_id} "
        f"source={region_resolution.source} label='{region_resolution.region_label}'"
    )

    # Build prompts using modular builder (region-aware)
    system_prompt = assemble_system_prompt(
        animal=conditions.animal,
        conditions=conditions_dict,
        species_data=SPECIES_DATA,
        image_count=actual_image_count,
        tier=tier,
        region_resolution=region_resolution,
    )
    user_prompt_text = assemble_user_prompt(
        species_name=species["name"],
        conditions=conditions_dict,
        image_count=actual_image_count,
    )

    logger.info(f"Prompt built: tier={tier}, images={actual_image_count}, species={conditions.animal}, schema=v2")

    # Assemble image contents with labels
    image_contents = []
    for idx, img in enumerate(images_to_send):
        clean = img.split(",", 1)[1] if "," in img else img
        image_contents.append(ImageContent(image_base64=clean))

    # Add image labels to user prompt if multi-image
    if actual_image_count > 1:
        labels = ["Image 1: PRIMARY coordinate reference map"]
        for i in range(1, actual_image_count):
            labels.append(f"Image {i + 1}: Supporting reference view")
        user_prompt_text = "\n".join(labels) + "\n\n" + user_prompt_text

    session_id = str(uuid.uuid4())
    chat = LlmChat(api_key=api_key, session_id=session_id, system_message=system_prompt)
    chat.with_model("openai", "gpt-5.2")

    user_message = UserMessage(text=user_prompt_text, file_contents=image_contents)
    response = await chat.send_message(user_message)
    logger.info(f"AI response received: len={len(response)}")

    # Parse and validate
    parse_ok, parsed, parse_err = parse_llm_response(response)

    if not parse_ok:
        logger.warning(f"Parse failed: {parse_err}. Attempting repair...")
        repair_prompt = get_repair_prompt(response)
        repair_msg = UserMessage(text=repair_prompt)
        repair_response = await chat.send_message(repair_msg)
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
        }
    else:
        # Old-style v1 response — wrap it
        logger.info("LLM returned v1-style response, wrapping")
        return {
            "schema_version": "v1",
            "v2": None,
            "v1": parsed,
            "region_resolution": region_resolution.as_dict(),
        }


# ============================================================
# ROUTES
# ============================================================
@api_router.get("/")
async def root():
    return {"message": "Raven Scout API", "version": "2.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "ok"}

@api_router.get("/species")
async def get_species():
    species_list = []
    for key, data in SPECIES_DATA.items():
        species_list.append({"id": key, "name": data["name"], "description": data["description"], "icon": data["icon"]})
    return {"species": species_list}


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

    # Check weather API access for trial users
    tier_key = user.get("tier", "trial")

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
        })
    except json.JSONDecodeError:
        return JSONResponse({"success": False, "error": "Failed to parse AI response. Please try again.", "usage": None})
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return JSONResponse({"success": False, "error": str(e), "usage": None})


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
# APP SETUP
# ============================================================
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
