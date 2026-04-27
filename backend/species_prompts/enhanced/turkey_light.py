"""Light enhanced pass for Turkey — wires the existing turkey pack into
the enhanced framework without touching the production turkey.py.

The production-grade Turkey enhancements live in `behavior_framework.py`
(pressure_response pattern) and `regional_modifiers.py` (per-region
overlays). This module exposes a small convenience builder so server
code can call a single function without composing the context manually.

Usage::

    from species_prompts.enhanced.turkey_light import build_turkey_enhanced_extension

    extension_block = build_turkey_enhanced_extension(
        conditions=conditions,
        region_id="southeast_us",
        pressure_level=PressureLevel.HIGH,
        terrain_features=terrain_features,
    )
"""

from __future__ import annotations

from typing import Any, Mapping, Optional, Sequence

from .behavior_framework import PressureLevel, TerrainType
from .master_prompt import (
    EnhancedHuntContext,
    EnhancedPromptBuilder,
    create_enhanced_hunt_context,
)


def build_turkey_enhanced_context(
    conditions: Mapping[str, Any],
    *,
    region_id: Optional[str] = None,
    pressure_level: Optional[PressureLevel] = None,
    terrain: Optional[TerrainType] = None,
    terrain_features: Optional[Sequence[Mapping[str, Any]]] = None,
) -> EnhancedHuntContext:
    """Build an EnhancedHuntContext pre-configured for Turkey.

    Defaults pressure to MODERATE and pattern types to ('pressure_response',)
    — the production turkey pack already covers weather framing, so the
    light pass focuses on pressure response.
    """
    return create_enhanced_hunt_context(
        species="turkey",
        conditions=conditions,
        terrain_features=terrain_features,
        region_id=region_id,
        pressure_level=pressure_level or PressureLevel.MODERATE,
        terrain=terrain,
        behavior_pattern_types=("pressure_response",),
    )


def build_turkey_enhanced_extension(
    conditions: Mapping[str, Any],
    *,
    region_id: Optional[str] = None,
    pressure_level: Optional[PressureLevel] = None,
    terrain: Optional[TerrainType] = None,
    terrain_features: Optional[Sequence[Mapping[str, Any]]] = None,
) -> str:
    """Build the appended enhanced prompt block for Turkey."""
    ctx = build_turkey_enhanced_context(
        conditions,
        region_id=region_id,
        pressure_level=pressure_level,
        terrain=terrain,
        terrain_features=terrain_features,
    )
    return EnhancedPromptBuilder().build(ctx).to_prompt_block()
