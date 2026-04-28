"""Raven Scout — Shared geospatial validation helpers.

Single source of truth for latitude/longitude validation across the
backend (Pydantic models, hunt asset router, saved map image router,
and future overlay alignment code).

Why this lives in its own module:
  * The taxonomy of "what counts as a valid GPS coordinate" is shared
    between Hunt Location Assets (user-provided pins) and Saved Map
    Image bounds (corner coordinates). Centralising it keeps the rules
    in lock-step.
  * Pydantic v2 field validators import these helpers so the same
    range checks run at the API edge and inside model construction.

Rules:
  * Latitude  ∈ [-90, 90]
  * Longitude ∈ [-180, 180]
  * Both must be finite floats (no NaN / Inf).
  * Bounding boxes for saved map images additionally enforce
    north > south, and a "normalised" west/east relation (we accept
    east < west to permit antimeridian-crossing rectangles, but
    flag a degenerate equality).
"""
from __future__ import annotations

import math
from typing import Tuple


class GeoValidationError(ValueError):
    """Raised by validators when a coordinate fails range / sanity checks."""

    pass


# --------------------------------------------------------------------
# Scalar coordinate validation
# --------------------------------------------------------------------

def _coerce_finite_float(value, *, field: str) -> float:
    """Cast `value` to float and reject NaN / Inf.

    Pydantic will already coerce ints to floats; this function exists
    so that callers outside Pydantic (e.g. ad-hoc validators in tests
    or in mongo write-paths) get the same semantics.
    """
    if value is None:
        raise GeoValidationError(f"{field} is required")
    if isinstance(value, bool):
        # bool is a subclass of int in Python — never allow it here.
        raise GeoValidationError(f"{field} must be a number, got bool")
    if not isinstance(value, (int, float)):
        raise GeoValidationError(f"{field} must be a number")
    f = float(value)
    if math.isnan(f) or math.isinf(f):
        raise GeoValidationError(f"{field} must be a finite number")
    return f


def validate_latitude(value, *, field: str = "latitude") -> float:
    """Return the float latitude or raise GeoValidationError.

    Range: -90 ≤ latitude ≤ 90.
    """
    f = _coerce_finite_float(value, field=field)
    if f < -90.0 or f > 90.0:
        raise GeoValidationError(
            f"{field} must be between -90 and 90 (got {f})"
        )
    return f


def validate_longitude(value, *, field: str = "longitude") -> float:
    """Return the float longitude or raise GeoValidationError.

    Range: -180 ≤ longitude ≤ 180.
    """
    f = _coerce_finite_float(value, field=field)
    if f < -180.0 or f > 180.0:
        raise GeoValidationError(
            f"{field} must be between -180 and 180 (got {f})"
        )
    return f


def validate_lat_lng(
    latitude,
    longitude,
    *,
    lat_field: str = "latitude",
    lng_field: str = "longitude",
) -> Tuple[float, float]:
    """Validate a (lat, lng) pair, returning the coerced floats."""
    return (
        validate_latitude(latitude, field=lat_field),
        validate_longitude(longitude, field=lng_field),
    )


# --------------------------------------------------------------------
# Bounding box validation (used by SavedMapImage geo metadata)
# --------------------------------------------------------------------

def validate_bounds(
    *,
    north_lat: float,
    south_lat: float,
    west_lng: float,
    east_lng: float,
) -> None:
    """Validate a north/south/east/west bounding box.

    * Each corner must satisfy the lat/lng range checks.
    * north_lat must be strictly greater than south_lat.
    * west_lng must not equal east_lng (zero-width box is invalid).
      We allow east < west to support antimeridian-crossing boxes
      (e.g. west=170, east=-170).
    """
    n = validate_latitude(north_lat, field="northLat")
    s = validate_latitude(south_lat, field="southLat")
    w = validate_longitude(west_lng, field="westLng")
    e = validate_longitude(east_lng, field="eastLng")

    if n <= s:
        raise GeoValidationError(
            f"northLat ({n}) must be greater than southLat ({s})"
        )
    if w == e:
        raise GeoValidationError(
            f"westLng and eastLng must differ (got {w})"
        )


__all__ = [
    "GeoValidationError",
    "validate_latitude",
    "validate_longitude",
    "validate_lat_lng",
    "validate_bounds",
]
