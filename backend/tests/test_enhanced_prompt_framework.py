"""Tests for the enhanced species prompt framework.

Covers:
  * backward compatibility of `assemble_system_prompt` (legacy mode
    returns byte-identical output when no enhanced flags are passed),
  * behavior framework registry + trigger matching,
  * access analysis ranking + terrain alternatives,
  * enhanced regional registry (all four required regions present),
  * master prompt assembly + cross-module interaction notes,
  * Turkey light pass.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure /app/backend is on sys.path when pytest runs from /app.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from prompt_builder import assemble_system_prompt
from species_prompts.enhanced import (
    AccessRouteRecommendation,
    AccessType,
    EnhancedHuntContext,
    EnhancedPromptBuilder,
    EnvironmentalTrigger,
    PressureLevel,
    StealthLevel,
    TerrainType,
    analyze_access_options,
    build_enhanced_master_prompt,
    create_enhanced_hunt_context,
    generate_terrain_alternatives,
    get_enhanced_behavior_pattern,
    get_enhanced_regional_modifier,
    get_terrain_movement_pattern,
    identify_access_points,
    list_enhanced_behavior_patterns,
    render_enhanced_access_block,
    render_enhanced_behavior_block,
    render_enhanced_regional_block,
)
from species_prompts.enhanced.turkey_light import (
    build_turkey_enhanced_context,
    build_turkey_enhanced_extension,
)


# ----------------------------------------------------------------------
# 1) Backward compatibility — flags OFF must produce the legacy prompt.
# ----------------------------------------------------------------------

BASE_CONDITIONS = {
    "hunt_date": "2026-11-15",
    "time_window": "morning",
    "wind_direction": "NW",
    "temperature": 32,
    "precipitation": None,
    "property_type": "public",
    "region": "Midwest",
}


def test_legacy_prompt_unchanged_when_flags_off():
    """No enhanced flag → byte-identical to pre-enhancement build."""
    prompt = assemble_system_prompt(
        animal="whitetail",
        conditions=BASE_CONDITIONS,
        image_count=1,
        tier="pro",
    )
    assert "ENHANCED PROMPT EXTENSIONS" not in prompt
    assert "ENHANCED BEHAVIOR CONTEXT" not in prompt
    assert "ENHANCED ACCESS ANALYSIS" not in prompt
    assert "ENHANCED REGIONAL CONTEXT" not in prompt


def test_enhanced_prompt_extends_legacy_prompt():
    """With flags on, the legacy prompt must be a strict prefix."""
    legacy = assemble_system_prompt(
        animal="whitetail",
        conditions=BASE_CONDITIONS,
        image_count=1,
        tier="pro",
    )
    enhanced = assemble_system_prompt(
        animal="whitetail",
        conditions=BASE_CONDITIONS,
        image_count=1,
        tier="pro",
        use_enhanced_behavior=True,
        use_enhanced_access=True,
        use_enhanced_regional=True,
        enhanced_pressure_level=PressureLevel.HIGH,
        enhanced_terrain=TerrainType.AGRICULTURAL,
        enhanced_region_id="midwest_agricultural",
        enhanced_terrain_features=[
            {"type": "creek", "description": "Creek E of stand", "visibility": "visible"},
            {"type": "two_track", "description": "Logging spur", "visibility": "visible"},
        ],
    )
    assert enhanced.startswith(legacy)
    assert "ENHANCED PROMPT EXTENSIONS" in enhanced
    assert "ENHANCED BEHAVIOR CONTEXT" in enhanced
    assert "ENHANCED ACCESS ANALYSIS" in enhanced
    assert "ENHANCED REGIONAL CONTEXT" in enhanced


def test_partial_flag_granularity():
    """Only behaviour flag → no access/regional blocks emitted."""
    prompt = assemble_system_prompt(
        animal="whitetail",
        conditions=BASE_CONDITIONS,
        image_count=1,
        tier="pro",
        use_enhanced_behavior=True,
        enhanced_pressure_level=PressureLevel.HIGH,
        enhanced_terrain=TerrainType.AGRICULTURAL,
    )
    assert "ENHANCED PROMPT EXTENSIONS" in prompt
    assert "ENHANCED BEHAVIOR CONTEXT" in prompt
    assert "ENHANCED ACCESS ANALYSIS" not in prompt
    assert "ENHANCED REGIONAL CONTEXT" not in prompt


# ----------------------------------------------------------------------
# 2) Behavior framework
# ----------------------------------------------------------------------


def test_whitetail_pressure_pattern_registered():
    pattern = get_enhanced_behavior_pattern("whitetail", "pressure_response")
    assert pattern is not None
    assert pattern.species == "whitetail"


def test_environmental_trigger_match_logic():
    trig = EnvironmentalTrigger(
        pressure_levels=(PressureLevel.HIGH, PressureLevel.EXTREME),
        weather=("cold_front",),
    )
    assert trig.matches(pressure_level=PressureLevel.HIGH, weather="cold_front")
    assert not trig.matches(pressure_level=PressureLevel.MODERATE, weather="cold_front")
    assert not trig.matches(pressure_level=PressureLevel.HIGH, weather="rain")
    # Empty trigger fields → unconditional match (logical AND over empty set).
    assert EnvironmentalTrigger().matches()


def test_high_pressure_modifications_fire():
    pattern = get_enhanced_behavior_pattern("whitetail", "pressure_response")
    assert pattern is not None
    high_mods = pattern.matching_modifications(pressure_level=PressureLevel.HIGH)
    extreme_mods = pattern.matching_modifications(pressure_level=PressureLevel.EXTREME)
    minimal_mods = pattern.matching_modifications(pressure_level=PressureLevel.MINIMAL)
    assert high_mods, "expected at least one high-pressure modification"
    assert extreme_mods, "expected at least one extreme-pressure modification"
    assert not any(
        "Movement shifts to nocturnal patterns" in c
        for mod in minimal_mods
        for c in mod.behavior_changes
    ), "minimal pressure should not trip the nocturnal-shift modification"


def test_terrain_movement_pattern_returns_bullets():
    bullets = get_terrain_movement_pattern(TerrainType.AGRICULTURAL)
    assert bullets and all(isinstance(line, str) for line in bullets)


def test_render_enhanced_behavior_block_handles_unavailable():
    out = render_enhanced_behavior_block(None)
    assert "ENHANCED BEHAVIOR CONTEXT: unavailable" in out


# ----------------------------------------------------------------------
# 3) Access analysis
# ----------------------------------------------------------------------


def test_identify_access_points_sorts_by_stealth_then_suitability():
    points = identify_access_points([
        {"type": "paved_road", "description": "Main road"},
        {"type": "creek", "description": "Creek bottom"},
        {"type": "two_track", "description": "Spur"},
    ])
    # creek (HIGH) should outrank paved/two_track (LOW/VERY_LOW)
    assert points[0].access_type == AccessType.CREEK_ACCESS
    assert points[0].stealth == StealthLevel.HIGH


def test_identify_access_points_downgrades_when_adjacent_to_bedding():
    points = identify_access_points([
        {"type": "creek", "description": "Creek bottom",
         "proximity_to_bedding": "adjacent"},
    ])
    assert points[0].stealth != StealthLevel.HIGH  # downgraded
    assert any("blow-out risk" in n for n in points[0].notes)


def test_generate_terrain_alternatives_for_forest_creek():
    alts = generate_terrain_alternatives(
        [{"type": "creek"}], "whitetail", terrain=TerrainType.FOREST,
    )
    assert any(a.name.lower().startswith("creek") for a in alts)


def test_analyze_access_options_returns_recommendation():
    rec = analyze_access_options(
        terrain_features=[
            {"type": "creek", "description": "creek E"},
            {"type": "two_track", "description": "logging road"},
        ],
        species="whitetail",
        pressure_level=PressureLevel.HIGH,
        terrain=TerrainType.FOREST,
        hunt_style="public_land",
        hunt_weapon="rifle",
    )
    assert isinstance(rec, AccessRouteRecommendation)
    assert rec.primary_points
    assert rec.alternatives
    assert any("public" in s.lower() for s in rec.species_preferences)


def test_render_enhanced_access_block_handles_no_visible_road():
    rec = analyze_access_options(
        terrain_features=[],
        species="whitetail",
    )
    out = render_enhanced_access_block(rec)
    assert "ENHANCED ACCESS ANALYSIS" in out
    assert "(no roads/trails visible" in out


# ----------------------------------------------------------------------
# 4) Enhanced regional registry
# ----------------------------------------------------------------------


@pytest.mark.parametrize("region_id", [
    "south_texas",
    "colorado_high_country",
    "midwest_agricultural",
    "pacific_northwest",
])
def test_required_regions_registered(region_id):
    mod = get_enhanced_regional_modifier(region_id)
    assert mod is not None, f"missing enhanced regional modifier: {region_id}"
    assert mod.terrain is not None
    assert mod.environmental_factors


def test_enhanced_regional_modifier_extends_base():
    """Enhanced regional must subclass legacy RegionalModifier."""
    from species_prompts.pack import RegionalModifier
    mod = get_enhanced_regional_modifier("midwest_agricultural")
    assert isinstance(mod, RegionalModifier)
    # Inherited fields are still populated.
    assert mod.behavior_adjustments


def test_render_enhanced_regional_block_includes_terrain_and_factors():
    mod = get_enhanced_regional_modifier("south_texas")
    out = render_enhanced_regional_block(mod)
    assert "TERRAIN CHARACTERISTICS" in out
    assert "ENVIRONMENTAL FACTORS" in out
    assert "BASELINE PRESSURE" in out


# ----------------------------------------------------------------------
# 5) Master prompt + cross-module interaction notes
# ----------------------------------------------------------------------


def test_master_prompt_contains_extension_banner():
    ctx = EnhancedHuntContext(
        species="whitetail",
        pressure_level=PressureLevel.HIGH,
        terrain=TerrainType.AGRICULTURAL,
        weather="cold_front",
    )
    block = build_enhanced_master_prompt(ctx)
    assert "ENHANCED PROMPT EXTENSIONS" in block
    assert "INTEGRATION RULES" in block


def test_pressure_baseline_mismatch_emits_interaction_note():
    """Supplied pressure differs from regional baseline → note must fire."""
    ctx = EnhancedHuntContext(
        species="whitetail",
        region_id="midwest_agricultural",  # baseline = MODERATE
        pressure_level=PressureLevel.EXTREME,
        terrain=TerrainType.AGRICULTURAL,
    )
    components = EnhancedPromptBuilder().build(ctx)
    assert any(
        "differs from regional baseline" in note
        for note in components.interaction_notes
    )


def test_cold_front_high_pressure_interaction_note():
    ctx = EnhancedHuntContext(
        species="whitetail",
        region_id="midwest_agricultural",
        pressure_level=PressureLevel.HIGH,
        terrain=TerrainType.AGRICULTURAL,
        weather="cold_front",
    )
    components = EnhancedPromptBuilder().build(ctx)
    assert any(
        "highest-leverage sit" in note
        for note in components.interaction_notes
    )


def test_create_enhanced_hunt_context_pulls_month_from_hunt_date():
    ctx = create_enhanced_hunt_context(
        species="whitetail",
        conditions={"hunt_date": "2026-11-15"},
    )
    assert ctx.month == 11


# ----------------------------------------------------------------------
# 6) Turkey light pass
# ----------------------------------------------------------------------


def test_turkey_light_extension_block_renders():
    block = build_turkey_enhanced_extension(
        conditions={"hunt_date": "2026-04-15"},
        region_id="southeast_us",
        pressure_level=PressureLevel.HIGH,
        terrain_features=[
            {"type": "ridge", "description": "Roost ridge"},
        ],
    )
    assert "ENHANCED PROMPT EXTENSIONS" in block
    assert "ENHANCED BEHAVIOR CONTEXT: turkey" in block


def test_turkey_light_context_defaults():
    ctx = build_turkey_enhanced_context(
        conditions={"hunt_date": "2026-04-15"},
        terrain_features=[],
    )
    assert ctx.species == "turkey"
    assert ctx.pressure_level == PressureLevel.MODERATE
    assert ctx.behavior_pattern_types == ("pressure_response",)
