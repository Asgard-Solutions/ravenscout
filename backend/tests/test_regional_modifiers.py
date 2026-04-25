"""Tests for region resolution + regional modifier selection +
region-aware seasonal shifts + prompt integration.

Run with:
    cd /app/backend && python -m pytest tests/test_regional_modifiers.py -v
"""

import pytest

from prompt_builder import assemble_system_prompt
from species_prompts import (
    GENERIC_DEFAULT,
    GENERIC_FALLBACK_PACK,
    RegionResolution,
    normalize_region_override,
    resolve_effective_region,
    resolve_region_from_coordinates,
    resolve_regional_modifier,
    resolve_seasonal_modifier,
    resolve_species_pack,
)
from species_prompts.pack import render_regional_modifier_block


# ============================================================
# GPS -> canonical region classification
# ============================================================

class TestGpsBuckets:
    @pytest.mark.parametrize("lat,lon,expected", [
        # South Texas
        (28.5, -98.5, "south_texas"),   # Brush Country
        (26.2, -98.0, "south_texas"),   # Lower RGV
        (29.4, -98.5, "south_texas"),   # San Antonio
        # East Texas
        (32.3, -95.3, "east_texas"),    # Tyler
        (30.0, -94.1, "east_texas"),    # Beaumont area
        (33.5, -94.7, "east_texas"),    # Texarkana area
        # Southeast US
        (33.5, -86.8, "southeast_us"),  # Birmingham
        (27.9, -82.5, "southeast_us"),  # Tampa
        (32.8, -79.9, "southeast_us"),  # Charleston
        (36.1, -86.7, "southeast_us"),  # Nashville
        # Mountain West
        (39.5, -105.8, "mountain_west"),  # Denver area / Rockies
        (44.0, -112.0, "mountain_west"),  # Idaho
        (34.9, -111.7, "mountain_west"),  # Flagstaff AZ
        # Plains
        (35.5, -101.8, "plains"),        # TX panhandle
        (40.8, -100.0, "plains"),        # W Nebraska
        (46.8, -102.7, "plains"),        # W Dakotas
        # Midwest
        (41.6, -93.6, "midwest"),        # Des Moines
        (44.0, -89.5, "midwest"),        # WI central
        (40.4, -82.9, "midwest"),        # Columbus OH
    ])
    def test_point_classifies_correctly(self, lat, lon, expected):
        assert resolve_region_from_coordinates(lat, lon) == expected

    @pytest.mark.parametrize("lat,lon", [
        (None, -99.0),
        (29.0, None),
        (None, None),
        (float("nan"), -99.0),
        (29.0, float("nan")),
        # outside continental US bounding boxes
        (19.5, -155.5),   # Hawaii
        (64.2, -149.5),   # Alaska
        (51.5, -0.1),     # London
    ])
    def test_oob_or_bad_input_returns_default(self, lat, lon):
        assert resolve_region_from_coordinates(lat, lon) == GENERIC_DEFAULT

    def test_classify_precedence_south_texas_beats_east_texas(self):
        # Point inside both boxes' lat/lon ranges shouldn't exist by
        # construction, but verify border behavior: (29.4, -97.5) is
        # in south_texas bounds, not east_texas.
        assert resolve_region_from_coordinates(29.4, -97.5) == "south_texas"


# ============================================================
# Freeform override normalization
# ============================================================

class TestOverrideNormalization:
    @pytest.mark.parametrize("s,expected", [
        ("East Texas", "east_texas"),
        ("east tx", "east_texas"),
        ("E Texas", "east_texas"),
        ("Piney Woods", "east_texas"),
        ("South Texas", "south_texas"),
        ("Brush Country", "south_texas"),
        ("Texas Hill Country", "south_texas"),
        ("RGV", "south_texas"),
        ("Southeast", "southeast_us"),
        ("Deep South", "southeast_us"),
        ("Midwest", "midwest"),
        ("Corn Belt", "midwest"),
        ("Rocky Mountains", "mountain_west"),
        ("Rockies", "mountain_west"),
        ("Intermountain West", "mountain_west"),
        ("Great Plains", "plains"),
        ("High Plains", "plains"),
        # canonical pass-through
        ("south_texas", "south_texas"),
        ("east_texas", "east_texas"),
        ("generic_default", "generic_default"),
    ])
    def test_known_aliases(self, s, expected):
        assert normalize_region_override(s) == expected

    @pytest.mark.parametrize("s", [None, "", "   ", "Mars", "atlantis", 42, {"x": 1}])
    def test_unknown_or_bad_input(self, s):
        assert normalize_region_override(s) is None


