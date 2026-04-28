"""FastAPI router for Hunt Location Assets and Saved Map Image geo metadata.

Mounted onto the main `/api` router from server.py.

Design goals:
  * One router for the two related geo concerns so server.py stays
    short and the endpoints stay discoverable.
  * All persistence is scoped to the authenticated user's `user_id`.
  * Hunt asset writes additionally check that the hunt exists and
    belongs to the caller before touching the asset collection — this
    prevents stranded assets pointing at a non-existent hunt.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

from models import (
    AnalysisOverlayItem,
    AnalysisOverlayItemCreate,
    AnalysisOverlayItemUpdate,
    HuntLocationAsset,
    HuntLocationAssetCreate,
    HuntLocationAssetUpdate,
    SavedMapImage,
    SavedMapImageCreate,
    SavedMapImageUpdate,
    asset_doc_to_dict,
    overlay_item_doc_to_dict,
    saved_map_image_doc_to_dict,
)

logger = logging.getLogger(__name__)


async def ensure_hunt_geo_indexes(db) -> None:
    """Idempotent index setup for the new collections.

    Called once at app startup. Failures are logged (not raised) so
    the API still serves reads if Mongo briefly rejects index creation.
    """
    try:
        await db.hunt_location_assets.create_index(
            [("user_id", 1), ("asset_id", 1)],
            unique=True,
            name="user_asset_unique",
        )
        await db.hunt_location_assets.create_index(
            [("user_id", 1), ("hunt_id", 1), ("created_at", -1)],
            name="user_hunt_assets_recent",
        )
        await db.saved_map_images.create_index(
            [("user_id", 1), ("image_id", 1)],
            unique=True,
            name="user_image_unique",
        )
        await db.saved_map_images.create_index(
            [("user_id", 1), ("hunt_id", 1)],
            name="user_hunt_images",
        )
        await db.analysis_overlay_items.create_index(
            [("user_id", 1), ("item_id", 1)],
            unique=True,
            name="user_overlay_unique",
        )
        await db.analysis_overlay_items.create_index(
            [("user_id", 1), ("hunt_id", 1), ("created_at", 1)],
            name="user_hunt_overlays_chronological",
        )
        await db.analysis_overlay_items.create_index(
            [("user_id", 1), ("hunt_id", 1), ("analysis_id", 1)],
            name="user_hunt_analysis_overlays",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"hunt_geo index setup failed (non-fatal): {exc}")


def build_hunt_geo_router(db, get_current_user):
    """Return an APIRouter wired to `db` and the existing auth dep."""
    router = APIRouter()

    # ----------------------------------------------------------------
    # Hunt ownership guard
    # ----------------------------------------------------------------
    async def _require_hunt(uid: str, hunt_id: str) -> None:
        """Reject the request if the hunt doesn't exist for this user.

        We intentionally ONLY require ownership of the hunt — not of
        any pre-existing asset payload — so the same guard works for
        creates and lists.
        """
        doc = await db.hunts.find_one(
            {"user_id": uid, "hunt_id": hunt_id},
            {"_id": 1},
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Hunt not found")

    # ================================================================
    # Hunt Location Assets
    # ================================================================

    @router.post("/hunts/{hunt_id}/assets")
    async def create_asset(
        hunt_id: str, body: HuntLocationAssetCreate, request: Request
    ):
        user = await get_current_user(request)
        uid = user["user_id"]

        # The hunt_id in the path takes precedence over any value
        # supplied in the body — keeps the URL the source of truth.
        body = body.model_copy(update={"hunt_id": hunt_id})
        await _require_hunt(uid, hunt_id)

        asset = HuntLocationAsset.new_from_create(user_id=uid, payload=body)
        try:
            await db.hunt_location_assets.insert_one(asset.model_dump())
        except Exception as exc:  # noqa: BLE001
            # Most likely a duplicate (user_id, asset_id) — surface
            # cleanly so the client can retry with a fresh id.
            logger.error(
                "hunt_location_assets insert failed user=%s asset=%s: %s",
                uid,
                asset.asset_id,
                exc,
            )
            raise HTTPException(status_code=409, detail="Could not save asset")

        return {"ok": True, "asset": asset.model_dump()}

    @router.get("/hunts/{hunt_id}/assets")
    async def list_assets(hunt_id: str, request: Request):
        user = await get_current_user(request)
        uid = user["user_id"]
        await _require_hunt(uid, hunt_id)

        cursor = (
            db.hunt_location_assets.find(
                {"user_id": uid, "hunt_id": hunt_id}, {"_id": 0}
            )
            .sort("created_at", 1)
        )
        assets = [asset_doc_to_dict(d) async for d in cursor]
        return {"ok": True, "assets": assets, "count": len(assets)}

    @router.get("/hunts/{hunt_id}/assets/{asset_id}")
    async def get_asset(hunt_id: str, asset_id: str, request: Request):
        user = await get_current_user(request)
        uid = user["user_id"]
        doc = await db.hunt_location_assets.find_one(
            {"user_id": uid, "hunt_id": hunt_id, "asset_id": asset_id},
            {"_id": 0},
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Asset not found")
        return {"ok": True, "asset": asset_doc_to_dict(doc)}

    @router.put("/hunts/{hunt_id}/assets/{asset_id}")
    async def update_asset(
        hunt_id: str,
        asset_id: str,
        body: HuntLocationAssetUpdate,
        request: Request,
    ):
        user = await get_current_user(request)
        uid = user["user_id"]

        update_fields: dict = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        for key in ("type", "name", "latitude", "longitude", "notes"):
            val = getattr(body, key, None)
            if val is not None:
                update_fields[key] = val

        result = await db.hunt_location_assets.update_one(
            {"user_id": uid, "hunt_id": hunt_id, "asset_id": asset_id},
            {"$set": update_fields},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Asset not found")

        doc = await db.hunt_location_assets.find_one(
            {"user_id": uid, "hunt_id": hunt_id, "asset_id": asset_id},
            {"_id": 0},
        )
        return {"ok": True, "asset": asset_doc_to_dict(doc or {})}

    @router.delete("/hunts/{hunt_id}/assets/{asset_id}")
    async def delete_asset(hunt_id: str, asset_id: str, request: Request):
        user = await get_current_user(request)
        uid = user["user_id"]
        result = await db.hunt_location_assets.delete_one(
            {"user_id": uid, "hunt_id": hunt_id, "asset_id": asset_id}
        )
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Asset not found")
        return {"ok": True, "deleted": result.deleted_count}

    # ================================================================
    # Saved Map Image geo metadata
    # ================================================================

    @router.post("/saved-map-images")
    async def upsert_saved_map_image(
        body: SavedMapImageCreate, request: Request
    ):
        """Idempotent upsert keyed on (user_id, image_id).

        Re-posting the same image_id replaces all geo metadata for it
        and bumps `updated_at`.
        """
        user = await get_current_user(request)
        uid = user["user_id"]

        # If the caller links the image to a hunt, validate that hunt
        # belongs to the user.
        if body.hunt_id:
            await _require_hunt(uid, body.hunt_id)

        record = SavedMapImage.new_from_create(user_id=uid, payload=body)
        record_dict = record.model_dump()

        now_iso = record_dict["updated_at"]
        update_doc = {
            "$setOnInsert": {
                "user_id": uid,
                "image_id": body.image_id,
                "created_at": record_dict["created_at"],
            },
            "$set": {
                k: v
                for k, v in record_dict.items()
                if k not in ("user_id", "image_id", "created_at")
            },
        }
        update_doc["$set"]["updated_at"] = now_iso

        try:
            await db.saved_map_images.update_one(
                {"user_id": uid, "image_id": body.image_id},
                update_doc,
                upsert=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "saved_map_images upsert failed user=%s image=%s: %s",
                uid,
                body.image_id,
                exc,
            )
            raise HTTPException(
                status_code=500, detail="Could not save image metadata"
            )

        saved = await db.saved_map_images.find_one(
            {"user_id": uid, "image_id": body.image_id}, {"_id": 0}
        )
        return {
            "ok": True,
            "saved_map_image": saved_map_image_doc_to_dict(saved or {}),
        }

    @router.get("/saved-map-images/{image_id}")
    async def get_saved_map_image(image_id: str, request: Request):
        user = await get_current_user(request)
        uid = user["user_id"]
        doc = await db.saved_map_images.find_one(
            {"user_id": uid, "image_id": image_id}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Saved map image not found")
        return {
            "ok": True,
            "saved_map_image": saved_map_image_doc_to_dict(doc),
        }

    @router.get("/saved-map-images")
    async def list_saved_map_images(
        request: Request, hunt_id: Optional[str] = None
    ):
        user = await get_current_user(request)
        uid = user["user_id"]
        query: dict = {"user_id": uid}
        if hunt_id:
            query["hunt_id"] = hunt_id
        cursor = db.saved_map_images.find(query, {"_id": 0}).sort("created_at", -1)
        images = [saved_map_image_doc_to_dict(d) async for d in cursor]
        return {"ok": True, "saved_map_images": images, "count": len(images)}

    @router.patch("/saved-map-images/{image_id}")
    async def patch_saved_map_image(
        image_id: str, body: SavedMapImageUpdate, request: Request
    ):
        """Partial update. Does NOT re-run cross-field invariants —
        callers that want to enable geo placement should POST the
        full create body so the validator runs end-to-end.
        """
        user = await get_current_user(request)
        uid = user["user_id"]

        update_fields = {"updated_at": datetime.now(timezone.utc).isoformat()}
        for key in body.model_dump(exclude_unset=True).keys():
            val = getattr(body, key, None)
            if val is not None:
                update_fields[key] = val

        if body.hunt_id:
            await _require_hunt(uid, body.hunt_id)

        result = await db.saved_map_images.update_one(
            {"user_id": uid, "image_id": image_id},
            {"$set": update_fields},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Saved map image not found")

        doc = await db.saved_map_images.find_one(
            {"user_id": uid, "image_id": image_id}, {"_id": 0}
        )
        return {
            "ok": True,
            "saved_map_image": saved_map_image_doc_to_dict(doc or {}),
        }

    @router.delete("/saved-map-images/{image_id}")
    async def delete_saved_map_image(image_id: str, request: Request):
        user = await get_current_user(request)
        uid = user["user_id"]
        result = await db.saved_map_images.delete_one(
            {"user_id": uid, "image_id": image_id}
        )
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Saved map image not found")
        return {"ok": True, "deleted": result.deleted_count}

    # ================================================================
    # Analysis Overlay Items (Task 6)
    # ================================================================

    @router.post("/hunts/{hunt_id}/overlay-items")
    async def create_overlay_item(
        hunt_id: str, body: AnalysisOverlayItemCreate, request: Request
    ):
        user = await get_current_user(request)
        uid = user["user_id"]
        body = body.model_copy(update={"hunt_id": hunt_id})
        await _require_hunt(uid, hunt_id)

        # When the caller links a user_provided overlay to a
        # HuntLocationAsset, verify that the asset actually belongs
        # to this user + hunt. Prevents cross-hunt asset references.
        if (
            body.coordinate_source == "user_provided"
            and body.source_asset_id
        ):
            asset_doc = await db.hunt_location_assets.find_one(
                {
                    "user_id": uid,
                    "hunt_id": hunt_id,
                    "asset_id": body.source_asset_id,
                },
                {"_id": 1},
            )
            if not asset_doc:
                raise HTTPException(
                    status_code=400,
                    detail="source_asset_id does not exist for this hunt",
                )

        item = AnalysisOverlayItem.new_from_create(user_id=uid, payload=body)
        try:
            await db.analysis_overlay_items.insert_one(item.model_dump())
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "analysis_overlay_items insert failed user=%s hunt=%s: %s",
                uid,
                hunt_id,
                exc,
            )
            raise HTTPException(
                status_code=409, detail="Could not save overlay item"
            )
        return {"ok": True, "overlay_item": item.model_dump()}

    @router.get("/hunts/{hunt_id}/overlay-items")
    async def list_overlay_items(
        hunt_id: str, request: Request, analysis_id: Optional[str] = None
    ):
        user = await get_current_user(request)
        uid = user["user_id"]
        await _require_hunt(uid, hunt_id)

        query: dict = {"user_id": uid, "hunt_id": hunt_id}
        if analysis_id:
            query["analysis_id"] = analysis_id

        cursor = db.analysis_overlay_items.find(query, {"_id": 0}).sort(
            "created_at", 1
        )
        items = [overlay_item_doc_to_dict(d) async for d in cursor]
        return {"ok": True, "overlay_items": items, "count": len(items)}

    @router.get("/hunts/{hunt_id}/overlay-items/{item_id}")
    async def get_overlay_item(hunt_id: str, item_id: str, request: Request):
        user = await get_current_user(request)
        uid = user["user_id"]
        doc = await db.analysis_overlay_items.find_one(
            {"user_id": uid, "hunt_id": hunt_id, "item_id": item_id},
            {"_id": 0},
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Overlay item not found")
        return {"ok": True, "overlay_item": overlay_item_doc_to_dict(doc)}

    @router.put("/hunts/{hunt_id}/overlay-items/{item_id}")
    async def update_overlay_item(
        hunt_id: str,
        item_id: str,
        body: AnalysisOverlayItemUpdate,
        request: Request,
    ):
        user = await get_current_user(request)
        uid = user["user_id"]

        update_fields: dict = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        for key in body.model_dump(exclude_unset=True).keys():
            val = getattr(body, key, None)
            if val is not None:
                update_fields[key] = val

        result = await db.analysis_overlay_items.update_one(
            {"user_id": uid, "hunt_id": hunt_id, "item_id": item_id},
            {"$set": update_fields},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Overlay item not found")

        doc = await db.analysis_overlay_items.find_one(
            {"user_id": uid, "hunt_id": hunt_id, "item_id": item_id},
            {"_id": 0},
        )
        return {"ok": True, "overlay_item": overlay_item_doc_to_dict(doc or {})}

    @router.delete("/hunts/{hunt_id}/overlay-items/{item_id}")
    async def delete_overlay_item(
        hunt_id: str, item_id: str, request: Request
    ):
        user = await get_current_user(request)
        uid = user["user_id"]
        result = await db.analysis_overlay_items.delete_one(
            {"user_id": uid, "hunt_id": hunt_id, "item_id": item_id}
        )
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Overlay item not found")
        return {"ok": True, "deleted": result.deleted_count}

    # ----------------------------------------------------------------
    # Bulk normalize + persist (Task 8)
    # ----------------------------------------------------------------

    @router.post("/hunts/{hunt_id}/overlay-items:bulk-normalize")
    async def bulk_normalize_overlay_items(
        hunt_id: str, request: Request
    ):
        """Normalize and persist a batch of returned overlay items.

        Body:
            {
              "saved_map_image_id": "img_xyz" | null,
              "analysis_id":        "analysis-2026-..." | null,
              "items": [
                {
                  "type": "stand",
                  "label": "...",
                  "latitude": ...,
                  "longitude": ...,
                  "x": ...,
                  "y": ...,
                  "coordinateSource": "...",
                  "sourceAssetId": "..."
                },
                ...
              ]
            }

        Returns counts of created / skipped items + per-skipped reason
        codes so the caller can log without crashing the analyse
        response.
        """
        user = await get_current_user(request)
        uid = user["user_id"]
        await _require_hunt(uid, hunt_id)

        try:
            body = await request.json()
        except Exception:  # noqa: BLE001
            raise HTTPException(status_code=422, detail="Invalid JSON body")
        if not isinstance(body, dict):
            raise HTTPException(status_code=422, detail="Body must be an object")

        items = body.get("items") or []
        if not isinstance(items, list):
            raise HTTPException(status_code=422, detail="`items` must be a list")
        analysis_id = body.get("analysis_id")
        saved_map_image_id = body.get("saved_map_image_id")

        # Load context once: saved map image (if any) + the hunt's
        # location assets keyed by asset_id (for user_provided
        # passthrough). Both lookups are best-effort.
        saved_map_image = None
        if saved_map_image_id:
            try:
                saved_map_image = await db.saved_map_images.find_one(
                    {"user_id": uid, "image_id": saved_map_image_id},
                    {"_id": 0},
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "bulk_normalize: saved_map_image lookup failed for image=%s: %s",
                    saved_map_image_id,
                    exc,
                )
                saved_map_image = None

        try:
            asset_cursor = db.hunt_location_assets.find(
                {"user_id": uid, "hunt_id": hunt_id}, {"_id": 0}
            )
            assets_by_id = {
                a["asset_id"]: a async for a in asset_cursor if a.get("asset_id")
            }
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "bulk_normalize: asset lookup failed for hunt=%s: %s",
                hunt_id,
                exc,
            )
            assets_by_id = {}

        # Lazy import \u2014 avoids a circular at module load.
        from overlay_normalizer import normalize_overlay_item  # noqa: WPS433

        from models import AnalysisOverlayItem  # noqa: WPS433

        created: list[dict] = []
        skipped: list[dict] = []
        for idx, raw in enumerate(items):
            payload, reason = normalize_overlay_item(
                raw,
                hunt_id=hunt_id,
                analysis_id=analysis_id,
                saved_map_image=saved_map_image,
                hunt_assets_by_id=assets_by_id,
            )
            if payload is None:
                skipped.append({"index": idx, "reason": reason or "unknown"})
                continue
            item = AnalysisOverlayItem.new_from_create(
                user_id=uid, payload=payload
            )
            try:
                await db.analysis_overlay_items.insert_one(item.model_dump())
                created.append(item.model_dump())
            except Exception as exc:  # noqa: BLE001
                # Most likely a (user_id, item_id) collision \u2014 surface
                # cleanly and keep going so one bad row doesn't poison
                # the whole batch.
                logger.error(
                    "bulk_normalize: insert failed user=%s hunt=%s idx=%s: %s",
                    uid,
                    hunt_id,
                    idx,
                    exc,
                )
                skipped.append({"index": idx, "reason": "insert_failed"})

        return {
            "ok": True,
            "created_count": len(created),
            "skipped_count": len(skipped),
            "created": created,
            "skipped": skipped,
        }

    return router


__all__ = ["build_hunt_geo_router", "ensure_hunt_geo_indexes"]
