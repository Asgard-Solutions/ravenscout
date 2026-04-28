"""Unit tests for AnalysisOverlayItem (Task 6).

Pure Pydantic / model tests \u2014 no Mongo, no HTTP. Validates:
  * canonical type set + coordinate-source set
  * latitude/longitude/x/y/confidence range checks
  * cross-field invariants (user_provided requires source_asset_id;
    pixel_only forbids lat/lng; lat & lng must be set together)
  * doc \u2192 dict back-compat helper
  * legacy taxonomy mapping
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from pydantic import ValidationError

from models import (
    ANALYSIS_OVERLAY_ITEM_TYPES,
    COORDINATE_SOURCES,
    LEGACY_OVERLAY_TYPE_MAP,
    AnalysisOverlayItem,
    AnalysisOverlayItemCreate,
    AnalysisOverlayItemUpdate,
    map_legacy_overlay_type,
    overlay_item_doc_to_dict,
)


VALID_USER_PAYLOAD = {
    "hunt_id": "hunt_x",
    "type": "stand",
    "label": "North ridge stand",
    "latitude": 32.123456,
    "longitude": -97.123456,
    "x": 540.5,
    "y": 320.7,
    "coordinate_source": "user_provided",
    "source_asset_id": "hla_1234",
    "confidence": 0.9,
}


# ---------- Type / source enum surface ----------


class TestEnums:
    def test_seventeen_overlay_types(self):
        assert len(ANALYSIS_OVERLAY_ITEM_TYPES) == 17

    def test_each_type_accepted(self):
        for t in ANALYSIS_OVERLAY_ITEM_TYPES:
            payload = {**VALID_USER_PAYLOAD, "type": t}
            m = AnalysisOverlayItemCreate(**payload)
            assert m.type == t

    def test_unknown_type_rejected(self):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(**{**VALID_USER_PAYLOAD, "type": "rocketship"})

    def test_four_coordinate_sources(self):
        assert set(COORDINATE_SOURCES) == {
            "user_provided",
            "ai_estimated_from_image",
            "derived_from_saved_map_bounds",
            "pixel_only",
        }

    def test_unknown_coordinate_source_rejected(self):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(
                **{**VALID_USER_PAYLOAD, "coordinate_source": "telepathic"}
            )


# ---------- Required fields ----------


class TestRequiredFields:
    def test_user_provided_happy_path(self):
        m = AnalysisOverlayItemCreate(**VALID_USER_PAYLOAD)
        assert m.coordinate_source == "user_provided"
        assert m.source_asset_id == "hla_1234"
        assert m.label == "North ridge stand"

    def test_missing_label_rejected(self):
        payload = {**VALID_USER_PAYLOAD}
        payload.pop("label")
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(**payload)

    def test_blank_label_rejected(self):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(**{**VALID_USER_PAYLOAD, "label": "   "})

    def test_missing_type_rejected(self):
        payload = {**VALID_USER_PAYLOAD}
        payload.pop("type")
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(**payload)

    def test_missing_coordinate_source_rejected(self):
        payload = {**VALID_USER_PAYLOAD}
        payload.pop("coordinate_source")
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(**payload)


# ---------- Coordinate validation ----------


class TestCoordinateValidation:
    @pytest.mark.parametrize("bad_lat", [99, -91, 1000])
    def test_invalid_latitude(self, bad_lat):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(**{**VALID_USER_PAYLOAD, "latitude": bad_lat})

    @pytest.mark.parametrize("bad_lng", [181, -181, 9999])
    def test_invalid_longitude(self, bad_lng):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(**{**VALID_USER_PAYLOAD, "longitude": bad_lng})

    def test_nan_x_rejected(self):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(
                **{**VALID_USER_PAYLOAD, "x": float("nan")}
            )

    def test_inf_y_rejected(self):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(
                **{**VALID_USER_PAYLOAD, "y": float("inf")}
            )

    def test_lat_without_lng_rejected(self):
        payload = {**VALID_USER_PAYLOAD, "longitude": None}
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(**payload)

    def test_lng_without_lat_rejected(self):
        payload = {**VALID_USER_PAYLOAD, "latitude": None}
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(**payload)

    def test_both_omitted_ok_for_pixel_only(self):
        m = AnalysisOverlayItemCreate(
            hunt_id="hunt_p",
            type="recommended_setup",
            label="ridge edge",
            x=400,
            y=300,
            coordinate_source="pixel_only",
        )
        assert m.latitude is None
        assert m.longitude is None
        assert m.coordinate_source == "pixel_only"


# ---------- Confidence ----------


class TestConfidence:
    def test_zero_and_one_inclusive(self):
        for c in (0, 0.5, 1):
            m = AnalysisOverlayItemCreate(
                **{**VALID_USER_PAYLOAD, "confidence": c}
            )
            assert m.confidence == float(c)

    @pytest.mark.parametrize("bad", [-0.001, 1.001, float("nan"), float("inf")])
    def test_out_of_range_rejected(self, bad):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(
                **{**VALID_USER_PAYLOAD, "confidence": bad}
            )


# ---------- Cross-field invariants ----------


class TestInvariants:
    def test_user_provided_requires_source_asset_id(self):
        payload = {**VALID_USER_PAYLOAD}
        payload.pop("source_asset_id")
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(**payload)

    def test_pixel_only_forbids_lat_lng(self):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemCreate(
                hunt_id="hunt_p",
                type="recommended_setup",
                label="x",
                latitude=30.0,
                longitude=-97.0,
                coordinate_source="pixel_only",
            )

    def test_ai_estimated_does_not_require_source_asset(self):
        m = AnalysisOverlayItemCreate(
            hunt_id="hunt_p",
            type="funnel",
            label="oak ridge funnel",
            latitude=32.0,
            longitude=-97.0,
            x=120.0,
            y=240.0,
            coordinate_source="ai_estimated_from_image",
            confidence=0.7,
        )
        assert m.source_asset_id is None
        assert m.coordinate_source == "ai_estimated_from_image"


# ---------- new_from_create ----------


class TestNewFromCreate:
    def test_mints_id_and_timestamps(self):
        payload = AnalysisOverlayItemCreate(**VALID_USER_PAYLOAD)
        item = AnalysisOverlayItem.new_from_create(
            user_id="user-1", payload=payload
        )
        assert item.user_id == "user-1"
        assert item.hunt_id == "hunt_x"
        assert item.item_id.startswith("aoi_")
        assert item.created_at == item.updated_at

    def test_explicit_item_id_preserved(self):
        payload = AnalysisOverlayItemCreate(
            **{**VALID_USER_PAYLOAD, "item_id": "explicit_1"}
        )
        item = AnalysisOverlayItem.new_from_create(
            user_id="user-1", payload=payload
        )
        assert item.item_id == "explicit_1"

    def test_missing_hunt_id_rejected(self):
        payload = AnalysisOverlayItemCreate(
            **{**VALID_USER_PAYLOAD, "hunt_id": None}
        )
        with pytest.raises(ValueError):
            AnalysisOverlayItem.new_from_create(user_id="u", payload=payload)


# ---------- Doc helper / legacy mapping ----------


class TestDocAndLegacy:
    def test_doc_to_dict_strips_id(self):
        doc = {
            "_id": "mongo-id",
            "item_id": "aoi_1",
            "user_id": "u",
            "hunt_id": "h",
            "type": "stand",
            "label": "x",
            "coordinate_source": "user_provided",
            "source_asset_id": "hla_1",
            "created_at": "2026-02-01T00:00:00+00:00",
            "updated_at": "2026-02-01T00:00:00+00:00",
        }
        out = overlay_item_doc_to_dict(doc)
        assert "_id" not in out
        assert out["item_id"] == "aoi_1"

    def test_doc_helper_handles_none(self):
        assert overlay_item_doc_to_dict(None) is None

    def test_legacy_overlay_type_mapping(self):
        # Spot-check a few legacy slugs.
        assert map_legacy_overlay_type("corridor") == "travel_corridor"
        assert map_legacy_overlay_type("avoid") == "avoid_area"
        assert map_legacy_overlay_type("water") == "water"
        assert map_legacy_overlay_type("nope") == "custom"
        # Every entry in LEGACY_OVERLAY_TYPE_MAP maps to a canonical
        # AnalysisOverlayItemType.
        for legacy, mapped in LEGACY_OVERLAY_TYPE_MAP.items():
            assert mapped in ANALYSIS_OVERLAY_ITEM_TYPES, (
                f"legacy {legacy} maps to unknown type {mapped}"
            )


# ---------- Update payload ----------


class TestUpdate:
    def test_partial_update(self):
        m = AnalysisOverlayItemUpdate(label="renamed")
        assert m.label == "renamed"
        assert m.latitude is None

    def test_invalid_lat_in_update_rejected(self):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemUpdate(latitude=999)

    def test_invalid_confidence_in_update_rejected(self):
        with pytest.raises(ValidationError):
            AnalysisOverlayItemUpdate(confidence=2.0)