# ============================================================
# Effective region resolution (precedence)
# ============================================================

class TestEffectiveRegion:
    def test_manual_override_wins(self):
        # GPS in Midwest, but override says South Texas.
        res = resolve_effective_region(
            gps_lat=41.6, gps_lon=-93.6,
            manual_override="south texas",
        )
        assert res.region_id == "south_texas"
        assert res.source == "manual_override"
        # Coordinates are still recorded for persistence.
        assert res.latitude == 41.6
        assert res.longitude == -93.6

    def test_unrecognized_override_falls_through_to_gps(self):
        res = resolve_effective_region(
            gps_lat=28.5, gps_lon=-98.5,
            manual_override="Valhalla",
        )
        assert res.region_id == "south_texas"
        assert res.source == "gps"

    def test_gps_used_when_no_override(self):
        res = resolve_effective_region(gps_lat=41.6, gps_lon=-93.6)
        assert res.region_id == "midwest"
        assert res.source == "gps"

    def test_map_centroid_used_when_gps_missing(self):
        res = resolve_effective_region(
            map_centroid=(32.3, -95.3),
        )
        assert res.region_id == "east_texas"
        assert res.source == "map_centroid"

    def test_default_when_everything_missing(self):
        res = resolve_effective_region()
        assert res.region_id == GENERIC_DEFAULT
        assert res.source == "default"

    def test_default_when_gps_out_of_boxes(self):
        # Mid-Atlantic ocean
        res = resolve_effective_region(gps_lat=30.0, gps_lon=-60.0)
        assert res.region_id == GENERIC_DEFAULT
        assert res.source == "default"
        # Raw coords retained on the resolution object.
        assert res.latitude == 30.0
        assert res.longitude == -60.0

    def test_as_dict_shape(self):
        res = resolve_effective_region(gps_lat=29.4, gps_lon=-98.5)
        d = res.as_dict()
        assert set(d.keys()) == {
            "resolvedRegionId",
            "resolvedRegionLabel",
            "regionResolutionSource",
            "latitude",
            "longitude",
        }
        assert d["resolvedRegionId"] == "south_texas"
        assert d["regionResolutionSource"] == "gps"


# ============================================================
# Species-scoped regional modifier selection
# ============================================================

class TestRegionalModifierSelection:
    def test_whitetail_has_all_six_regions(self):
        pack = resolve_species_pack("deer")
        got = set(pack.regional_modifiers.keys())
        assert got == {"south_texas", "east_texas", "southeast_us", "midwest", "plains", "mountain_west"}

    def test_turkey_has_five_regions(self):
        pack = resolve_species_pack("turkey")
        got = set(pack.regional_modifiers.keys())
        assert got == {"east_texas", "southeast_us", "midwest", "plains", "mountain_west"}

    def test_hog_has_four_regions(self):
        pack = resolve_species_pack("hog")
        got = set(pack.regional_modifiers.keys())
        assert got == {"south_texas", "east_texas", "southeast_us", "plains"}

    def test_resolve_regional_modifier_happy_path(self):
        pack = resolve_species_pack("deer")
        mod = resolve_regional_modifier(pack, "south_texas")
        assert mod is not None
        assert mod.region_id == "south_texas"

    def test_resolve_regional_modifier_missing_for_species(self):
        pack = resolve_species_pack("hog")
        # Hog has no mountain_west modifier → None.
        assert resolve_regional_modifier(pack, "mountain_west") is None

    def test_fallback_species_has_no_regional_modifiers(self):
        assert resolve_regional_modifier(GENERIC_FALLBACK_PACK, "south_texas") is None


# ============================================================
# Region-aware seasonal shifts
# ============================================================

