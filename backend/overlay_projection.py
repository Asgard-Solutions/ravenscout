"""Raven Scout — backend GPS ↔ saved-image pixel projection.

Python mirror of /app/frontend/src/utils/geoProjection.ts. Used by the
overlay-item normalizer (Task 8) when the saved map image supports
geo placement and we need to derive missing pixel coordinates from
GPS (or vice versa).

Same contract as the TS module:
  * north-up image, no rotation
  * antimeridian-crossing rectangles (eastLng < westLng) are rejected
  * `clamp` only clamps the OUTPUT into the valid range; invalid
    INPUTS still raise.
"""
from __future__ import annotations

import math
from typing import Optional, Tuple

from geo_validation import (
    GeoValidationError,
    validate_latitude,
    validate_longitude,
)


class OverlayProjectionError(ValueError):
    """Raised on bad input to the projection helpers."""


def _assert_finite_number(value, *, field: str) -> float:
    if value is None:
        raise OverlayProjectionError(f"{field} is required")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise OverlayProjectionError(f"{field} must be a number")
    f = float(value)
    if math.isnan(f) or math.isinf(f):
        raise OverlayProjectionError(f"{field} must be a finite number")
    return f


def _assert_dims(width, height) -> Tuple[float, float]:
    w = _assert_finite_number(width, field="originalWidth")
    h = _assert_finite_number(height, field="originalHeight")
    if w <= 0 or h <= 0:
        raise OverlayProjectionError(
            f"originalWidth / originalHeight must be > 0 (got {w}x{h})"
        )
    return w, h


def _assert_bounds(*, north_lat, south_lat, west_lng, east_lng):
    try:
        n = validate_latitude(north_lat, field="northLat")
        s = validate_latitude(south_lat, field="southLat")
        w = validate_longitude(west_lng, field="westLng")
        e = validate_longitude(east_lng, field="eastLng")
    except GeoValidationError as exc:
        raise OverlayProjectionError(str(exc)) from exc
    if n <= s:
        raise OverlayProjectionError(
            f"northLat ({n}) must be greater than southLat ({s})"
        )
    if w >= e:
        raise OverlayProjectionError(
            f"eastLng ({e}) must be greater than westLng ({w}); "
            "antimeridian-crossing rectangles are not supported"
        )
    return n, s, w, e


def _clamp(value: float, lo: float, hi: float) -> float:
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


def lat_lng_to_pixel(
    *,
    latitude: float,
    longitude: float,
    north_lat: float,
    south_lat: float,
    west_lng: float,
    east_lng: float,
    original_width: float,
    original_height: float,
    clamp: bool = False,
) -> Tuple[float, float]:
    """Convert lat/lng to original-image (x, y) pixel coordinates.

    Mirrors latLngToPixel() in geoProjection.ts.
    """
    try:
        lat = validate_latitude(latitude)
        lng = validate_longitude(longitude)
    except GeoValidationError as exc:
        raise OverlayProjectionError(str(exc)) from exc
    n, s, w, e = _assert_bounds(
        north_lat=north_lat,
        south_lat=south_lat,
        west_lng=west_lng,
        east_lng=east_lng,
    )
    width, height = _assert_dims(original_width, original_height)

    x = ((lng - w) / (e - w)) * width
    y = ((n - lat) / (n - s)) * height
    if clamp:
        x = _clamp(x, 0, width)
        y = _clamp(y, 0, height)
    return x, y


def pixel_to_lat_lng(
    *,
    x: float,
    y: float,
    north_lat: float,
    south_lat: float,
    west_lng: float,
    east_lng: float,
    original_width: float,
    original_height: float,
    clamp: bool = False,
) -> Tuple[float, float]:
    """Convert (x, y) pixel coordinates to lat/lng.

    Mirrors pixelToLatLng() in geoProjection.ts.
    """
    fx = _assert_finite_number(x, field="x")
    fy = _assert_finite_number(y, field="y")
    n, s, w, e = _assert_bounds(
        north_lat=north_lat,
        south_lat=south_lat,
        west_lng=west_lng,
        east_lng=east_lng,
    )
    width, height = _assert_dims(original_width, original_height)

    lng = w + (fx / width) * (e - w)
    lat = n - (fy / height) * (n - s)
    if clamp:
        lat = _clamp(lat, s, n)
        lng = _clamp(lng, w, e)
    return lat, lng


__all__ = [
    "OverlayProjectionError",
    "lat_lng_to_pixel",
    "pixel_to_lat_lng",
]
