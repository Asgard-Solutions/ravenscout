"""AnalysisOverlayItem — schema for persisted analysis overlay items.

This model is the GPS-aware persistence shape for items that appear
on a hunt's analysis overlay layer. It is INTENTIONALLY ADDITIVE to
the existing `overlay_taxonomy.py` (which drives the LLM prompt and
the legend) so old analyses keep loading unchanged.

Two kinds of overlay items live here:

  1. **User-provided assets** — created from a HuntLocationAsset
     (Task 1). `coordinate_source = 'user_provided'`,
     `source_asset_id` set, lat/lng mirror the source asset, and
     `x` / `y` are populated whenever the saved map image supports
     geo placement (Task 5).

  2. **AI-generated items** — recommended setups, funnels,
     corridors, avoid areas, etc. Lat/lng are optional and only
     present when the saved image has geo bounds AND the LLM was
     able to place the item with confidence; otherwise the item is
     pixel-only (`coordinate_source = 'pixel_only'`, lat/lng null).

Storage / lookup:
  * Persisted in the Mongo collection `analysis_overlay_items`.
  * Compound unique on (user_id, item_id).
  * Compound query on (user_id, hunt_id, created_at).
  * Older `hunts.overlays[]` field (legacy LLM output) is left in
    place — readers fall back to it when no analysis_overlay_items
    exist for a hunt.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from geo_validation import (
    GeoValidationError,
    validate_latitude,
    validate_longitude,
)

# --------------------------------------------------------------------
# Canonical type sets — frontend types/geo.ts mirrors these.
# --------------------------------------------------------------------
ANALYSIS_OVERLAY_ITEM_TYPES = (
    "stand",
    "blind",
    "feeder",
    "camera",
    "parking",
    "access_point",
    "water",
    "scrape",
    "rub",
    "bedding",
    "route",
    "wind",
    "funnel",
    "travel_corridor",
    "recommended_setup",
    "avoid_area",
    "custom",
)

AnalysisOverlayItemType = Literal[
    "stand",
    "blind",
    "feeder",
    "camera",
    "parking",
    "access_point",
    "water",
    "scrape",
    "rub",
    "bedding",
    "route",
    "wind",
    "funnel",
    "travel_corridor",
    "recommended_setup",
    "avoid_area",
    "custom",
]

COORDINATE_SOURCES = (
    "user_provided",
    "ai_estimated_from_image",
    "derived_from_saved_map_bounds",
    "pixel_only",
)

CoordinateSource = Literal[
    "user_provided",
    "ai_estimated_from_image",
    "derived_from_saved_map_bounds",
    "pixel_only",
]


# --------------------------------------------------------------------
# Legacy overlay taxonomy mapping
# --------------------------------------------------------------------
# Existing analyses persist overlay rows under the slim taxonomy in
# overlay_taxonomy.py. When future code wants to surface those legacy
# rows alongside new AnalysisOverlayItems, callers can normalise the
# slug via this map. We deliberately do NOT auto-migrate legacy rows
# — they stay in the `hunts.overlays[]` field unchanged so existing
# screens render exactly as before.
LEGACY_OVERLAY_TYPE_MAP: dict[str, AnalysisOverlayItemType] = {
    "stand": "recommended_setup",
    "corridor": "travel_corridor",
    "access_route": "route",
    "avoid": "avoid_area",
    "bedding": "bedding",
    "food": "custom",  # no direct analogue in the new taxonomy
    "water": "water",
    "trail": "travel_corridor",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------
# Pydantic payloads
# --------------------------------------------------------------------


class _LatLngXYMixin(BaseModel):
    """Shared range checks for lat/lng/x/y on every payload variant.

    Keeps the validators in one place so create / update paths run
    the same coercion + bounds checks. Uses `check_fields=False` so
    each subclass can choose which subset of fields it actually
    declares.
    """

    @field_validator("latitude", check_fields=False)
    @classmethod
    def _check_lat(cls, v):
        if v is None:
            return v
        try:
            return validate_latitude(v)
        except GeoValidationError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("longitude", check_fields=False)
    @classmethod
    def _check_lng(cls, v):
        if v is None:
            return v
        try:
            return validate_longitude(v)
        except GeoValidationError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("x", "y", check_fields=False)
    @classmethod
    def _check_xy(cls, v):
        if v is None:
            return v
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise ValueError("x / y must be a number")
        if v != v or v in (float("inf"), float("-inf")):  # NaN / Inf
            raise ValueError("x / y must be a finite number")
        return float(v)

    @field_validator("confidence", check_fields=False)
    @classmethod
    def _check_confidence(cls, v):
        if v is None:
            return v
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise ValueError("confidence must be a number")
        f = float(v)
        if f != f or f in (float("inf"), float("-inf")):
            raise ValueError("confidence must be a finite number")
        if f < 0.0 or f > 1.0:
            raise ValueError("confidence must be between 0 and 1")
        return f


class AnalysisOverlayItemCreate(_LatLngXYMixin):
    """Payload for creating a single overlay item (POST body shape)."""

    item_id: Optional[str] = Field(default=None, min_length=4, max_length=64)
    # hunt_id is path-injected by the router — same pattern as
    # HuntLocationAssetCreate.
    hunt_id: Optional[str] = Field(default=None, max_length=128)
    analysis_id: Optional[str] = Field(default=None, max_length=128)
    saved_map_image_id: Optional[str] = Field(default=None, max_length=128)

    type: AnalysisOverlayItemType
    label: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    x: Optional[float] = None
    y: Optional[float] = None

    coordinate_source: CoordinateSource

    confidence: Optional[float] = None
    source_asset_id: Optional[str] = Field(default=None, max_length=128)

    @field_validator("label")
    @classmethod
    def _check_label(cls, v: str) -> str:
        v2 = v.strip()
        if not v2:
            raise ValueError("label must not be blank")
        return v2

    @model_validator(mode="after")
    def _check_invariants(self):
        # 1. user_provided MUST have a sourceAssetId.
        if self.coordinate_source == "user_provided" and not self.source_asset_id:
            raise ValueError(
                "coordinate_source='user_provided' requires source_asset_id"
            )

        # 2. pixel_only MUST NOT carry fabricated lat/lng.
        if self.coordinate_source == "pixel_only" and (
            self.latitude is not None or self.longitude is not None
        ):
            raise ValueError(
                "coordinate_source='pixel_only' must not include latitude/longitude"
            )

        # 3. If lat is set, lng must also be set, and vice versa —
        # half a coordinate is never useful.
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError(
                "latitude and longitude must be supplied together (or both omitted)"
            )

        return self


class AnalysisOverlayItemUpdate(_LatLngXYMixin):
    """Partial-update payload — only fields present are written."""

    type: Optional[AnalysisOverlayItemType] = None
    label: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    x: Optional[float] = None
    y: Optional[float] = None

    coordinate_source: Optional[CoordinateSource] = None
    confidence: Optional[float] = None

    saved_map_image_id: Optional[str] = Field(default=None, max_length=128)
    source_asset_id: Optional[str] = Field(default=None, max_length=128)

    @field_validator("label")
    @classmethod
    def _check_label(cls, v):
        if v is None:
            return v
        v2 = v.strip()
        if not v2:
            raise ValueError("label must not be blank")
        return v2


class AnalysisOverlayItem(BaseModel):
    """Canonical persisted shape returned by the API."""

    item_id: str
    user_id: str
    hunt_id: str
    analysis_id: Optional[str] = None
    saved_map_image_id: Optional[str] = None

    type: AnalysisOverlayItemType
    label: str
    description: Optional[str] = None

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    x: Optional[float] = None
    y: Optional[float] = None

    coordinate_source: CoordinateSource
    confidence: Optional[float] = None
    source_asset_id: Optional[str] = None

    created_at: str
    updated_at: str

    @classmethod
    def new_from_create(
        cls, *, user_id: str, payload: AnalysisOverlayItemCreate
    ) -> "AnalysisOverlayItem":
        if not payload.hunt_id:
            raise ValueError("hunt_id must be set before persistence")
        now = _now_iso()
        return cls(
            item_id=payload.item_id or f"aoi_{uuid.uuid4().hex}",
            user_id=user_id,
            hunt_id=payload.hunt_id,
            analysis_id=payload.analysis_id,
            saved_map_image_id=payload.saved_map_image_id,
            type=payload.type,
            label=payload.label,
            description=payload.description,
            latitude=payload.latitude,
            longitude=payload.longitude,
            x=payload.x,
            y=payload.y,
            coordinate_source=payload.coordinate_source,
            confidence=payload.confidence,
            source_asset_id=payload.source_asset_id,
            created_at=now,
            updated_at=now,
        )


def overlay_item_doc_to_dict(doc: Optional[dict]) -> Optional[dict]:
    """Strip Mongo `_id` and normalise datetimes."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    for key in ("created_at", "updated_at"):
        v = out.get(key)
        if isinstance(v, datetime):
            out[key] = v.isoformat()
    return out


def map_legacy_overlay_type(legacy_type_id: str) -> AnalysisOverlayItemType:
    """Translate a legacy overlay slug (overlay_taxonomy.py) to the
    new AnalysisOverlayItemType. Unknown slugs map to `custom`.

    Surfacing this as a dedicated function keeps the migration story
    explicit — callers that mirror legacy `hunts.overlays[]` into the
    new schema have a single line to call.
    """
    return LEGACY_OVERLAY_TYPE_MAP.get(legacy_type_id, "custom")


__all__ = [
    "ANALYSIS_OVERLAY_ITEM_TYPES",
    "AnalysisOverlayItemType",
    "COORDINATE_SOURCES",
    "CoordinateSource",
    "LEGACY_OVERLAY_TYPE_MAP",
    "AnalysisOverlayItem",
    "AnalysisOverlayItemCreate",
    "AnalysisOverlayItemUpdate",
    "overlay_item_doc_to_dict",
    "map_legacy_overlay_type",
]