class TestRegionAwareSeasons:
    def test_south_texas_whitetail_rut_shifts_to_december(self):
        pack = resolve_species_pack("deer")
        regional = resolve_regional_modifier(pack, "south_texas")
        # Dec 15 without region: post_rut. With SouthTX region: rut.
        base = resolve_seasonal_modifier(pack, {"hunt_date": "2026-12-15"})
        assert base is not None and base.phase_id == "post_rut"
        shifted = resolve_seasonal_modifier(
            pack, {"hunt_date": "2026-12-15"}, regional_modifier=regional,
        )
        assert shifted is not None and shifted.phase_id == "rut"

    def test_east_texas_whitetail_rut_extends_into_december(self):
        pack = resolve_species_pack("deer")
        regional = resolve_regional_modifier(pack, "east_texas")
        shifted = resolve_seasonal_modifier(
            pack, {"hunt_date": "2026-12-05"}, regional_modifier=regional,
        )
        # East TX shifts rut to (11, 12) so Dec 5 → rut.
        assert shifted is not None and shifted.phase_id == "rut"

    def test_southeast_turkey_breeding_extends_to_march(self):
        pack = resolve_species_pack("turkey")
        regional = resolve_regional_modifier(pack, "southeast_us")
        # Mar 20 base: early_season. With southeast region: peak_breeding
        # should fire because its months are (3, 4).
        shifted = resolve_seasonal_modifier(
            pack, {"hunt_date": "2026-03-20"}, regional_modifier=regional,
        )
        assert shifted is not None and shifted.phase_id == "peak_breeding"

    def test_mountain_west_turkey_breeding_shifts_to_may(self):
        pack = resolve_species_pack("turkey")
        regional = resolve_regional_modifier(pack, "mountain_west")
        # May 15 base: late_season. With mountain_west: peak_breeding
        # because its months are (5,).
        shifted = resolve_seasonal_modifier(
            pack, {"hunt_date": "2026-05-15"}, regional_modifier=regional,
        )
        assert shifted is not None and shifted.phase_id == "peak_breeding"

    def test_south_texas_hog_hot_weather_extends_into_april(self):
        pack = resolve_species_pack("hog")
        regional = resolve_regional_modifier(pack, "south_texas")
        # 72F in April 15 WITHOUT region: no hog trigger fires (April is
        # excluded from base hot_weather months and 72F < 75F).
        base = resolve_seasonal_modifier(pack, {
            "hunt_date": "2026-04-15", "temperature": "72F",
        })
        assert base is None
        # WITH south_texas: months now include 4 and min_temp_f drops to 70.
        shifted = resolve_seasonal_modifier(
            pack,
            {"hunt_date": "2026-04-15", "temperature": "72F"},
            regional_modifier=regional,
        )
        assert shifted is not None and shifted.phase_id == "hot_weather"

    def test_regional_adjustments_do_not_mutate_pack(self):
        pack = resolve_species_pack("deer")
        regional = resolve_regional_modifier(pack, "south_texas")
        _ = resolve_seasonal_modifier(
            pack, {"hunt_date": "2026-12-15"}, regional_modifier=regional,
        )
        # Base rut modifier's trigger rules remain unchanged.
        base_rut = pack.seasonal_modifiers["rut"]
        assert base_rut.trigger_rules["months"] == (11,)


# ============================================================
# Full prompt assembly integration
# ============================================================

class TestPromptIntegration:
    def test_gps_drives_regional_block(self):
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-12-15", "wind_direction": "N"},
            image_count=1,
            tier="pro",
            gps_coords=(28.5, -98.5),  # South Texas
        )
        assert "REGIONAL CONTEXT: South Texas (Brush Country)" in prompt
        assert "region_id=south_texas" in prompt
        assert "source=gps" in prompt
        # Season shifted by region → rut (Dec).
        assert "phase_id=rut" in prompt
        # Base species pack still included.
        assert "SPECIES: Whitetail Deer" in prompt
        # Shared schema still intact.
        for k in ("analysis_context", "map_observations", "overlays",
                  "summary", "top_setups", "species_tips", "confidence_summary"):
            assert k in prompt
        assert "valid JSON only" in prompt

    def test_manual_override_drives_regional_block(self):
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-12-15"},
            image_count=1,
            tier="pro",
            # GPS in Midwest but manual override to East Texas.
            gps_coords=(41.6, -93.6),
            manual_region_override="East Texas",
        )
        assert "region_id=east_texas" in prompt
        assert "source=manual_override" in prompt
        # Season shifted to rut by East TX override (11, 12).
        assert "phase_id=rut" in prompt

    def test_missing_gps_and_override_emits_generic_regional_note(self):
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-11-12"},
            image_count=1,
            tier="pro",
            # No gps_coords, no manual_region_override.
        )
        assert "REGIONAL CONTEXT: generic (region_id=generic_default" in prompt
        assert "source=default" in prompt
        # Base species block still present.
        assert "SPECIES: Whitetail Deer" in prompt
        # Shared schema still intact.
        assert "analysis_context" in prompt

    def test_species_without_regional_modifier_uses_generic_regional_note(self):
        # Hog has no mountain_west modifier; GPS in CO → regional note
        # is generic even though region resolution succeeded.
        prompt = assemble_system_prompt(
            "hog",
            conditions={"hunt_date": "2026-01-15", "temperature": "30F"},
            image_count=1,
            tier="pro",
            gps_coords=(39.5, -105.8),
        )
        # Region resolved (CO → mountain_west) but the hog pack has no
        # modifier for it → generic regional block.
        assert "REGIONAL CONTEXT: generic" in prompt
        assert "region_id=mountain_west" in prompt
        # Species base block still applies.
        assert "SPECIES: Wild Hog" in prompt

    def test_fallback_species_skips_regional_modifier(self):
        prompt = assemble_system_prompt(
            "squirrel",
            conditions={"hunt_date": "2026-11-12"},
            image_count=1,
            tier="pro",
            gps_coords=(39.5, -105.8),
        )
        assert "FALLBACK NOTICE" in prompt
        assert "REGIONAL CONTEXT: generic" in prompt

    def test_region_block_precedes_seasonal_block_in_prompt(self):
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-11-12"},
            image_count=1,
            tier="pro",
            gps_coords=(41.6, -93.6),
        )
        r_idx = prompt.index("REGIONAL CONTEXT")
        s_idx = prompt.index("SEASONAL CONTEXT")
        h_idx = prompt.index("HUNT CONDITIONS")
        assert r_idx < s_idx < h_idx

    def test_manual_override_coexists_with_gps_persistence(self):
        # Confirm that GPS is still threaded through even when an
        # override wins (for the response's region_resolution).
        res = resolve_effective_region(
            gps_lat=41.6, gps_lon=-93.6,
            manual_override="South Texas",
        )
        # The prompt builder should accept this pre-resolved object
        # and render it cleanly.
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-12-15"},
            image_count=1,
            tier="pro",
            region_resolution=res,
        )
        assert "source=manual_override" in prompt
        assert "region_id=south_texas" in prompt
        # AND: South TX shifts rut to (12, 1) so Dec 15 matches rut.
        assert "phase_id=rut" in prompt


