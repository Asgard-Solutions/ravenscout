"""Unit tests for overlay_normalizer.py (Task 8).

Pure-function tests \u2014 no Mongo, no HTTP.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: F401

from overlay_normalizer import normalize_overlay_item


GEO_IMAGE = {
    "image_id": "img_geo",
    "supports_geo_placement": True,
    "north_lat": 45.0,
    "south_lat": 44.0,
    "west_lng": -93.5,
    "east_lng": -92.5,
    "original_width": 1000,
    "original_height": 800,
}

PIXEL_ONLY_IMAGE = {
    "image_id": "img_px",
    "supports_geo_placement": False,
    "north_lat": None,
    "south_lat": None,
    "west_lng": None,
    "east_lng": None,
    "original_width": 1024,
    "original_height": 768,
}

ASSETS_BY_ID = {
    "asset_123": {
        "asset_id": "asset_123",
        "type": "stand",
        "name": "North Ridge Stand",
        "latitude": 44.5,
        "longitude": -93.0,
    }
}


# --------------------------------------------------------------------
# Surface validation
# --------------------------------------------------------------------


def test_invalid_type_skipped():
    payload, reason = normalize_overlay_item(
        {"type": "rocketship", "label": "x", "coordinateSource": "pixel_only", "x": 1, "y": 1},
        hunt_id="h",
        saved_map_image=PIXEL_ONLY_IMAGE,
    )
    assert payload is None
    assert reason and reason.startswith("invalid_type")


def test_missing_label_skipped():
    payload, reason = normalize_overlay_item(
        {"type": "stand", "coordinateSource": "pixel_only", "x": 1, "y": 1},
        hunt_id="h",
        saved_map_image=PIXEL_ONLY_IMAGE,
    )
    assert payload is None
    assert reason == "missing_label"


def test_blank_label_skipped():
    payload, reason = normalize_overlay_item(
        {"type": "stand", "label": "   ", "coordinateSource": "pixel_only", "x": 1, "y": 1},
        hunt_id="h",
        saved_map_image=PIXEL_ONLY_IMAGE,
    )
    assert payload is None
    assert reason == "missing_label"


def test_not_a_dict_skipped():
    payload, reason = normalize_overlay_item("nope", hunt_id="h")  # type: ignore[arg-type]
    assert payload is None
    assert reason == "not_a_dict"


# --------------------------------------------------------------------
# Pixel-only branch
# --------------------------------------------------------------------


def test_pixel_only_requires_xy():
    payload, reason = normalize_overlay_item(
        {"type": "stand", "label": "X", "latitude": 30.0, "longitude": -97.0},
        hunt_id="h",
        saved_map_image=PIXEL_ONLY_IMAGE,
    )
    assert payload is None
    assert reason == "missing_xy_for_pixel_only"


def test_pixel_only_strips_lat_lng():
    payload, reason = normalize_overlay_item(
        {
            "type": "stand",
            "label": "X",
            "latitude": 30.0,
            "longitude": -97.0,
            "x": 100,
            "y": 200,
            "coordinateSource": "ai_estimated_from_image",
        },
        hunt_id="h",
        saved_map_image=PIXEL_ONLY_IMAGE,
    )
    assert reason is None
    assert payload is not None
    assert payload.coordinate_source == "pixel_only"
    assert payload.latitude is None
    assert payload.longitude is None
    assert payload.x == 100.0 and payload.y == 200.0


def test_no_saved_image_treated_as_pixel_only():
    payload, reason = normalize_overlay_item(
        {"type": "stand", "label": "X", "x": 5, "y": 5, "coordinateSource": "pixel_only"},
        hunt_id="h",
        saved_map_image=None,
    )
    assert reason is None
    assert payload is not None
    assert payload.coordinate_source == "pixel_only"


# --------------------------------------------------------------------
# Geo-capable image branches
# --------------------------------------------------------------------


def test_geo_image_lat_lng_only_derives_xy():
    # Center of the GEO_IMAGE bounding box → center of the canvas.
    payload, reason = normalize_overlay_item(
        {
            "type": "funnel",
            "label": "Saddle",
            "latitude": 44.5,
            "longitude": -93.0,
            "coordinateSource": "ai_estimated_from_image",
            "confidence": 0.8,
        },
        hunt_id="h",
        saved_map_image=GEO_IMAGE,
    )
    assert reason is None
    assert payload is not None
    assert payload.x == pytest.approx(500.0)
    assert payload.y == pytest.approx(400.0)
    assert payload.coordinate_source == "ai_estimated_from_image"
    assert payload.confidence == pytest.approx(0.8)


def test_geo_image_xy_only_derives_lat_lng():
    payload, reason = normalize_overlay_item(
        {
            "type": "funnel",
            "label": "Saddle",
            "x": 500,
            "y": 400,
        },
        hunt_id="h",
        saved_map_image=GEO_IMAGE,
    )
    assert reason is None
    assert payload is not None
    assert payload.latitude == pytest.approx(44.5)
    assert payload.longitude == pytest.approx(-93.0)
    assert payload.coordinate_source == "derived_from_saved_map_bounds"


def test_geo_image_both_supplied_persisted_as_is():
    payload, reason = normalize_overlay_item(
        {
            "type": "funnel",
            "label": "Saddle",
            "latitude": 44.6,
            "longitude": -93.1,
            "x": 400.0,
            "y": 320.0,
        },
        hunt_id="h",
        saved_map_image=GEO_IMAGE,
    )
    assert reason is None
    assert payload is not None
    assert payload.latitude == pytest.approx(44.6)
    assert payload.longitude == pytest.approx(-93.1)
    assert payload.x == pytest.approx(400.0)
    assert payload.y == pytest.approx(320.0)
    assert payload.coordinate_source == "ai_estimated_from_image"  # default


def test_geo_image_no_coordinates_skipped():
    payload, reason = normalize_overlay_item(
        {"type": "funnel", "label": "Saddle"},
        hunt_id="h",
        saved_map_image=GEO_IMAGE,
    )
    assert payload is None
    assert reason == "no_coordinates"


# --------------------------------------------------------------------
# user_provided branch
# --------------------------------------------------------------------


def test_user_provided_forces_asset_lat_lng():
    payload, reason = normalize_overlay_item(
        {
            "type": "stand",
            "label": "North Ridge Stand",
            # AI-modified coords differ from the asset \u2014 must be IGNORED.
            "latitude": 99.999,
            "longitude": -1.234,
            "coordinateSource": "user_provided",
            "sourceAssetId": "asset_123",
        },
        hunt_id="h",
        saved_map_image=GEO_IMAGE,
        hunt_assets_by_id=ASSETS_BY_ID,
    )
    assert reason is None
    assert payload is not None
    assert payload.coordinate_source == "user_provided"
    assert payload.source_asset_id == "asset_123"
    # MUST be the asset's stored values, not the AI-modified ones.
    assert payload.latitude == pytest.approx(44.5)
    assert payload.longitude == pytest.approx(-93.0)


def test_user_provided_derives_xy_on_geo_image():
    payload, reason = normalize_overlay_item(
        {
            "type": "stand",
            "label": "North Ridge Stand",
            "coordinateSource": "user_provided",
            "sourceAssetId": "asset_123",
        },
        hunt_id="h",
        saved_map_image=GEO_IMAGE,
        hunt_assets_by_id=ASSETS_BY_ID,
    )
    assert reason is None
    assert payload is not None
    assert payload.x == pytest.approx(500.0)
    assert payload.y == pytest.approx(400.0)


def test_user_provided_unknown_asset_skipped():
    payload, reason = normalize_overlay_item(
        {
            "type": "stand",
            "label": "x",
            "coordinateSource": "user_provided",
            "sourceAssetId": "asset_does_not_exist",
        },
        hunt_id="h",
        saved_map_image=GEO_IMAGE,
        hunt_assets_by_id=ASSETS_BY_ID,
    )
    assert payload is None
    assert reason and reason.startswith("unknown_source_asset")


def test_user_provided_on_pixel_only_image_no_xy_derivation():
    payload, reason = normalize_overlay_item(
        {
            "type": "stand",
            "label": "X",
            "x": 50,
            "y": 60,
            "coordinateSource": "user_provided",
            "sourceAssetId": "asset_123",
        },
        hunt_id="h",
        saved_map_image=PIXEL_ONLY_IMAGE,
        hunt_assets_by_id=ASSETS_BY_ID,
    )
    assert reason is None
    assert payload is not None
    # asset coords come through unchanged
    assert payload.latitude == pytest.approx(44.5)
    assert payload.longitude == pytest.approx(-93.0)
    # x/y from caller passed through (no derivation possible)
    assert payload.x == 50
    assert payload.y == 60


# --------------------------------------------------------------------
# Defensive paths
# --------------------------------------------------------------------


def test_partially_specified_geo_image_treated_as_pixel_only():
    # Saved image claims supports_geo_placement=True but a bound is
    # missing \u2014 the helper should refuse to treat it as geo-capable.
    broken = {**GEO_IMAGE, "north_lat": None}
    payload, reason = normalize_overlay_item(
        {"type": "stand", "label": "X", "x": 1, "y": 1, "coordinateSource": "pixel_only"},
        hunt_id="h",
        saved_map_image=broken,
    )
    assert reason is None
    assert payload is not None
    assert payload.coordinate_source == "pixel_only"


def test_camel_case_keys_accepted():
    payload, reason = normalize_overlay_item(
        {
            "type": "stand",
            "label": "X",
            "latitude": 44.5,
            "longitude": -93.0,
            "coordinateSource": "ai_estimated_from_image",
        },
        hunt_id="h",
        saved_map_image=GEO_IMAGE,
    )
    assert reason is None
    assert payload is not None
    assert payload.coordinate_source == "ai_estimated_from_image"


def test_invalid_lat_skipped_via_pydantic():
    payload, reason = normalize_overlay_item(
        {
            "type": "stand",
            "label": "X",
            "latitude": 95,
            "longitude": -93.0,
            "coordinateSource": "ai_estimated_from_image",
        },
        hunt_id="h",
        saved_map_image=GEO_IMAGE,
    )
    # latLngToPixel raises on out-of-range lat; helper soft-fails.
    assert payload is None
    assert reason and reason.startswith("latlng_to_pixel_failed")


def test_invalid_xy_skipped():
    payload, reason = normalize_overlay_item(
        {
            "type": "stand",
            "label": "X",
            "x": float("nan"),
            "y": 1.0,
        },
        hunt_id="h",
        saved_map_image=GEO_IMAGE,
    )
    # NaN x is filtered upstream → both lat/lng & x/y empty → no_coordinates.
    assert payload is None
    assert reason == "no_coordinates"
