"""Tests for seasonal modifier selection and prompt integration.

Run with:
    cd /app/backend && python -m pytest tests/test_seasonal_modifiers.py -v
"""

import pytest

from prompt_builder import assemble_system_prompt
from species_prompts import (
    GENERIC_FALLBACK_PACK,
    resolve_seasonal_modifier,
    resolve_species_pack,
)
from species_prompts.pack import (
    SeasonalModifier,
    render_no_seasonal_context_note,
    render_seasonal_modifier_block,
)
from species_prompts.seasons import _parse_hunt_date, _parse_temperature_f

DUMMY_CONDITIONS = {
    "hunt_date": "2026-04-20",
    "time_window": "morning",
    "wind_direction": "NW",
    "temperature": "42F",
    "property_type": "public",
    "region": "Ozarks",
}


# ============================================================
# input parsing
# ============================================================

class TestInputParsing:
    @pytest.mark.parametrize("s,expected_month", [
        ("2026-11-12", 11),
        ("2026/11/12", 11),
        ("11/12/2026", 11),
        ("04-20-2026", 4),
    ])
    def test_parse_hunt_date_formats(self, s, expected_month):
        d = _parse_hunt_date(s)
        assert d is not None
        assert d.month == expected_month

    @pytest.mark.parametrize("s", ["", "   ", "not a date", "2026-13-99", None])
    def test_parse_hunt_date_junk(self, s):
        assert _parse_hunt_date(s) is None

    @pytest.mark.parametrize("v,expected_f", [
        (42, 42.0),
        (42.5, 42.5),
        ("42", 42.0),
        ("42F", 42.0),
        ("42 F", 42.0),
        ("42 °F", 42.0),
        ("-3 C", 26.6),       # -3C -> 26.6F
        ("0 C", 32.0),
        ("30c", 86.0),
    ])
    def test_parse_temperature_f(self, v, expected_f):
        got = _parse_temperature_f(v)
        assert got is not None
        assert abs(got - expected_f) < 0.1

    @pytest.mark.parametrize("v", [None, True, False, "", "warm", "cold"])
    def test_parse_temperature_f_junk(self, v):
        assert _parse_temperature_f(v) is None


# ============================================================
# whitetail seasonal selection
# ============================================================

class TestWhitetailSeasons:
    @pytest.fixture
    def pack(self):
        return resolve_species_pack("deer")

    @pytest.mark.parametrize("date,phase_id", [
        ("2026-09-15", "early_season"),
        ("2026-10-14", "pre_rut"),
        ("2026-11-12", "rut"),
        ("2026-12-08", "post_rut"),
        ("2026-01-15", "late_season"),
        ("2026-02-05", "late_season"),
    ])
    def test_month_based_selection(self, pack, date, phase_id):
        mod = resolve_seasonal_modifier(pack, {"hunt_date": date})
        assert mod is not None
        assert mod.phase_id == phase_id

    def test_out_of_season_returns_none(self, pack):
        # June/July → no whitetail phase defined → None.
        assert resolve_seasonal_modifier(pack, {"hunt_date": "2026-06-15"}) is None
        assert resolve_seasonal_modifier(pack, {"hunt_date": "2026-07-04"}) is None

    def test_missing_date_returns_none(self, pack):
        assert resolve_seasonal_modifier(pack, {"temperature": "42F"}) is None
        assert resolve_seasonal_modifier(pack, {}) is None
        assert resolve_seasonal_modifier(pack, None) is None


# ============================================================
# turkey seasonal selection
# ============================================================

class TestTurkeySeasons:
    @pytest.fixture
    def pack(self):
        return resolve_species_pack("turkey")

    @pytest.mark.parametrize("date,phase_id", [
        ("2026-03-10", "early_season"),
        ("2026-04-15", "peak_breeding"),
        ("2026-05-10", "late_season"),
    ])
    def test_month_based_selection(self, pack, date, phase_id):
        mod = resolve_seasonal_modifier(pack, {"hunt_date": date})
        assert mod is not None
        assert mod.phase_id == phase_id

    def test_out_of_season(self, pack):
        # February: no spring phase yet.
        assert resolve_seasonal_modifier(pack, {"hunt_date": "2026-02-15"}) is None
        # July: off-season for spring turkey.
        assert resolve_seasonal_modifier(pack, {"hunt_date": "2026-07-04"}) is None


# ============================================================
# hog seasonal selection (temperature-driven)
# ============================================================

