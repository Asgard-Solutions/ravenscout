"""Tests for geo_validation helpers and the new geo Pydantic models.

Pure-Python unit tests — no Mongo, no HTTP. These verify:
  * latitude / longitude range checks
  * required-field enforcement on HuntLocationAssetCreate
  * conditional bounds requirement on SavedMapImageCreate when
    supports_geo_placement = True
  * backward-compatible defaults from saved_map_image_doc_to_dict
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import math

import pytest
from pydantic import ValidationError

from geo_validation import (
    GeoValidationError,
    validate_bounds,
    validate_latitude,
    validate_longitude,
)
from models import (
    HUNT_LOCATION_ASSET_TYPES,
    HuntLocationAsset,
    HuntLocationAssetCreate,
    HuntLocationAssetUpdate,
    SavedMapImage,
    SavedMapImageCreate,
    asset_doc_to_dict,
    saved_map_image_doc_to_dict,
)


# ----------------------------------------------------------------------
# geo_validation — scalar helpers
# ----------------------------------------------------------------------

class TestLatitudeValidation:
    def test_accepts_in_range(self):
        assert validate_latitude(0) == 0.0
        assert validate_latitude(45.123) == 45.123
        assert validate_latitude(-89.999) == -89.999
        assert validate_latitude(90) == 90.0
        assert validate_latitude(-90) == -90.0

    def test_rejects_out_of_range(self):
        with pytest.raises(GeoValidationError):
            validate_latitude(90.0001)
        with pytest.raises(GeoValidationError):
            validate_latitude(-90.0001)
        with pytest.raises(GeoValidationError):
            validate_latitude(180)

    def test_rejects_non_numeric(self):
        with pytest.raises(GeoValidationError):
            validate_latitude("45")
        with pytest.raises(GeoValidationError):
            validate_latitude(None)
        with pytest.raises(GeoValidationError):
            validate_latitude(True)

    def test_rejects_nan_inf(self):
        with pytest.raises(GeoValidationError):
            validate_latitude(float("nan"))
        with pytest.raises(GeoValidationError):
            validate_latitude(float("inf"))
        with pytest.raises(GeoValidationError):
            validate_latitude(-math.inf)


class TestLongitudeValidation:
    def test_accepts_in_range(self):
        assert validate_longitude(0) == 0.0
        assert validate_longitude(180) == 180.0
        assert validate_longitude(-180) == -180.0
        assert validate_longitude(123.456) == 123.456

    def test_rejects_out_of_range(self):
        with pytest.raises(GeoValidationError):
            validate_longitude(180.0001)
        with pytest.raises(GeoValidationError):
            validate_longitude(-180.0001)

    def test_rejects_non_numeric(self):
        with pytest.raises(GeoValidationError):
            validate_longitude("-100")
        with pytest.raises(GeoValidationError):
            validate_longitude(False)


class TestBoundsValidation:
    def test_accepts_normal_box(self):
        # No exception
        validate_bounds(
            north_lat=45.0, south_lat=44.0, west_lng=-93.0, east_lng=-92.0
        )

    def test_accepts_antimeridian_box(self):
        # east < west is allowed (crosses antimeridian).
        validate_bounds(
            north_lat=10.0, south_lat=-10.0, west_lng=170.0, east_lng=-170.0
        )

    def test_rejects_inverted_lat(self):
        with pytest.raises(GeoValidationError):
            validate_bounds(
                north_lat=10.0, south_lat=20.0, west_lng=0.0, east_lng=1.0
            )

    def test_rejects_zero_width_box(self):
        with pytest.raises(GeoValidationError):
            validate_bounds(
                north_lat=10.0, south_lat=5.0, west_lng=0.0, east_lng=0.0
            )

    def test_rejects_out_of_range_corner(self):
        with pytest.raises(GeoValidationError):
            validate_bounds(
                north_lat=95.0, south_lat=10.0, west_lng=0.0, east_lng=1.0
            )


# ----------------------------------------------------------------------
# HuntLocationAssetCreate
# ----------------------------------------------------------------------

VALID_ASSET_PAYLOAD = {
    "hunt_id": "hunt_abc",
    "type": "stand",
    "name": "North ridge stand",
    "latitude": 44.9778,
    "longitude": -93.2650,
}


class TestHuntLocationAssetCreate:
    def test_valid_payload(self):
        m = HuntLocationAssetCreate(**VALID_ASSET_PAYLOAD)
        assert m.type == "stand"
        assert m.latitude == 44.9778
        assert m.longitude == -93.2650
        assert m.notes is None

    def test_optional_notes(self):
        m = HuntLocationAssetCreate(**VALID_ASSET_PAYLOAD, notes="trail cam covers SW")
        assert m.notes == "trail cam covers SW"

    def test_all_canonical_types_accepted(self):
        for t in HUNT_LOCATION_ASSET_TYPES:
            m = HuntLocationAssetCreate(**{**VALID_ASSET_PAYLOAD, "type": t})
            assert m.type == t

    def test_rejects_unknown_type(self):
        with pytest.raises(ValidationError):
            HuntLocationAssetCreate(**{**VALID_ASSET_PAYLOAD, "type": "chair"})

    def test_rejects_invalid_latitude(self):
        for bad in (90.5, -91, 1000, float("nan")):
            with pytest.raises(ValidationError):
                HuntLocationAssetCreate(**{**VALID_ASSET_PAYLOAD, "latitude": bad})

    def test_rejects_invalid_longitude(self):
        for bad in (180.5, -181, 9999, float("inf")):
            with pytest.raises(ValidationError):
                HuntLocationAssetCreate(**{**VALID_ASSET_PAYLOAD, "longitude": bad})

    def test_rejects_missing_required_fields(self):
        for missing in ("hunt_id", "type", "name", "latitude", "longitude"):
            payload = dict(VALID_ASSET_PAYLOAD)
            payload.pop(missing)
            with pytest.raises(ValidationError):
                HuntLocationAssetCreate(**payload)

    def test_rejects_blank_name(self):
        with pytest.raises(ValidationError):
            HuntLocationAssetCreate(**{**VALID_ASSET_PAYLOAD, "name": "   "})

    def test_new_from_create_mints_id_and_timestamps(self):
        payload = HuntLocationAssetCreate(**VALID_ASSET_PAYLOAD)
        asset = HuntLocationAsset.new_from_create(
            user_id="user-xyz", payload=payload
        )
        assert asset.user_id == "user-xyz"
        assert asset.hunt_id == "hunt_abc"
        assert asset.asset_id.startswith("hla_")
        assert asset.created_at == asset.updated_at

    def test_explicit_asset_id_preserved(self):
        payload = HuntLocationAssetCreate(
            **{**VALID_ASSET_PAYLOAD, "asset_id": "custom_asset_42"}
        )
        asset = HuntLocationAsset.new_from_create(
            user_id="user-xyz", payload=payload
        )
        assert asset.asset_id == "custom_asset_42"


class TestHuntLocationAssetUpdate:
    def test_partial_update_allows_subset(self):
        m = HuntLocationAssetUpdate(name="renamed stand")
        assert m.name == "renamed stand"
        assert m.latitude is None
        assert m.longitude is None

    def test_invalid_lat_in_partial_rejected(self):
        with pytest.raises(ValidationError):
            HuntLocationAssetUpdate(latitude=999)


# ----------------------------------------------------------------------
# SavedMapImageCreate
# ----------------------------------------------------------------------

class TestSavedMapImageCreate:
    def test_minimal_payload_defaults_geo_off(self):
        m = SavedMapImageCreate(image_id="img_1")
        assert m.supports_geo_placement is False
        assert m.source == "upload"
        assert m.north_lat is None
        assert m.original_width is None

    def test_geo_placement_requires_full_basis(self):
        # Missing pixel dimensions and bounds.
        with pytest.raises(ValidationError) as ei:
            SavedMapImageCreate(
                image_id="img_2",
                supports_geo_placement=True,
            )
        msg = str(ei.value).lower()
        # Mentions every missing field at least once.
        for fname in (
            "original_width",
            "original_height",
            "north_lat",
            "south_lat",
            "west_lng",
            "east_lng",
        ):
            assert fname in msg

    def test_geo_placement_full_payload_valid(self):
        m = SavedMapImageCreate(
            image_id="img_3",
            hunt_id="hunt_3",
            image_url="https://example.com/maps/3.jpg",
            original_width=1024,
            original_height=768,
            north_lat=45.0,
            south_lat=44.0,
            west_lng=-93.5,
            east_lng=-92.5,
            center_lat=44.5,
            center_lng=-93.0,
            zoom=14.5,
            bearing=10,
            pitch=20,
            source="maptiler",
            style="outdoors-v2",
            supports_geo_placement=True,
        )
        assert m.supports_geo_placement is True
        assert m.source == "maptiler"
        assert m.original_width == 1024

    def test_geo_placement_inverted_bounds_rejected(self):
        with pytest.raises(ValidationError):
            SavedMapImageCreate(
                image_id="img_4",
                original_width=512,
                original_height=512,
                north_lat=10.0,
                south_lat=20.0,  # south > north
                west_lng=-1.0,
                east_lng=1.0,
                supports_geo_placement=True,
            )

    def test_geo_placement_zero_width_box_rejected(self):
        with pytest.raises(ValidationError):
            SavedMapImageCreate(
                image_id="img_5",
                original_width=512,
                original_height=512,
                north_lat=10.0,
                south_lat=5.0,
                west_lng=0.0,
                east_lng=0.0,
                supports_geo_placement=True,
            )

    def test_invalid_source_rejected(self):
        with pytest.raises(ValidationError):
            SavedMapImageCreate(image_id="img_6", source="google_maps")  # type: ignore[arg-type]

    def test_zoom_bearing_pitch_bounds(self):
        # zoom > 24 rejected
        with pytest.raises(ValidationError):
            SavedMapImageCreate(image_id="img_z", zoom=30)
        # pitch > 85 rejected
        with pytest.raises(ValidationError):
            SavedMapImageCreate(image_id="img_p", pitch=90)
        # bearing < -360 rejected
        with pytest.raises(ValidationError):
            SavedMapImageCreate(image_id="img_b", bearing=-400)

    def test_non_geo_image_does_not_require_bounds(self):
        # Plain uploaded image with no bounds and supports_geo_placement
        # left at default False — must be valid.
        m = SavedMapImageCreate(
            image_id="img_legacy", image_url="https://x/y.jpg"
        )
        assert m.supports_geo_placement is False


# ----------------------------------------------------------------------
# Doc → dict back-compat helpers
# ----------------------------------------------------------------------

class TestDocHelpers:
    def test_saved_map_image_legacy_doc_defaults_safely(self):
        # Simulate a legacy / partial Mongo doc with no source +
        # no supports_geo_placement field.
        doc = {
            "_id": "mongo-id",
            "image_id": "img_legacy",
            "user_id": "u1",
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        out = saved_map_image_doc_to_dict(doc)
        assert "_id" not in out
        assert out["supports_geo_placement"] is False
        assert out["source"] == "upload"
        assert out["image_id"] == "img_legacy"

    def test_saved_map_image_handles_none(self):
        assert saved_map_image_doc_to_dict(None) is None

    def test_asset_doc_to_dict_strips_id(self):
        doc = {
            "_id": "mongo-id",
            "asset_id": "hla_x",
            "user_id": "u1",
            "hunt_id": "hunt_x",
            "type": "stand",
            "name": "n",
            "latitude": 0.0,
            "longitude": 0.0,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        out = asset_doc_to_dict(doc)
        assert "_id" not in out
        assert out["asset_id"] == "hla_x"
