"""Raven Scout — Analysis Overlay Item normalizer (Task 8).

Pure-function normalizer that converts a raw "incoming" overlay item
(from the LLM JSON, a manual mobile UI, or a future client-side
pre-render) into a canonical `AnalysisOverlayItemCreate` payload
ready for /app/backend/hunt_geo_router.py to persist.

Core decisions in priority order:

  1. **User-provided** (coordinate_source='user_provided' AND
     source_asset_id matches a known HuntLocationAsset) →
     - lat/lng are FORCED to the asset's stored values (we never
       trust AI-modified GPS for a user pin)
     - x/y are derived via lat→pixel iff the saved image supports
       geo placement; otherwise left as whatever the caller passed
       (or None).
     - coordinate_source stays 'user_provided'.

  2. **Pixel-only image** (saved image is missing or
     supports_geo_placement=False) →
     - x/y must be present (otherwise the item is INVALID).
     - lat/lng are FORCIBLY nulled out — we do NOT fabricate GPS
       for pixel-only images.
     - coordinate_source coerced to 'pixel_only'.

  3. **Geo-capable saved image with lat/lng but no x/y** →
     - validate lat/lng; derive x/y via latLngToPixel.
     - coordinate_source preserved when caller supplied a valid one,
       otherwise defaulted to 'derived_from_saved_map_bounds'.

  4. **Geo-capable saved image with x/y but no lat/lng** →
     - validate x/y; derive lat/lng via pixelToLatLng.
     - coordinate_source defaults to 'derived_from_saved_map_bounds'.

  5. **Both lat/lng and x/y supplied on geo-capable image** →
     - validate both, persist both, no recomputation. Caller's
       coordinate_source is honoured; defaults to
       'ai_estimated_from_image' when the caller failed to label it.

If a normalize attempt fails any guard, this module returns
`(None, reason)` so the caller can log + skip the item without
ever crashing the analyse response.
"""
from __future__ import annotations

from typing import Optional, Tuple

from models import (
    ANALYSIS_OVERLAY_ITEM_TYPES,
    COORDINATE_SOURCES,
    AnalysisOverlayItemCreate,
)
from overlay_projection import (
    OverlayProjectionError,
    lat_lng_to_pixel,
    pixel_to_lat_lng,
)


# --------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------


def _coerce_source(value, default: str) -> str:
    """Return `value` if it's a known coordinate source, else `default`."""
    if isinstance(value, str) and value in COORDINATE_SOURCES:
        return value
    return default


def _is_finite_number(v) -> bool:
    if v is None:
        return False
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return False
    return v == v and v not in (float("inf"), float("-inf"))


def _saved_image_supports_geo(saved_map_image: Optional[dict]) -> bool:
    """A saved image supports geo placement only when:
      - the row exists,
      - supports_geo_placement is True,
      - all four bounds + both pixel dimensions are finite numbers.
    """
    if not saved_map_image:
        return False
    if not saved_map_image.get("supports_geo_placement"):
        return False
    for k in (
        "north_lat",
        "south_lat",
        "west_lng",
        "east_lng",
        "original_width",
        "original_height",
    ):
        if not _is_finite_number(saved_map_image.get(k)):
            return False
    return True


def _normalise_input_keys(item: dict) -> dict:
    """Accept either snake_case (wire) or camelCase (frontend) keys.

    The LLM may also emit camelCase per the prompt schema. This
    function returns a copy with the canonical snake_case keys the
    rest of the module uses.
    """
    out = dict(item or {})
    aliases = {
        "coordinateSource": "coordinate_source",
        "sourceAssetId": "source_asset_id",
        "savedMapImageId": "saved_map_image_id",
        "analysisId": "analysis_id",
    }
    for camel, snake in aliases.items():
        if camel in out and snake not in out:
            out[snake] = out.pop(camel)
        elif camel in out:
            # Both supplied — prefer the canonical one we already have.
            out.pop(camel)
    return out


# --------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------


