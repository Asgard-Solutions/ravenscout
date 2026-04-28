"""SavedMapImage — geospatial metadata for app-saved map images.

A Raven Scout hunt analysis is rendered against a saved map image
rather than a live map. To place GPS markers correctly on top of
that image we need to know what real-world rectangle the image
covers (north/south/east/west bounds), what the camera state was
when it was captured (center, zoom, bearing, pitch — only meaningful
for MapTiler-generated images), and the image's pixel dimensions so
lat/lng → pixel projection has a stable basis.

Persistence:
  * Stored in Mongo collection `saved_map_images`.
  * Compound unique index on (user_id, image_id).
  * `image_id` is the same imageId used in the MediaAsset records on
    the frontend (src/media/types.ts) — that's the join key.

Backward compatibility:
  * Existing saved hunt images that have no entry in this collection
    are treated as `supportsGeoPlacement = false` by readers. This
    model never silently invents bounds for legacy images.
  * When `supports_geo_placement` is True, a full bounding box +
    pixel dimensions is required.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from geo_validation import (
    GeoValidationError,
    validate_bounds,
    validate_latitude,
    validate_longitude,
)

SAVED_MAP_IMAGE_SOURCES = ("maptiler", "upload")
SavedMapImageSource = Literal["maptiler", "upload"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class _GeoFieldsMixin(BaseModel):
    """Shared lat/lng field validators for create + update payloads."""

    @field_validator("north_lat", "south_lat", "center_lat", check_fields=False)
    @classmethod
    def _check_lat_field(cls, v):
        if v is None:
            return v
        try:
            return validate_latitude(v)
        except GeoValidationError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("west_lng", "east_lng", "center_lng", check_fields=False)
    @classmethod
    def _check_lng_field(cls, v):
        if v is None:
            return v
        try:
            return validate_longitude(v)
        except GeoValidationError as exc:
            raise ValueError(str(exc)) from exc


class SavedMapImageCreate(_GeoFieldsMixin):
    """Payload to register / replace metadata for a saved map image.

    `image_id` mirrors the MediaAsset.imageId on the frontend.
    """

    image_id: str = Field(..., min_length=1, max_length=128)
    hunt_id: Optional[str] = Field(default=None, max_length=128)

    image_url: Optional[str] = Field(default=None, max_length=2048)

    original_width: Optional[int] = Field(default=None, ge=1, le=20000)
    original_height: Optional[int] = Field(default=None, ge=1, le=20000)

    north_lat: Optional[float] = None
    south_lat: Optional[float] = None
    west_lng: Optional[float] = None
    east_lng: Optional[float] = None

    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    zoom: Optional[float] = Field(default=None, ge=0, le=24)
    bearing: Optional[float] = Field(default=None, ge=-360, le=360)
    pitch: Optional[float] = Field(default=None, ge=0, le=85)

    source: SavedMapImageSource = "upload"
    style: Optional[str] = Field(default=None, max_length=120)

    supports_geo_placement: bool = False

    @model_validator(mode="after")
    def _check_geo_placement_requirements(self):
        """When supportsGeoPlacement = True, demand a full geo basis.

        We require:
          * pixel dimensions (originalWidth + originalHeight)
          * a complete N/S/E/W bounding box (and the box must be
            geometrically valid)
        Center / zoom / bearing / pitch remain optional — they are
        useful for re-creating a MapTiler render but unnecessary for
        a static uploaded image with known bounds.
        """
        if not self.supports_geo_placement:
            return self

        missing: list[str] = []
        if self.original_width is None:
            missing.append("original_width")
        if self.original_height is None:
            missing.append("original_height")
        for fname, fval in (
            ("north_lat", self.north_lat),
            ("south_lat", self.south_lat),
            ("west_lng", self.west_lng),
            ("east_lng", self.east_lng),
        ):
            if fval is None:
                missing.append(fname)

        if missing:
            raise ValueError(
                "supports_geo_placement=True requires: " + ", ".join(missing)
            )

        try:
            validate_bounds(
                north_lat=self.north_lat,  # type: ignore[arg-type]
                south_lat=self.south_lat,  # type: ignore[arg-type]
                west_lng=self.west_lng,    # type: ignore[arg-type]
                east_lng=self.east_lng,    # type: ignore[arg-type]
            )
        except GeoValidationError as exc:
            raise ValueError(str(exc)) from exc

        return self


class SavedMapImageUpdate(_GeoFieldsMixin):
    """Partial update — only supplied fields are written.

    NOTE: callers that want to enable geo placement on an existing
    record should re-POST the full create shape so the cross-field
    invariants run.
    """

    hunt_id: Optional[str] = Field(default=None, max_length=128)
    image_url: Optional[str] = Field(default=None, max_length=2048)

    original_width: Optional[int] = Field(default=None, ge=1, le=20000)
    original_height: Optional[int] = Field(default=None, ge=1, le=20000)

    north_lat: Optional[float] = None
    south_lat: Optional[float] = None
    west_lng: Optional[float] = None
    east_lng: Optional[float] = None

    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    zoom: Optional[float] = Field(default=None, ge=0, le=24)
    bearing: Optional[float] = Field(default=None, ge=-360, le=360)
    pitch: Optional[float] = Field(default=None, ge=0, le=85)

    source: Optional[SavedMapImageSource] = None
    style: Optional[str] = Field(default=None, max_length=120)

    supports_geo_placement: Optional[bool] = None


class SavedMapImage(BaseModel):
    """Canonical persisted shape returned by the API."""

    image_id: str
    user_id: str
    hunt_id: Optional[str] = None

    image_url: Optional[str] = None

    original_width: Optional[int] = None
    original_height: Optional[int] = None

    north_lat: Optional[float] = None
    south_lat: Optional[float] = None
    west_lng: Optional[float] = None
    east_lng: Optional[float] = None

    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    zoom: Optional[float] = None
    bearing: Optional[float] = None
    pitch: Optional[float] = None

    source: SavedMapImageSource = "upload"
    style: Optional[str] = None

    supports_geo_placement: bool = False

    created_at: str
    updated_at: str

    @classmethod
    def new_from_create(
        cls, *, user_id: str, payload: SavedMapImageCreate
    ) -> "SavedMapImage":
        now = _now_iso()
        return cls(
            image_id=payload.image_id,
            user_id=user_id,
            hunt_id=payload.hunt_id,
            image_url=payload.image_url,
            original_width=payload.original_width,
            original_height=payload.original_height,
            north_lat=payload.north_lat,
            south_lat=payload.south_lat,
            west_lng=payload.west_lng,
            east_lng=payload.east_lng,
            center_lat=payload.center_lat,
            center_lng=payload.center_lng,
            zoom=payload.zoom,
            bearing=payload.bearing,
            pitch=payload.pitch,
            source=payload.source,
            style=payload.style,
            supports_geo_placement=payload.supports_geo_placement,
            created_at=now,
            updated_at=now,
        )


def saved_map_image_doc_to_dict(doc: Optional[dict]) -> Optional[dict]:
    """Strip `_id`, normalise datetimes, and apply backward-compatible
    defaults to a Mongo doc.

    Legacy / partial records (no `supports_geo_placement` field, no
    `source` field) are coerced into the safe default of
    `source='upload', supports_geo_placement=False` so the read path
    never crashes on older data.
    """
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    for key in ("created_at", "updated_at"):
        v = out.get(key)
        if isinstance(v, datetime):
            out[key] = v.isoformat()
    out.setdefault("supports_geo_placement", False)
    out.setdefault("source", "upload")
    return out


__all__ = [
    "SAVED_MAP_IMAGE_SOURCES",
    "SavedMapImageSource",
    "SavedMapImageCreate",
    "SavedMapImageUpdate",
    "SavedMapImage",
    "saved_map_image_doc_to_dict",
]
