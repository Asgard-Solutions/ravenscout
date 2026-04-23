"""Raven Scout — GPS-based region resolution for prompt packs.

Broad, maintainable US hunting regions. Deliberately coarse — the
goal is reliable classification into a small set of buckets that map
to meaningful tactical differences, NOT county-level precision.

Canonical region ids:
    south_texas       Brush Country / RGV / San Antonio south
    east_texas        Piney Woods / NE Texas
    southeast_us      AR, LA, MS, AL, GA, FL, SC, NC, TN, KY
    mountain_west     CO, UT, NM, AZ, WY, MT, ID, NV, interior PNW
    plains            Great Plains — E CO/WY/MT, W KS/NE/ND/SD, OK & TX panhandle
    midwest           IA, IL, IN, OH, MO, WI, MI, MN, E Dakotas, N KS/NE
    generic_default   fallback when nothing matches

Resolution priority (used by `resolve_effective_region`):
    1. manual override (if provided and normalizes to a canonical id)
    2. hunt GPS coordinates
    3. map centroid coordinates
    4. generic_default

Each layer is recorded in `regionResolutionSource`:
    "manual_override" | "gps" | "map_centroid" | "default"
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Mapping, Optional, Tuple

# ---------- canonical labels ----------

CANONICAL_REGIONS: Mapping[str, str] = {
    "south_texas":    "South Texas",
    "east_texas":     "East Texas",
    "southeast_us":   "Southeast US",
    "mountain_west":  "Mountain West",
    "plains":         "Great Plains",
    "midwest":        "Midwest",
    "generic_default": "Generic (unspecified region)",
}

GENERIC_DEFAULT = "generic_default"


def get_region_label(region_id: Optional[str]) -> str:
    if not region_id:
        return CANONICAL_REGIONS[GENERIC_DEFAULT]
    return CANONICAL_REGIONS.get(region_id, CANONICAL_REGIONS[GENERIC_DEFAULT])


# ---------- GPS bounding-box classifier ----------

BBoxFn = Callable[[float, float], bool]


@dataclass(frozen=True)
class _Box:
    region_id: str
    match: BBoxFn


# Priority-ordered. First match wins. Bounding boxes are intentionally
# broad; points that fall outside all boxes resolve to generic_default.
_BOXES: List[_Box] = [
    # South Texas — Brush Country / RGV / San Antonio south.
    _Box("south_texas",   lambda lat, lon: 26.0 <= lat <  29.6 and -100.0 <= lon <= -97.0),
    # East Texas — Piney Woods + NE Texas.
    _Box("east_texas",    lambda lat, lon: 29.0 <= lat <= 33.8 and  -96.5 <= lon <= -94.0),
    # Southeast US — East of -94 W (east of TX/AR border), south of ~37 N (OH-R river / KY).
    _Box("southeast_us",  lambda lat, lon: 24.0 <= lat <= 37.5 and  -94.0 <= lon <= -75.0),
    # Mountain West — everything west of -104 W down to the coast ranges.
    _Box("mountain_west", lambda lat, lon: 31.0 <= lat <= 49.5 and -125.0 <= lon <  -104.0),
    # Great Plains — high prairie band east of the Rockies.
    _Box("plains",        lambda lat, lon: 32.0 <= lat <= 49.5 and -104.0 <= lon <   -98.0),
    # Midwest — remaining north-central band.
    _Box("midwest",       lambda lat, lon: 37.0 <= lat <= 49.5 and  -98.0 <  lon <=  -80.0),
]


def resolve_region_from_coordinates(
    latitude: Optional[float], longitude: Optional[float],
) -> str:
    """Return the canonical region id for a lat/lon pair.

    Returns ``generic_default`` when coordinates are missing, outside
    the continental-US bounding boxes, or otherwise unclassifiable.
    """
    if latitude is None or longitude is None:
        return GENERIC_DEFAULT
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return GENERIC_DEFAULT
    if lat != lat or lon != lon:  # NaN guard
        return GENERIC_DEFAULT
    for box in _BOXES:
        if box.match(lat, lon):
            return box.region_id
    return GENERIC_DEFAULT


# ---------- freeform override normalization ----------

# Pre-normalized alias tokens → canonical region id. Keys are stored
# as the lowercase / whitespace-collapsed / punctuation-stripped form
# of common user inputs.
_ALIAS_MAP: Mapping[str, str] = {
    # South Texas
    "south texas": "south_texas",
    "s texas": "south_texas",
    "brush country": "south_texas",
    "south tx": "south_texas",
    "stx": "south_texas",
    "rio grande valley": "south_texas",
    "rgv": "south_texas",
    "texas hill country": "south_texas",  # hill country → south_texas bucket
    "hill country": "south_texas",

    # East Texas
    "east texas": "east_texas",
    "e texas": "east_texas",
    "east tx": "east_texas",
    "etx": "east_texas",
    "piney woods": "east_texas",

    # Southeast US
    "southeast": "southeast_us",
    "southeastern": "southeast_us",
    "southeast us": "southeast_us",
    "southeastern us": "southeast_us",
    "southeastern united states": "southeast_us",
    "deep south": "southeast_us",

    # Mountain West
    "mountain west": "mountain_west",
    "rocky mountains": "mountain_west",
    "rockies": "mountain_west",
    "intermountain west": "mountain_west",
    "rocky mountain region": "mountain_west",

    # Plains
    "plains": "plains",
    "great plains": "plains",
    "high plains": "plains",
    "prairie": "plains",
    "prairies": "plains",

    # Midwest
    "midwest": "midwest",
    "mid west": "midwest",
    "mid-west": "midwest",
    "midwestern": "midwest",
    "midwestern us": "midwest",
    "upper midwest": "midwest",
    "corn belt": "midwest",

    # Explicit canonical pass-through (from admin / API inputs)
    "south_texas": "south_texas",
    "east_texas": "east_texas",
    "southeast_us": "southeast_us",
    "mountain_west": "mountain_west",
    "generic_default": "generic_default",
}


def _norm(s: str) -> str:
    if not s:
        return ""
    s = s.strip().lower()
    s = s.replace("-", " ").replace("_", " ").replace("'", "").replace(".", "")
    return " ".join(s.split())


def normalize_region_override(region_input: Optional[str]) -> Optional[str]:
    """Return a canonical region id for a freeform override string.

    Returns None for empty / unrecognized inputs; the caller decides
    whether to fall back to GPS, map centroid, or generic_default.
    """
    if not region_input or not isinstance(region_input, str):
        return None
    key = _norm(region_input)
    if not key:
        return None
    if key in _ALIAS_MAP:
        return _ALIAS_MAP[key]
    # Also try canonical id with underscores intact.
    us = key.replace(" ", "_")
    if us in _ALIAS_MAP:
        return _ALIAS_MAP[us]
    return None


# ---------- effective region resolution ----------


@dataclass(frozen=True)
class RegionResolution:
    region_id: str
    region_label: str
    source: str                 # "manual_override" | "gps" | "map_centroid" | "default"
    latitude: Optional[float]
    longitude: Optional[float]

    def as_dict(self) -> dict:
        return {
            "resolvedRegionId":      self.region_id,
            "resolvedRegionLabel":   self.region_label,
            "regionResolutionSource": self.source,
            "latitude":              self.latitude,
            "longitude":             self.longitude,
        }


def resolve_effective_region(
    gps_lat: Optional[float] = None,
    gps_lon: Optional[float] = None,
    map_centroid: Optional[Tuple[float, float]] = None,
    manual_override: Optional[str] = None,
) -> RegionResolution:
    """Resolve the region actually used by the prompt builder.

    PRECEDENCE (safety-critical — read before editing):

        1. `manual_override`     — EXPLICIT override flow only
        2. `gps_lat` / `gps_lon` — PRIMARY / default auto-resolution
        3. `map_centroid`        — fallback when no GPS
        4. `generic_default`

    Design intent:
        * `manual_override` is reserved for INTENTIONAL override flows
          (admin tools, debug screens, a "my region is actually X"
          correction UI, test fixtures). It is NOT meant to carry a
          user's freeform "where I'm hunting" note — that kind of
          casual text should live on its own display-only field and
          MUST NOT be wired into this argument, because a stray
          alias match (e.g. "Midwest" in a note) would silently
          override the user's actual GPS fix. The caller is
          responsible for making sure only explicit-override input
          reaches this parameter.
        * `gps_lat`/`gps_lon` is the normal, default path. If the
          caller has GPS and no explicit override, resolution is
          GPS-driven end-to-end.
        * `map_centroid` fills in only when both of the above are
          absent — useful when a user pans the map but GPS is off.

    Failure handling:
        * An unrecognized override string transparently falls through
          to the GPS path (it never blocks a valid GPS resolution).
        * Unclassifiable coordinates fall through to the next layer.
        * Everything missing → `generic_default`.

    Returns:
        RegionResolution with a fully-populated `.source` field:
        `"manual_override"` | `"gps"` | `"map_centroid"` | `"default"`.
    """
    # 1) manual override — EXPLICIT flow only.
    if manual_override:
        overridden = normalize_region_override(manual_override)
        if overridden:
            return RegionResolution(
                region_id=overridden,
                region_label=get_region_label(overridden),
                source="manual_override",
                latitude=gps_lat,
                longitude=gps_lon,
            )

    # 2) GPS — normal / default path.
    if gps_lat is not None and gps_lon is not None:
        rid = resolve_region_from_coordinates(gps_lat, gps_lon)
        if rid != GENERIC_DEFAULT:
            return RegionResolution(
                region_id=rid,
                region_label=get_region_label(rid),
                source="gps",
                latitude=gps_lat,
                longitude=gps_lon,
            )

    # 3) map centroid — fallback when GPS is off.
    if map_centroid is not None:
        try:
            c_lat, c_lon = float(map_centroid[0]), float(map_centroid[1])
            rid = resolve_region_from_coordinates(c_lat, c_lon)
            if rid != GENERIC_DEFAULT:
                return RegionResolution(
                    region_id=rid,
                    region_label=get_region_label(rid),
                    source="map_centroid",
                    latitude=c_lat,
                    longitude=c_lon,
                )
        except (TypeError, ValueError, IndexError):
            pass

    # 4) default — carry forward GPS if we had it so persistence can
    # note the raw coordinates even when classification failed.
    return RegionResolution(
        region_id=GENERIC_DEFAULT,
        region_label=get_region_label(GENERIC_DEFAULT),
        source="default",
        latitude=gps_lat,
        longitude=gps_lon,
    )