class TestHogSeasons:
    @pytest.fixture
    def pack(self):
        return resolve_species_pack("hog")

    def test_temperature_triggers_hot_weather(self, pack):
        # 80F in April → hot_weather (temp trigger wins via "either" logic).
        mod = resolve_seasonal_modifier(pack, {
            "hunt_date": "2026-04-15",
            "temperature": "80F",
        })
        assert mod is not None
        assert mod.phase_id == "hot_weather"

    def test_summer_month_triggers_hot_weather_even_without_temp(self, pack):
        # June with no temperature → hot_weather via month trigger.
        mod = resolve_seasonal_modifier(pack, {"hunt_date": "2026-06-15"})
        assert mod is not None
        assert mod.phase_id == "hot_weather"

    def test_cold_weather_trigger(self, pack):
        mod = resolve_seasonal_modifier(pack, {
            "hunt_date": "2026-01-15",
            "temperature": "28F",
        })
        assert mod is not None
        assert mod.phase_id == "cold_weather"

    def test_cold_winter_month_without_temp(self, pack):
        mod = resolve_seasonal_modifier(pack, {"hunt_date": "2026-02-05"})
        assert mod is not None
        assert mod.phase_id == "cold_weather"

    def test_drought_requires_temp_AND_summer_month(self, pack):
        # Hot summer day → drought.
        mod = resolve_seasonal_modifier(pack, {
            "hunt_date": "2026-08-10",
            "temperature": "95F",
        })
        assert mod is not None
        assert mod.phase_id == "drought_conditions"

    def test_drought_NOT_triggered_by_hot_winter(self, pack):
        # 95F in January — unrealistic but guards against loose logic.
        mod = resolve_seasonal_modifier(pack, {
            "hunt_date": "2026-01-15",
            "temperature": "95F",
        })
        assert mod is not None
        assert mod.phase_id != "drought_conditions"

    def test_mild_shoulder_season_returns_none(self, pack):
        # October 60F: no hog trigger fires.
        mod = resolve_seasonal_modifier(pack, {
            "hunt_date": "2026-10-15",
            "temperature": "60F",
        })
        assert mod is None


# ============================================================
# Cross-species isolation — no leakage of modifiers
# ============================================================

class TestCrossSpeciesIsolation:
    def test_turkey_cannot_resolve_whitetail_modifier(self):
        # Turkey pack doesn't define a "rut" phase — even with a Nov date
        # it should either resolve a turkey phase or return None, never
        # a whitetail modifier.
        t = resolve_species_pack("turkey")
        mod = resolve_seasonal_modifier(t, {"hunt_date": "2026-11-12"})
        if mod is not None:
            assert mod.phase_id in t.seasonal_modifiers
            assert mod.phase_id not in ("rut", "pre_rut", "post_rut", "late_season", "early_season") or True
            # More strictly:
            assert mod is t.seasonal_modifiers[mod.phase_id]

    def test_hog_modifier_has_no_turkey_or_deer_cues(self):
        h = resolve_species_pack("hog")
        for mod in h.seasonal_modifiers.values():
            text = (
                " ".join(mod.behavior_adjustments)
                + " ".join(mod.tactical_adjustments)
                + " ".join(mod.caution_adjustments)
                + " ".join(mod.species_tips_adjustments)
            ).lower()
            assert "strut" not in text
            assert "fly-down" not in text
            assert "gobbler" not in text
            assert "rut" not in text   # whitetail rut vocabulary


# ============================================================
# Fallback pack + malformed pack inputs
# ============================================================

class TestFallbackBehavior:
    def test_fallback_pack_has_no_seasonal_modifiers(self):
        assert resolve_seasonal_modifier(GENERIC_FALLBACK_PACK, DUMMY_CONDITIONS) is None

    def test_none_pack_returns_none(self):
        assert resolve_seasonal_modifier(None, DUMMY_CONDITIONS) is None


# ============================================================
# Prompt integration
# ============================================================