# ============================================================
# Cross-species leakage guards
# ============================================================

class TestRegionalIsolation:
    def test_whitetail_regional_has_no_turkey_or_hog_cues(self):
        pack = resolve_species_pack("deer")
        for mod in pack.regional_modifiers.values():
            text = (
                " ".join(mod.behavior_adjustments)
                + " ".join(mod.tactical_adjustments)
                + " ".join(mod.caution_adjustments)
                + " ".join(mod.species_tips_adjustments)
            ).lower()
            assert "strut" not in text
            assert "fly-down" not in text
            assert "gobbler" not in text
            assert "sounder" not in text
            assert "wallow" not in text

    def test_turkey_regional_has_no_deer_rut_or_hog_cues(self):
        pack = resolve_species_pack("turkey")
        for mod in pack.regional_modifiers.values():
            text = (
                " ".join(mod.behavior_adjustments)
                + " ".join(mod.tactical_adjustments)
                + " ".join(mod.caution_adjustments)
                + " ".join(mod.species_tips_adjustments)
            ).lower()
            # Turkey shouldn't lean on deer rut vocabulary.
            assert " rut " not in (" " + text + " ")
            assert "sounder" not in text
            assert "wallow" not in text

    def test_hog_regional_has_no_turkey_or_deer_rut_cues(self):
        pack = resolve_species_pack("hog")
        for mod in pack.regional_modifiers.values():
            text = (
                " ".join(mod.behavior_adjustments)
                + " ".join(mod.tactical_adjustments)
                + " ".join(mod.caution_adjustments)
                + " ".join(mod.species_tips_adjustments)
            ).lower()
            assert "strut" not in text
            assert "fly-down" not in text
            assert "gobbler" not in text
            assert " rut " not in (" " + text + " ")


# ============================================================
# Regional block rendering sanity
# ============================================================

class TestRegionalBlockRendering:
    def test_regional_block_includes_all_headings(self):
        pack = resolve_species_pack("deer")
        mod = resolve_regional_modifier(pack, "south_texas")
        assert mod is not None
        text = render_regional_modifier_block(
            mod,
            region_id="south_texas",
            region_label="South Texas",
            source="gps",
        )
        assert "REGIONAL BEHAVIOR ADJUSTMENTS" in text
        assert "REGIONAL TACTICAL ADJUSTMENTS" in text
        assert "REGIONAL CAUTION ADJUSTMENTS" in text
        assert "REGIONAL SPECIES TIPS ADJUSTMENTS" in text
        assert "source=gps" in text

    def test_generic_regional_note_is_neutral(self):
        from species_prompts.pack import render_no_regional_context_note
        text = render_no_regional_context_note(
            region_id=GENERIC_DEFAULT, region_label="Generic", source="default",
        )
        assert "REGIONAL CONTEXT: generic" in text
        assert "Do NOT" in text or "lower confidence" in text.lower()
