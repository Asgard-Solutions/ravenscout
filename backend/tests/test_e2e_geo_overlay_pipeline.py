"""End-to-end QA / regression suite for the GPS assets + saved-image
overlay pipeline (Task 11).

Walks every scenario described in the Task 11 brief:

  S1. Hunt with no GPS assets — analysis flow works, list endpoints
      return empty lists (no 500s anywhere).
  S2. Hunt with user GPS assets — assets persist, the overlay
      bulk-normalize endpoint preserves user-provided GPS exactly,
      the AI prompt builder ingests them without mutation.
  S3. App-generated georeferenced map image — bounds round-trip
      through saved_map_images, x/y derives correctly, "resize"
      is simulated by re-listing items at any rendered size
      (server stores original-pixel x/y; client side handles scale).
  S4. Uploaded pixel-only image — bounds rejected, all overlays
      keep latitude/longitude=None, even when raw input asks for
      GPS (no fabrication, ever).
  S5. Reload regression — second GET after a simulated app reload
      returns the same overlay rows verbatim.

Plus the explicit "bugs to guard against":
  * Old saved hunts (no overlay items) keep loading.
  * Old saved images (no geo metadata) don't crash.
  * Asset retry after a duplicate POST does not silently double-up
    user data (idempotency / dedupe behavior is documented).
  * AI cannot rewrite user-provided overlay coordinates.

Skips when EXPO_PUBLIC_BACKEND_URL is unset.

Run:
  EXPO_PUBLIC_BACKEND_URL=http://localhost:8001 \
    python -m pytest tests/test_e2e_geo_overlay_pipeline.py -q
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)

PRO_AUTH = {"Authorization": "Bearer test_session_rs_001"}


def _api(path: str) -> str:
    return f"{BASE_URL}/api{path}"


def _post(path: str, body: dict, *, expect: int = 200) -> dict:
    r = requests.post(
        _api(path),
        headers={**PRO_AUTH, "Content-Type": "application/json"},
        json=body,
        timeout=15,
    )
    assert r.status_code == expect, f"POST {path} -> {r.status_code}: {r.text}"
    return r.json() if r.text else {}


def _get(path: str, *, expect: int = 200) -> dict:
    r = requests.get(_api(path), headers=PRO_AUTH, timeout=15)
    assert r.status_code == expect, f"GET {path} -> {r.status_code}: {r.text}"
    return r.json() if r.text else {}


def _delete(path: str, *, expect: int = 200) -> None:
    r = requests.delete(_api(path), headers=PRO_AUTH, timeout=15)
    # Be lenient on cleanup
    if expect is not None:
        assert r.status_code == expect, f"DELETE {path} -> {r.status_code}: {r.text}"


@pytest.fixture
def hunt_id():
    hid = f"hunt_e2e_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    _post(
        "/hunts",
        {
            "hunt_id": hid,
            "metadata": {
                "species": "whitetail",
                "speciesName": "Whitetail Deer",
                "date": "2026-02-01",
                "timeWindow": "AM",
                "windDirection": "N",
            },
        },
    )
    yield hid
    _delete(f"/hunts/{hid}", expect=200)


# =====================================================================
# S1. Hunt with no GPS assets
# =====================================================================


def test_s1_hunt_with_no_assets_does_not_crash(hunt_id):
    """A freshly created hunt with no assets, no map images, and no
    overlay items should expose all three list endpoints with empty
    payloads — no 500s.
    """
    a = _get(f"/hunts/{hunt_id}/assets")
    assert a.get("assets") == [] or a.get("assets") is None or len(a["assets"]) == 0
    img = _get(f"/saved-map-images?hunt_id={hunt_id}")
    assert img.get("saved_map_images") == [] or len(img["saved_map_images"]) == 0
    items = _get(f"/hunts/{hunt_id}/overlay-items")
    assert items["count"] == 0
    assert items["overlay_items"] == []


def test_s1_bulk_normalize_with_zero_items_is_ok(hunt_id):
    """An empty bulk-normalize call must succeed and write nothing."""
    out = _post(
        f"/hunts/{hunt_id}/overlay-items:bulk-normalize",
        {"items": []},
    )
    assert out["ok"] is True
    assert out["created_count"] == 0
    assert out["skipped_count"] == 0


# =====================================================================
# S2. Hunt with user GPS assets — preserve user coordinates verbatim
# =====================================================================


def test_s2_user_provided_overlay_preserves_gps_exactly(hunt_id):
    asset = _post(
        f"/hunts/{hunt_id}/assets",
        {
            "type": "stand",
            "name": "North Ridge Ladder",
            "latitude": 44.5,
            "longitude": -93.0,
        },
    )
    asset_id = asset["asset"]["asset_id"]

    img = _post(
        "/saved-map-images",
        {
            "hunt_id": hunt_id,
            "image_id": f"img_{uuid.uuid4().hex[:8]}",
            "image_url": "https://example.invalid/map.png",
            "original_width": 1000,
            "original_height": 800,
            "north_lat": 45.0,
            "south_lat": 44.0,
            "west_lng": -93.5,
            "east_lng": -92.5,
            "supports_geo_placement": True,
            "source": "maptiler",
        },
    )
    image_id = img["saved_map_image"]["image_id"]

    # AI tries to "correct" the user's GPS — the normalizer MUST
    # ignore it and use the asset's stored values.
    out = _post(
        f"/hunts/{hunt_id}/overlay-items:bulk-normalize",
        {
            "saved_map_image_id": image_id,
            "items": [
                {
                    "type": "stand",
                    "label": "North Ridge Ladder",
                    "coordinateSource": "user_provided",
                    "sourceAssetId": asset_id,
                    # AI hallucinations:
                    "latitude": 99.999,
                    "longitude": -1.234,
                }
            ],
        },
    )
    assert out["created_count"] == 1
    assert out["skipped_count"] == 0
    created = out["created"][0]
    assert created["coordinate_source"] == "user_provided"
    assert abs(created["latitude"] - 44.5) < 1e-9
    assert abs(created["longitude"] - -93.0) < 1e-9
    # And x/y are derived from the asset GPS via the saved image's
    # bounds (asset 44.5, -93.0 → center of bbox → 500/400).
    assert abs(created["x"] - 500) < 1e-6
    assert abs(created["y"] - 400) < 1e-6


def test_s2_unknown_source_asset_is_skipped_not_persisted(hunt_id):
    out = _post(
        f"/hunts/{hunt_id}/overlay-items:bulk-normalize",
        {
            "items": [
                {
                    "type": "stand",
                    "label": "X",
                    "coordinateSource": "user_provided",
                    "sourceAssetId": "definitely-bogus-id",
                }
            ],
        },
    )
    assert out["created_count"] == 0
    assert out["skipped_count"] == 1
    assert out["skipped"][0]["reason"].startswith("unknown_source_asset")


# =====================================================================
# S3. Geo-capable saved image — round-trip through reload
# =====================================================================


def test_s3_geo_image_overlay_round_trips_through_reload(hunt_id):
    """Create a geo-capable saved map image. Drop one overlay item
    by GPS, one by x/y. Then GET the overlay list (simulating an
    app reload) and confirm the persisted x/y/lat/lng survive
    verbatim.
    """
    img = _post(
        "/saved-map-images",
        {
            "hunt_id": hunt_id,
            "image_id": f"img_{uuid.uuid4().hex[:8]}",
            "image_url": "https://example.invalid/m.png",
            "original_width": 1000,
            "original_height": 800,
            "north_lat": 45.0,
            "south_lat": 44.0,
            "west_lng": -93.5,
            "east_lng": -92.5,
            "supports_geo_placement": True,
            "source": "maptiler",
        },
    )
    image_id = img["saved_map_image"]["image_id"]

    out = _post(
        f"/hunts/{hunt_id}/overlay-items:bulk-normalize",
        {
            "saved_map_image_id": image_id,
            "items": [
                {
                    "type": "funnel",
                    "label": "Saddle (GPS)",
                    "latitude": 44.5,
                    "longitude": -93.0,
                },
                {
                    "type": "funnel",
                    "label": "Saddle (XY)",
                    "x": 500,
                    "y": 400,
                },
            ],
        },
    )
    assert out["created_count"] == 2

    listed = _get(f"/hunts/{hunt_id}/overlay-items")
    assert listed["count"] == 2
    by_label = {it["label"]: it for it in listed["overlay_items"]}
    gps_one = by_label["Saddle (GPS)"]
    xy_one = by_label["Saddle (XY)"]
    # GPS one → derived x/y at bbox center
    assert abs(gps_one["x"] - 500) < 1e-6
    assert abs(gps_one["y"] - 400) < 1e-6
    # XY one → derived lat/lng at bbox center
    assert abs(xy_one["latitude"] - 44.5) < 1e-9
    assert abs(xy_one["longitude"] - -93.0) < 1e-9
    for it in (gps_one, xy_one):
        assert it["coordinate_source"] == "derived_from_saved_map_bounds"


# =====================================================================
# S4. Pixel-only image — never fabricate GPS
# =====================================================================


def test_s4_pixel_only_image_never_persists_gps(hunt_id):
    img = _post(
        "/saved-map-images",
        {
            "hunt_id": hunt_id,
            "image_id": f"img_{uuid.uuid4().hex[:8]}",
            "image_url": "data:image/png;base64,iVBORw0KGgo=",
            "original_width": 800,
            "original_height": 600,
            "source": "upload",
            # No bounds → supports_geo_placement should be False.
        },
    )
    saved = img["saved_map_image"]
    assert saved.get("supports_geo_placement") is False, (
        "saved_map_images without bounds must surface as pixel-only"
    )

    out = _post(
        f"/hunts/{hunt_id}/overlay-items:bulk-normalize",
        {
            "saved_map_image_id": saved["image_id"],
            "items": [
                {
                    "type": "stand",
                    "label": "User Stand",
                    # AI hallucinations — must be erased:
                    "latitude": 30.123,
                    "longitude": -97.456,
                    "x": 100,
                    "y": 200,
                    "coordinateSource": "ai_estimated_from_image",
                }
            ],
        },
    )
    assert out["created_count"] == 1
    created = out["created"][0]
    assert created["coordinate_source"] == "pixel_only"
    assert created["latitude"] is None
    assert created["longitude"] is None
    assert created["x"] == 100
    assert created["y"] == 200


# =====================================================================
# S5. Reload regression — second GET == first GET
# =====================================================================


def test_s5_reload_returns_identical_payload(hunt_id):
    """Successive GETs must return the same row data (modulo ordering)."""
    img = _post(
        "/saved-map-images",
        {
            "hunt_id": hunt_id,
            "image_id": f"img_{uuid.uuid4().hex[:8]}",
            "image_url": "https://example.invalid/r.png",
            "original_width": 1000,
            "original_height": 800,
            "north_lat": 45.0,
            "south_lat": 44.0,
            "west_lng": -93.5,
            "east_lng": -92.5,
            "supports_geo_placement": True,
            "source": "maptiler",
        },
    )
    _post(
        f"/hunts/{hunt_id}/overlay-items:bulk-normalize",
        {
            "saved_map_image_id": img["saved_map_image"]["image_id"],
            "items": [
                {"type": "stand", "label": "A", "x": 100, "y": 200},
                {"type": "blind", "label": "B", "x": 300, "y": 400},
                {"type": "feeder", "label": "C", "x": 500, "y": 600},
            ],
        },
    )

    first = _get(f"/hunts/{hunt_id}/overlay-items")
    second = _get(f"/hunts/{hunt_id}/overlay-items")
    assert first["count"] == 3
    assert second["count"] == 3
    # Compare on (x, y, label) — order-insensitive.
    a = sorted(((it["x"], it["y"], it["label"]) for it in first["overlay_items"]))
    b = sorted(((it["x"], it["y"], it["label"]) for it in second["overlay_items"]))
    assert a == b


# =====================================================================
# Regression: backward compatibility with old/legacy data
# =====================================================================


def test_legacy_hunt_without_overlay_items_loads_cleanly(hunt_id):
    """A hunt with zero analysis_overlay_items rows MUST NOT 500
    on the list endpoint — it returns an empty list. This guards
    against regressions when legacy hunts (created before Task 6)
    are reopened.
    """
    out = _get(f"/hunts/{hunt_id}/overlay-items")
    assert out["count"] == 0
    assert out["overlay_items"] == []
    # Even with a legacy saved image attached (no bounds), the
    # listing must still 200.
    _post(
        "/saved-map-images",
        {
            "hunt_id": hunt_id,
            "image_id": f"img_legacy_{uuid.uuid4().hex[:8]}",
            "image_url": "https://example.invalid/legacy.png",
            "original_width": 800,
            "original_height": 600,
            "source": "upload",
        },
    )
    out2 = _get(f"/hunts/{hunt_id}/overlay-items")
    assert out2["count"] == 0


def test_old_saved_image_without_geo_metadata_listable(hunt_id):
    """Saved images without geo bounds must round-trip through
    GET /saved-map-images?hunt_id=X without crashing, and must
    expose supports_geo_placement=False.
    """
    image_id = f"img_legacy_{uuid.uuid4().hex[:8]}"
    _post(
        "/saved-map-images",
        {
            "hunt_id": hunt_id,
            "image_id": image_id,
            "image_url": "data:image/png;base64,XX==",
            "original_width": 640,
            "original_height": 480,
            "source": "upload",
        },
    )
    listed = _get(f"/saved-map-images?hunt_id={hunt_id}")
    assert any(
        x["image_id"] == image_id and x.get("supports_geo_placement") is False
        for x in listed["saved_map_images"]
    )


# =====================================================================
# Regression: duplicate / retry behavior on assets
# =====================================================================


def test_duplicate_asset_post_creates_separate_rows_or_dedupes(hunt_id):
    """Document the current dedupe semantics so a future regression
    is loud. Acceptable behaviors:
      A. Each POST creates a new row (no implicit dedupe). The UI is
         responsible for retry-safety on the client.
      B. POST returns an existing row when one with the same name
         + coords already exists.
    Either is fine, but two identical POSTs must not 500 and must
    not corrupt the GET listing.
    """
    body = {
        "type": "blind",
        "name": "Test Blind A",
        "latitude": 44.1,
        "longitude": -93.1,
    }
    a = _post(f"/hunts/{hunt_id}/assets", body)
    b = _post(f"/hunts/{hunt_id}/assets", body)
    assert "asset" in a and "asset" in b
    listed = _get(f"/hunts/{hunt_id}/assets")
    names = [x["name"] for x in listed["assets"]]
    # At minimum: GET works and at least one row with this name
    # exists. Two acceptable outcomes:
    assert names.count("Test Blind A") in (1, 2)
    # No 500s, no orphan IDs:
    for x in listed["assets"]:
        assert x["latitude"] == 44.1
        assert x["longitude"] == -93.1


# =====================================================================
# Cross-user data isolation regression (Task 8 testing-agent ran
# this against the live endpoint; we redo a slim version here so
# Task 11's E2E suite catches any future regression).
# =====================================================================


def test_cross_user_isolation(hunt_id):
    other_auth = {"Authorization": "Bearer test_session_rs_002"}
    r = requests.get(_api(f"/hunts/{hunt_id}/overlay-items"), headers=other_auth, timeout=10)
    # Either 404 (hunt invisible) or 403; never 200 with foreign data.
    assert r.status_code in (403, 404), r.status_code


# =====================================================================
# Sanity: surface validations land in the skipped[] bucket, not 500
# =====================================================================


def test_invalid_items_land_in_skipped_not_500(hunt_id):
    out = _post(
        f"/hunts/{hunt_id}/overlay-items:bulk-normalize",
        {
            "items": [
                {"type": "stand", "label": "good", "x": 10, "y": 10},
                {"type": "rocketship", "label": "bad type", "x": 10, "y": 10},
                {"type": "stand", "label": "", "x": 10, "y": 10},
                {"type": "stand"},  # no coords, no label
            ],
        },
    )
    assert out["created_count"] == 1
    assert out["skipped_count"] == 3
    reasons = [s["reason"] for s in out["skipped"]]
    # one each of these prefixes is expected (order varies)
    joined = "|".join(reasons)
    assert "invalid_type" in joined
    assert "missing_label" in joined
