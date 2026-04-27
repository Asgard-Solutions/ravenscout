"""Regression tests for master prompt layering and road/access guidance."""

from prompt_builder import assemble_system_prompt, assemble_user_prompt


CONDITIONS = {
    "hunt_date": "2026-11-12",
    "time_window": "morning",
    "wind_direction": "NW",
    "temperature": "38F",
    "property_type": "public",
    "hunt_weapon": "archery",
    "hunt_method": "blind",
}


def test_master_prompt_has_mandatory_road_access_directives():
    prompt = assemble_system_prompt(
        "deer",
        CONDITIONS,
        image_count=1,
        tier="pro",
    )

    assert "MASTER ANALYSIS DIRECTIVES" in prompt
    assert "MAP ACCESS / ROAD DIRECTIVES" in prompt
    assert "roads, two-tracks, trails" in prompt
    assert "When no roads or trails are visible, do NOT invent them" in prompt
    assert "access_route overlay" in prompt
    assert "Road/access scan is mandatory" in prompt


def test_structured_weapon_and_method_render_as_separate_prompt_layers():
    prompt = assemble_system_prompt(
        "deer",
        CONDITIONS,
        image_count=1,
        tier="pro",
    )

    assert "HUNT CONTEXT RESOLUTION" in prompt
    assert "Weapon: Archery (style_id=archery)" in prompt
    assert "Hunt Style / Method: Ground Blind (style_id=blind)" in prompt
    assert "WEAPON CONTEXT: Archery (Whitetail)" in prompt
    assert "HUNT STYLE CONTEXT: Ground Blind (Whitetail)" in prompt

    species_idx = prompt.index("SPECIES: Whitetail Deer")
    regional_idx = prompt.index("REGIONAL CONTEXT")
    seasonal_idx = prompt.index("SEASONAL CONTEXT")
    master_idx = prompt.index("MASTER ANALYSIS DIRECTIVES")
    weapon_idx = prompt.index("WEAPON CONTEXT")
    method_idx = prompt.index("HUNT STYLE CONTEXT: Ground Blind")
    conditions_idx = prompt.index("HUNT CONDITIONS")
    assert species_idx < regional_idx < seasonal_idx < master_idx < weapon_idx < method_idx < conditions_idx


def test_legacy_single_hunt_style_still_renders_legacy_block():
    prompt = assemble_system_prompt(
        "deer",
        {"hunt_date": "2026-11-12"},
        image_count=1,
        tier="pro",
        hunt_style="archery",
    )

    assert "HUNT STYLE CONTEXT: Archery (Whitetail)" in prompt
    assert "WEAPON CONTEXT: Archery" not in prompt


def test_user_prompt_reinforces_no_visible_road_fallback():
    prompt = assemble_user_prompt("Whitetail Deer", CONDITIONS, image_count=1)

    assert "road/trail-aware entry" in prompt
    assert "If none are visible" in prompt
    assert "best low-impact approach" in prompt
