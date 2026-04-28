"""Persist AI-returned overlays into analysis_overlay_items.

Bridges the legacy `OverlayMarker` shape (x_percent / y_percent /
reasoning / confidence) emitted by /analyze-hunt into the canonical
`AnalysisOverlayItemCreate` schema, then stores each row via
`overlay_normalizer.normalize_overlay_item()`.

Strict design rules:
  * Best-effort throughout — analyze MUST NOT fail because
    persistence failed. Any exception is caught + logged.
  * Never fabricate GPS for pixel-only images (the normalizer
    already enforces this; we simply pass the saved image record
    through).
  * Never override `coordinate_source = 'user_provided'`. AI
    overlays are always written as `'ai_estimated_from_image'`.
  * Skip persistence entirely when:
        - hunt_id missing
        - saved_map_image cannot be located (no original_width /
          original_height to convert percent → absolute pixels)
        - the AI returned no overlays.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from overlay_normalizer import normalize_overlay_item

logger = logging.getLogger(__name__)

# Map legacy overlay-taxonomy ids → AnalysisOverlayItemType ids.
# Any id not present here lands as 'custom' (still persisted, just
# rendered with the generic marker style on the frontend).
_TYPE_MAP: Dict[str, str] = {
    "stand": "stand",
    "blind": "blind",
    "corridor": "travel_corridor",
    "travel_corridor": "travel_corridor",
    "access_route": "access_point",
    "access_point": "access_point",
    "avoid": "avoid_area",
    "avoid_area": "avoid_area",
    "bedding": "bedding",
    "food": "feeder",
    "feeder": "feeder",
    "water": "water",
    "trail": "route",
    "route": "route",
    "scrape": "scrape",
    "rub": "rub",
    "camera": "camera",
    "parking": "parking",
    "wind": "wind",
    "funnel": "funnel",
    "recommended_setup": "recommended_setup",
    "custom": "custom",
}

# AI returns confidence as a string ("high"/"medium"/"low"). Convert
# to the float [0,1] range AnalysisOverlayItem expects. Unknown
# strings drop confidence rather than guess.
_CONFIDENCE_MAP: Dict[str, float] = {
    "high": 0.9,
    "medium": 0.6,
    "med": 0.6,
    "moderate": 0.6,
    "low": 0.3,
}


def _to_confidence_float(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        try:
            v = float(raw)
        except Exception:  # noqa: BLE001
            return None
        if v != v or v < 0 or v > 1:  # NaN or out of range
            # If someone sent 0..100 percent, clamp into 0..1.
            if 0 <= v <= 100:
                return max(0.0, min(1.0, v / 100.0))
            return None
        return v
    if isinstance(raw, str):
        return _CONFIDENCE_MAP.get(raw.strip().lower())
    return None


def _percent_to_pixel(percent: Any, dim: int) -> Optional[float]:
    """Convert a 0..100 percent into an absolute original-pixel coord.

    Returns None when the inputs are unusable rather than crashing —
    the normalizer will then skip with a sensible reason.
    """
    if percent is None or dim is None:
        return None
    try:
        p = float(percent)
        d = float(dim)
    except Exception:  # noqa: BLE001
        return None
    if d <= 0:
        return None
    # Allow 0..100 (canonical) and gracefully accept 0..1 inputs.
    if 0.0 <= p <= 1.0 and not (p == 0.0 and percent == 0):
        # 0..1 fraction
        return p * d
    return (p / 100.0) * d


async def persist_ai_overlays(
    db: Any,
    *,
    user_id: str,
    hunt_id: Optional[str],
    analysis_id: Optional[str],
    saved_map_image_id: Optional[str],
    overlays: List[Dict[str, Any]],
    hunt_assets: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, int]:
    """Best-effort persist AI overlays for a hunt analysis.

    Returns a small summary dict — `{ok, persisted, skipped, reason?}`
    — purely for logging / response telemetry. NEVER raises.
    """
    out = {"ok": False, "persisted": 0, "skipped": 0}

    if not hunt_id:
        out["reason"] = "no_hunt_id"
        return out
    if not overlays:
        out["ok"] = True
        out["reason"] = "no_overlays"
        return out

    # Locate the saved_map_image. Prefer the explicit id from the
    # request; fall back to the most-recent record for the hunt.
    saved_image: Optional[Dict[str, Any]] = None
    try:
        if saved_map_image_id:
            saved_image = await db.saved_map_images.find_one(
                {"image_id": saved_map_image_id, "user_id": user_id},
                {"_id": 0},
            )
        if not saved_image and hunt_id:
            saved_image = await db.saved_map_images.find_one(
                {"hunt_id": hunt_id, "user_id": user_id},
                {"_id": 0},
                sort=[("created_at", -1)],
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "persist_ai_overlays: saved_map_image lookup failed user=%s hunt=%s: %s",
            user_id, hunt_id, exc,
        )
        saved_image = None

    if not saved_image:
        out["reason"] = "no_saved_map_image"
        return out

    ow = saved_image.get("original_width")
    oh = saved_image.get("original_height")
    if not (isinstance(ow, (int, float)) and ow > 0 and isinstance(oh, (int, float)) and oh > 0):
        out["reason"] = "saved_image_missing_dimensions"
        return out

    assets_by_id: Dict[str, Dict[str, Any]] = {}
    for a in (hunt_assets or []):
        aid = a.get("asset_id")
        if aid:
            assets_by_id[aid] = a

    persist_payloads: List[Dict[str, Any]] = []
    for idx, ov in enumerate(overlays):
        if not isinstance(ov, dict):
            out["skipped"] += 1
            continue
        legacy_type = (ov.get("type") or "").strip().lower()
        new_type = _TYPE_MAP.get(legacy_type, "custom")
        x = _percent_to_pixel(ov.get("x_percent"), ow)
        y = _percent_to_pixel(ov.get("y_percent"), oh)
        raw_item = {
            "type": new_type,
            "label": ov.get("label") or "",
            "description": ov.get("reasoning") or ov.get("description"),
            "x": x,
            "y": y,
            "coordinate_source": "ai_estimated_from_image",
            "confidence": _to_confidence_float(ov.get("confidence")),
        }

        payload, reason = normalize_overlay_item(
            raw_item,
            hunt_id=hunt_id,
            analysis_id=analysis_id,
            saved_map_image=saved_image,
            hunt_assets_by_id=assets_by_id,
        )
        if payload is None:
            out["skipped"] += 1
            logger.info(
                "persist_ai_overlays: skipped idx=%s reason=%s",
                idx, reason,
            )
            continue

        # Explicit user_id stamping (the normalizer doesn't know).
        doc = payload.model_dump()
        doc["user_id"] = user_id
        # Stable item_id (the new_from_create path used in the router
        # would generate one, but here we construct AnalysisOverlayItem
        # via the same path the router uses):
        from models import AnalysisOverlayItem
        item = AnalysisOverlayItem.new_from_create(user_id=user_id, payload=payload)
        persist_payloads.append(item.model_dump())

    if not persist_payloads:
        out["ok"] = True
        out["reason"] = "all_skipped"
        return out

    try:
        await db.analysis_overlay_items.insert_many(
            persist_payloads,
            ordered=False,
        )
        out["ok"] = True
        out["persisted"] = len(persist_payloads)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "persist_ai_overlays: insert_many failed user=%s hunt=%s items=%s: %s",
            user_id, hunt_id, len(persist_payloads), exc,
        )
        out["reason"] = "insert_failed"
        out["skipped"] += len(persist_payloads)

    return out


__all__ = ["persist_ai_overlays"]