def normalize_overlay_item(
    raw_item: dict,
    *,
    hunt_id: str,
    analysis_id: Optional[str] = None,
    saved_map_image: Optional[dict] = None,
    hunt_assets_by_id: Optional[dict] = None,
) -> Tuple[Optional[AnalysisOverlayItemCreate], Optional[str]]:
    """Normalize a single raw overlay item.

    Returns:
      (payload, None) on success — `payload` is a fully-validated
      AnalysisOverlayItemCreate ready to persist via
      `db.analysis_overlay_items.insert_one(payload.model_dump())`.

      (None, reason) on a soft-fail. Reason is a stable short string
      like "missing_label", "invalid_xy_for_pixel_only", etc. The
      caller is expected to log this and skip the item.
    """
    if not isinstance(raw_item, dict):
        return None, "not_a_dict"

    item = _normalise_input_keys(raw_item)

    # ----- Required surface fields -----
    type_id = item.get("type")
    if not type_id or type_id not in ANALYSIS_OVERLAY_ITEM_TYPES:
        return None, f"invalid_type:{type_id}"

    label = item.get("label")
    if not isinstance(label, str) or not label.strip():
        return None, "missing_label"

    description = item.get("description")
    confidence = item.get("confidence")
    saved_map_image_id = item.get("saved_map_image_id") or (
        (saved_map_image or {}).get("image_id")
    )

    geo_capable = _saved_image_supports_geo(saved_map_image)

    # Defaults the caller may not have supplied.
    raw_source = item.get("coordinate_source")
    raw_lat = item.get("latitude") if _is_finite_number(item.get("latitude")) else None
    raw_lng = item.get("longitude") if _is_finite_number(item.get("longitude")) else None
    raw_x = item.get("x") if _is_finite_number(item.get("x")) else None
    raw_y = item.get("y") if _is_finite_number(item.get("y")) else None
    raw_asset_id = item.get("source_asset_id")

    # ----------------------------------------------------------------
    # 1. user_provided + known asset → force lat/lng from the asset.
    # ----------------------------------------------------------------
    if raw_source == "user_provided" and raw_asset_id:
        asset = (hunt_assets_by_id or {}).get(raw_asset_id)
        if not asset:
            return None, f"unknown_source_asset:{raw_asset_id}"
        forced_lat = asset.get("latitude")
        forced_lng = asset.get("longitude")
        if not (_is_finite_number(forced_lat) and _is_finite_number(forced_lng)):
            return None, "source_asset_missing_coords"
        # Derive x/y if the saved image supports geo placement.
        x_out, y_out = raw_x, raw_y
        if geo_capable:
            try:
                x_out, y_out = lat_lng_to_pixel(
                    latitude=forced_lat,
                    longitude=forced_lng,
                    north_lat=saved_map_image["north_lat"],
                    south_lat=saved_map_image["south_lat"],
                    west_lng=saved_map_image["west_lng"],
                    east_lng=saved_map_image["east_lng"],
                    original_width=saved_map_image["original_width"],
                    original_height=saved_map_image["original_height"],
                )
            except OverlayProjectionError:
                # Fall back to whatever the caller supplied — better
                # to persist the user pin without x/y than to drop it.
                pass
        return _build_create_payload(
            hunt_id=hunt_id,
            analysis_id=analysis_id,
            saved_map_image_id=saved_map_image_id,
            type_id=type_id,
            label=label.strip(),
            description=description,
            latitude=float(forced_lat),
            longitude=float(forced_lng),
            x=x_out,
            y=y_out,
            coordinate_source="user_provided",
            confidence=confidence,
            source_asset_id=raw_asset_id,
        )

    # ----------------------------------------------------------------
    # 4. Pixel-only image — never fabricate GPS.
    # ----------------------------------------------------------------
    if not geo_capable:
        if not (_is_finite_number(raw_x) and _is_finite_number(raw_y)):
            return None, "missing_xy_for_pixel_only"
        return _build_create_payload(
            hunt_id=hunt_id,
            analysis_id=analysis_id,
            saved_map_image_id=saved_map_image_id,
            type_id=type_id,
            label=label.strip(),
            description=description,
            latitude=None,
            longitude=None,
            x=float(raw_x),
            y=float(raw_y),
            coordinate_source="pixel_only",
            confidence=confidence,
            # source_asset_id intentionally dropped on pixel_only —
            # AnalysisOverlayItemCreate doesn't require it for any
            # source other than user_provided.
            source_asset_id=None,
        )

    # ----------------------------------------------------------------
    # Geo-capable saved image branch (cases 2, 3 + both supplied).
    # ----------------------------------------------------------------
    have_latlng = raw_lat is not None and raw_lng is not None
    have_xy = raw_x is not None and raw_y is not None

    if have_latlng and not have_xy:
        # 2 — derive x/y from lat/lng.
        try:
            x_out, y_out = lat_lng_to_pixel(
                latitude=raw_lat,
                longitude=raw_lng,
                north_lat=saved_map_image["north_lat"],
                south_lat=saved_map_image["south_lat"],
                west_lng=saved_map_image["west_lng"],
                east_lng=saved_map_image["east_lng"],
                original_width=saved_map_image["original_width"],
                original_height=saved_map_image["original_height"],
            )
        except OverlayProjectionError as exc:
            return None, f"latlng_to_pixel_failed:{exc}"
        coord_src = _coerce_source(
            raw_source, default="derived_from_saved_map_bounds"
        )
        return _build_create_payload(
            hunt_id=hunt_id,
            analysis_id=analysis_id,
            saved_map_image_id=saved_map_image_id,
            type_id=type_id,
            label=label.strip(),
            description=description,
            latitude=float(raw_lat),
            longitude=float(raw_lng),
            x=x_out,
            y=y_out,
            coordinate_source=coord_src,
            confidence=confidence,
            source_asset_id=raw_asset_id if coord_src == "user_provided" else None,
        )

    if have_xy and not have_latlng:
        # 3 — derive lat/lng from x/y.
        try:
            lat_out, lng_out = pixel_to_lat_lng(
                x=raw_x,
                y=raw_y,
                north_lat=saved_map_image["north_lat"],
                south_lat=saved_map_image["south_lat"],
                west_lng=saved_map_image["west_lng"],
                east_lng=saved_map_image["east_lng"],
                original_width=saved_map_image["original_width"],
                original_height=saved_map_image["original_height"],
            )
        except OverlayProjectionError as exc:
            return None, f"pixel_to_latlng_failed:{exc}"
        coord_src = _coerce_source(
            raw_source, default="derived_from_saved_map_bounds"
        )
        return _build_create_payload(
            hunt_id=hunt_id,
            analysis_id=analysis_id,
            saved_map_image_id=saved_map_image_id,
            type_id=type_id,
            label=label.strip(),
            description=description,
            latitude=lat_out,
            longitude=lng_out,
            x=float(raw_x),
            y=float(raw_y),
            coordinate_source=coord_src,
            confidence=confidence,
            source_asset_id=raw_asset_id if coord_src == "user_provided" else None,
        )

    if have_latlng and have_xy:
        # Caller supplied both — persist as-is.
        coord_src = _coerce_source(
            raw_source, default="ai_estimated_from_image"
        )
        return _build_create_payload(
            hunt_id=hunt_id,
            analysis_id=analysis_id,
            saved_map_image_id=saved_map_image_id,
            type_id=type_id,
            label=label.strip(),
            description=description,
            latitude=float(raw_lat),
            longitude=float(raw_lng),
            x=float(raw_x),
            y=float(raw_y),
            coordinate_source=coord_src,
            confidence=confidence,
            source_asset_id=raw_asset_id if coord_src == "user_provided" else None,
        )

    # Neither lat/lng nor x/y — there's nothing to persist that we
    # can render or place. Skip.
    return None, "no_coordinates"


