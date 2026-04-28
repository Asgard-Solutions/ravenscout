"""Tests for the user-provided Hunt GPS Assets block in prompt_builder.

Covers Task 7's prompt-context contract:
  * empty / None assets → benign "no user-provided assets" notice
  * single asset renders all fields
  * multiple assets render in order
  * coordinates / notes / asset_id / type / name all surface
  * guardrails are present in the asset block
  * assemble_system_prompt is byte-identical when no assets are
    supplied (legacy back-compat)
  * assemble_system_prompt strictly grows when assets are supplied,
    and contains the asset block + guardrail keywords
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: F401

from prompt_builder import (
    assemble_system_prompt,
    build_hunt_location_assets_block,
)


SPECIES_DATA = {
    "whitetail": {
        "name": "Whitetail Deer",
        "habitat": "mixed forest, edge cover, agricultural fringe",
        "patterns": ["dawn", "dusk", "edge transitions"],
    }
}

CONDITIONS = {
    "wind_direction": "N",
    "wind_speed": 8,
    "temperature": 45,
    "precipitation": "none",
    "cloud_cover": "partly cloudy",
    "season": "rut",
    "moon_phase": "waxing",
    "barometric_pressure": "30.10",
    "barometric_trend": "steady",
    "date": "2026-02-01",
    "time_of_day": "AM",
}


SAMPLE_ASSETS = [
    {
        "asset_id": "asset_123",
        "type": "stand",
        "name": "North Ridge Ladder Stand",
        "latitude": 32.123456,
        "longitude": -97.123456,
        "notes": "Good for north wind. Overlooks creek crossing.",
    },
    {
        "asset_id": "asset_456",
        "type": "blind",
        "name": "Creek Bottom Box Blind",
        "latitude": 32.124100,
        "longitude": -97.122900,
    },
]


# =====================================================================
# build_hunt_location_assets_block
# =====================================================================


class TestBlockRendering:
    def test_none_returns_no_assets_notice(self):
        out = build_hunt_location_assets_block(None)
        assert "USER-PROVIDED HUNT LOCATION ASSETS" in out
        assert "None provided" in out

    def test_empty_list_returns_no_assets_notice(self):
        out = build_hunt_location_assets_block([])
        assert "None provided" in out

    def test_single_asset_renders_all_fields(self):
        out = build_hunt_location_assets_block([SAMPLE_ASSETS[0]])
        assert "Asset ID: asset_123" in out
        assert "Type: stand" in out
        assert "Name: North Ridge Ladder Stand" in out
        assert "GPS: 32.123456, -97.123456" in out
        assert "Notes: Good for north wind" in out

    def test_multiple_assets_in_order(self):
        out = build_hunt_location_assets_block(SAMPLE_ASSETS)
        idx_1 = out.find("asset_123")
        idx_2 = out.find("asset_456")
        assert idx_1 != -1 and idx_2 != -1
        assert idx_1 < idx_2

    def test_optional_notes_omitted_when_absent(self):
        out = build_hunt_location_assets_block([SAMPLE_ASSETS[1]])
        # asset_456 has no notes — the Notes: line should not appear
        # for that entry.
        block_for_456 = out.split("asset_456", 1)[1].split("ASSET USAGE RULES")[0]
        assert "Notes:" not in block_for_456

    def test_blank_notes_omitted(self):
        out = build_hunt_location_assets_block(
            [{**SAMPLE_ASSETS[0], "notes": "    "}]
        )
        block = out.split("asset_123", 1)[1].split("ASSET USAGE RULES")[0]
        assert "Notes:" not in block

    def test_guardrails_present(self):
        out = build_hunt_location_assets_block(SAMPLE_ASSETS)
        assert "ASSET USAGE RULES" in out
        # The hard constraints the brief calls out:
        assert "Do NOT alter" in out
        assert 'coordinateSource = "user_provided"' in out
        assert "sourceAssetId" in out
        assert 'coordinateSource = "ai_estimated_from_image"' in out
        assert "DO NOT reuse a sourceAssetId" in out
        assert "do NOT fabricate latitude/longitude" in out

    def test_asset_count_pluralisation(self):
        single = build_hunt_location_assets_block([SAMPLE_ASSETS[0]])
        plural = build_hunt_location_assets_block(SAMPLE_ASSETS)
        assert "1 known location " in single
        assert "2 known locations" in plural

    def test_malformed_entry_is_skipped(self):
        out = build_hunt_location_assets_block(
            [
                SAMPLE_ASSETS[0],
                None,                      # type: ignore[list-item]
                {"asset_id": "asset_x"},   # missing required fields rendered cautiously
            ]
        )
        # The valid entry still surfaces.
        assert "asset_123" in out
        # The entry without lat/lng should still show its asset_id but
        # without a GPS line.
        assert "asset_x" in out
        # Sanity: no exception was raised; we're here.

    def test_lat_lng_only_emits_when_both_numeric(self):
        # Half-coordinate entries should render the asset id / name /
        # type but skip the GPS line rather than emit "GPS: None,…".
        out = build_hunt_location_assets_block(
            [
                {
                    "asset_id": "half",
                    "type": "stand",
                    "name": "X",
                    "latitude": 30.0,
                    # longitude omitted
                }
            ]
        )
        assert "Asset ID: half" in out
        # The `GPS:` line should not appear for this entry.
        block = out.split("Asset ID: half", 1)[1].split("ASSET USAGE")[0]
        assert "GPS:" not in block


# =====================================================================
# assemble_system_prompt integration
# =====================================================================


def _assemble(animal: str = "whitetail", **kwargs) -> str:
    return assemble_system_prompt(
        animal=animal,
        conditions=CONDITIONS,
        species_data=SPECIES_DATA,
        image_count=1,
        tier="trial",
        **kwargs,
    )


class TestSystemPromptIntegration:
    def test_legacy_byte_identical_when_no_assets(self):
        # No `hunt_location_assets` arg at all.
        baseline = _assemble()
        # Empty list / None should both be byte-identical to legacy.
        with_none = _assemble(hunt_location_assets=None)
        with_empty = _assemble(hunt_location_assets=[])
        assert baseline == with_none, "None must produce the legacy prompt"
        assert baseline == with_empty, "Empty list must produce the legacy prompt"

    def test_prompt_grows_when_assets_supplied(self):
        baseline = _assemble()
        with_assets = _assemble(hunt_location_assets=SAMPLE_ASSETS)
        assert len(with_assets) > len(baseline)

    def test_assets_block_present_in_prompt(self):
        out = _assemble(hunt_location_assets=SAMPLE_ASSETS)
        assert "USER-PROVIDED HUNT LOCATION ASSETS" in out
        # The asset names/ids/coords land verbatim.
        assert "asset_123" in out
        assert "North Ridge Ladder Stand" in out
        assert "32.123456, -97.123456" in out
        assert "Creek Bottom Box Blind" in out

    def test_guardrails_land_in_full_prompt(self):
        out = _assemble(hunt_location_assets=SAMPLE_ASSETS)
        assert "Do NOT alter" in out
        assert "ai_estimated_from_image" in out
        assert "pixel_only" in out
