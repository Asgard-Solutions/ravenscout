"""Whitetail integration example.

Demonstrates how to combine the existing whitetail species pack with
the enhanced framework. Run as a script for a full example dump:

    cd /app/backend
    python -m species_prompts.enhanced.whitetail_example

This file is illustrative — it does NOT modify the production
`whitetail.py` pack. It shows how a caller can layer the enhanced
behavior, access, and regional context on top of the legacy prompt.
"""

from __future__ import annotations

from typing import Any, Dict, List

from prompt_builder import assemble_system_prompt
from species_prompts.enhanced import (
    EnhancedHuntContext,
    EnhancedPromptBuilder,
    PressureLevel,
    TerrainType,
)


def build_whitetail_pressure_example() -> Dict[str, Any]:
    """High-pressure midwestern whitetail rifle hunt under a cold front."""
    conditions = {
        "hunt_date": "2026-11-15",
        "time_window": "morning",
        "wind_direction": "NW",
        "temperature": 32,
        "precipitation": None,
        "property_type": "public",
        "region": "Midwest",
        "hunt_weapon": "rifle",
        "hunt_method": "public_land",
        "weather": "cold_front",
    }
    terrain_features: List[Dict[str, Any]] = [
        {"type": "creek", "description": "Drainage runs SW-NE through stand area",
         "visibility": "visible", "proximity_to_bedding": "near"},
        {"type": "ridge", "description": "Spine north of bedding",
         "visibility": "visible", "proximity_to_bedding": "far"},
        {"type": "two_track", "description": "Logging road east of stand",
         "visibility": "visible", "proximity_to_bedding": "adjacent"},
        {"type": "field_edge", "description": "Cut corn field N edge",
         "visibility": "visible", "proximity_to_bedding": "far"},
    ]

    legacy_prompt = assemble_system_prompt(
        animal="whitetail",
        conditions=conditions,
        image_count=1,
        tier="pro",
    )

    ctx = EnhancedHuntContext(
        species="whitetail",
        region_id="midwest",
        pressure_level=PressureLevel.HIGH,
        terrain=TerrainType.AGRICULTURAL,
        weather="cold_front",
        moon_phase=None,
        month=11,
        hunt_style="public_land",
        hunt_weapon="rifle",
        hunt_method="public_land",
        terrain_features=tuple(terrain_features),
        behavior_pattern_types=("pressure_response", "weather_response"),
    )
    enhanced = EnhancedPromptBuilder().build(ctx)

    full_prompt = legacy_prompt + "\n" + enhanced.to_prompt_block()

    return {
        "context": ctx,
        "matched_patterns": [p.pattern_type for p in enhanced.matched_behavior_patterns],
        "interaction_notes": list(enhanced.interaction_notes),
        "legacy_prompt": legacy_prompt,
        "enhanced_extension": enhanced.to_prompt_block(),
        "full_prompt": full_prompt,
    }


def build_whitetail_south_texas_example() -> Dict[str, Any]:
    """South Texas whitetail blind hunt during late rut."""
    conditions = {
        "hunt_date": "2026-12-22",
        "time_window": "evening",
        "wind_direction": "SE",
        "temperature": 58,
        "precipitation": None,
        "property_type": "private",
        "region": "South Texas",
        "hunt_weapon": "rifle",
        "hunt_method": "blind",
        "weather": "cold_front",
    }
    terrain_features = [
        {"type": "sendero", "description": "Main NS sendero crossing",
         "visibility": "visible"},
        {"type": "creek", "description": "Ephemeral draw",
         "visibility": "inferred"},
        {"type": "dense_cover", "description": "Mesquite thicket west of blind",
         "visibility": "visible", "proximity_to_bedding": "adjacent"},
    ]

    legacy = assemble_system_prompt(
        animal="whitetail",
        conditions=conditions,
        image_count=1,
        tier="pro",
    )

    ctx = EnhancedHuntContext(
        species="whitetail",
        region_id="south_texas",
        pressure_level=PressureLevel.MODERATE,
        terrain=TerrainType.BRUSH_COUNTRY,
        weather="cold_front",
        month=12,
        hunt_method="blind",
        hunt_weapon="rifle",
        terrain_features=tuple(terrain_features),
        behavior_pattern_types=("pressure_response", "weather_response"),
    )
    enhanced = EnhancedPromptBuilder().build(ctx)

    return {
        "context": ctx,
        "interaction_notes": list(enhanced.interaction_notes),
        "full_prompt": legacy + "\n" + enhanced.to_prompt_block(),
    }


if __name__ == "__main__":  # pragma: no cover
    import json
    examples = {
        "midwest_pressure": build_whitetail_pressure_example(),
        "south_texas": build_whitetail_south_texas_example(),
    }
    summary = {
        name: {
            "matched_patterns": data.get("matched_patterns", []),
            "interaction_notes": data.get("interaction_notes", []),
            "prompt_length": len(data["full_prompt"]),
        }
        for name, data in examples.items()
    }
    print(json.dumps(summary, indent=2))