def _build_create_payload(
    *,
    hunt_id: str,
    analysis_id: Optional[str],
    saved_map_image_id: Optional[str],
    type_id: str,
    label: str,
    description,
    latitude: Optional[float],
    longitude: Optional[float],
    x: Optional[float],
    y: Optional[float],
    coordinate_source: str,
    confidence,
    source_asset_id: Optional[str],
) -> Tuple[Optional[AnalysisOverlayItemCreate], Optional[str]]:
    """Construct an AnalysisOverlayItemCreate, returning a soft-fail
    if Pydantic validation rejects the assembled payload (e.g. an
    out-of-range confidence, a half-coordinate slipping through, etc.).
    """
    try:
        payload = AnalysisOverlayItemCreate(
            hunt_id=hunt_id,
            analysis_id=analysis_id,
            saved_map_image_id=saved_map_image_id,
            type=type_id,
            label=label,
            description=description if isinstance(description, str) else None,
            latitude=latitude,
            longitude=longitude,
            x=x,
            y=y,
            coordinate_source=coordinate_source,
            confidence=confidence if _is_finite_number(confidence) else None,
            source_asset_id=source_asset_id,
        )
    except Exception as exc:  # noqa: BLE001
        return None, f"pydantic_rejected:{exc.__class__.__name__}"
    return payload, None


__all__ = ["normalize_overlay_item"]