class TestSeasonalPromptIntegration:
    def test_prompt_includes_seasonal_block_when_resolved(self):
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-11-12", "wind_direction": "NW"},
            image_count=1,
            tier="pro",
        )
        assert "SEASONAL CONTEXT: Peak Rut" in prompt
        assert "phase_id=rut" in prompt
        assert "SEASONAL BEHAVIOR ADJUSTMENTS" in prompt
        assert "SEASONAL TACTICAL ADJUSTMENTS" in prompt
        assert "SEASONAL CAUTION ADJUSTMENTS" in prompt
        assert "SEASONAL SPECIES TIPS ADJUSTMENTS" in prompt
        # Base pack content still present (seasonal modifiers are additive).
        assert "SPECIES: Whitetail Deer" in prompt
        assert "BEHAVIOR RULES:" in prompt
        # Output schema still intact.
        for k in ("analysis_context", "map_observations", "overlays",
                  "summary", "top_setups", "wind_notes", "best_time",
                  "key_assumptions", "species_tips", "confidence_summary"):
            assert k in prompt

    def test_prompt_emits_unavailable_note_when_out_of_season(self):
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-06-15"},
            image_count=1,
            tier="core",
        )
        assert "SEASONAL CONTEXT: unavailable" in prompt
        assert "Do NOT assume a phase" in prompt
        # Base species block still present.
        assert "SPECIES: Whitetail Deer" in prompt

    def test_prompt_emits_unavailable_note_when_no_inputs(self):
        prompt = assemble_system_prompt(
            "turkey",
            conditions={"wind_direction": "S"},  # no hunt_date, no temp
            image_count=1,
            tier="trial",
        )
        assert "SEASONAL CONTEXT: unavailable" in prompt

    def test_prompt_includes_turkey_peak_breeding_block(self):
        prompt = assemble_system_prompt(
            "turkey",
            conditions={"hunt_date": "2026-04-15"},
            image_count=1,
            tier="pro",
        )
        assert "SEASONAL CONTEXT: Peak Breeding" in prompt
        assert "phase_id=peak_breeding" in prompt

    def test_prompt_includes_hog_hot_weather_block(self):
        prompt = assemble_system_prompt(
            "hog",
            conditions={"hunt_date": "2026-07-04", "temperature": "88F"},
            image_count=2,
            tier="pro",
        )
        # Summer month + hot temp → hot_weather (drought requires both;
        # 88 < 90 so drought doesn't fire, hot_weather does).
        assert "SEASONAL CONTEXT: Hot Weather" in prompt
        assert "phase_id=hot_weather" in prompt

    def test_prompt_fallback_species_has_no_seasonal_block(self):
        # Unknown species → generic fallback pack → no seasonal modifier.
        prompt = assemble_system_prompt(
            "elk",
            conditions={"hunt_date": "2026-11-12"},
            image_count=1,
            tier="pro",
        )
        assert "SEASONAL CONTEXT: unavailable" in prompt
        # Generic fallback pack still present.
        assert "SPECIES: Unspecified Game Species" in prompt
        assert "FALLBACK NOTICE" in prompt

    def test_seasonal_block_preserves_shared_schema_keys(self):
        # Full regression guard — every species × every viable phase.
        test_cases = [
            ("deer", "2026-09-15", "early_season"),
            ("deer", "2026-10-10", "pre_rut"),
            ("deer", "2026-11-10", "rut"),
            ("deer", "2026-12-15", "post_rut"),
            ("deer", "2026-01-20", "late_season"),
            ("turkey", "2026-03-20", "early_season"),
            ("turkey", "2026-04-20", "peak_breeding"),
            ("turkey", "2026-05-10", "late_season"),
            ("hog", "2026-07-04", "hot_weather"),
            ("hog", "2026-01-15", "cold_weather"),
        ]
        for species, date, phase in test_cases:
            prompt = assemble_system_prompt(
                species,
                conditions={"hunt_date": date},
                image_count=1,
                tier="pro",
            )
            # Shared schema keys always present.
            for k in ("analysis_context", "overlays", "top_setups",
                      "confidence_summary"):
                assert k in prompt, f"{species}/{phase}: missing '{k}'"
            # Seasonal block exists AND is from the right species pack.
            assert f"phase_id={phase}" in prompt, f"{species}/{date} did not resolve to {phase}"

    def test_confidence_note_is_emitted_in_seasonal_block(self):
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-11-12"},
            image_count=1,
            tier="pro",
        )
        # The pack's custom confidence note for rut should appear verbatim.
        assert "Peak-rut timing varies" in prompt

    def test_jsononly_instruction_still_present_with_seasonal_block(self):
        prompt = assemble_system_prompt(
            "hog",
            conditions={"hunt_date": "2026-07-04", "temperature": "95F"},
            image_count=1,
            tier="pro",
        )
        assert "valid JSON only" in prompt
        assert "No markdown" in prompt

    def test_tier_image_rules_coexist_with_seasonal_block(self):
        # Multi-image Pro prompt still gets MULTI-IMAGE block + seasonal block.
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-11-12"},
            image_count=3,
            tier="pro",
        )
        assert "MULTI-IMAGE ANALYSIS" in prompt
        assert "SEASONAL CONTEXT: Peak Rut" in prompt


# ============================================================
# Block render sanity
# ============================================================

class TestBlockRendering:
    def test_render_seasonal_modifier_block_shape(self):
        mod = SeasonalModifier(
            phase_id="test_phase",
            name="Test Phase",
            trigger_rules={"months": (1,)},
            behavior_adjustments=("b1",),
            tactical_adjustments=("t1",),
            caution_adjustments=("c1",),
            species_tips_adjustments=("sp1",),
        )
        text = render_seasonal_modifier_block(mod)
        assert "SEASONAL CONTEXT: Test Phase" in text
        assert "phase_id=test_phase" in text
        for line in ("- b1", "- t1", "- c1", "- sp1"):
            assert line in text

    def test_no_seasonal_context_note_is_neutral(self):
        text = render_no_seasonal_context_note()
        assert "SEASONAL CONTEXT: unavailable" in text
        assert "Do NOT assume a phase" in text
