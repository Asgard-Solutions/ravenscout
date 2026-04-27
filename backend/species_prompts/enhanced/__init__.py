"""Raven Scout — Enhanced species prompt framework.

Isolated, additive enhancement layer that supplements (never
replaces) the existing `species_prompts` package. Everything in this
sub-package is OFF by default; callers opt in via explicit flags on
`assemble_system_prompt(...)` or by using
`EnhancedPromptBuilder.build(...)` directly.

Design rules — read before changing anything in here:
  * Enhanced output is appended to the legacy prompt; the legacy
    pipeline shape stays intact when no enhanced flags are enabled.
  * `EnhancedRegionalModifier` SUBCLASSES the existing
    `RegionalModifier` — it does not rename or shadow it.
  * The enhanced behavior, access, and regional modules are pure
    Python data + render functions. No I/O, no DB, no LLM calls.
  * All public symbols are re-exported here so callers do a single
    `from species_prompts.enhanced import …`.
"""

from .behavior_framework import (
    PressureLevel,
    TerrainType,
    EnvironmentalTrigger,
    BehaviorModification,
    EnhancedBehaviorPattern,
    get_enhanced_behavior_pattern,
    get_terrain_movement_pattern,
    list_enhanced_behavior_patterns,
    render_enhanced_behavior_block,
)
from .access_analysis import (
    AccessType,
    StealthLevel,
    AccessPoint,
    TerrainAlternative,
    AccessRouteRecommendation,
    analyze_access_options,
    identify_access_points,
    generate_terrain_alternatives,
    render_enhanced_access_block,
)
from .regional_modifiers import (
    TerrainCharacteristics,
    EnvironmentalFactor,
    EnhancedRegionalModifier,
    ENHANCED_REGIONAL_REGISTRY,
    get_enhanced_regional_modifier,
    render_enhanced_regional_block,
)
from .master_prompt import (
    EnhancedHuntContext,
    MasterPromptComponents,
    EnhancedPromptBuilder,
    create_enhanced_hunt_context,
    build_enhanced_master_prompt,
    integrate_environmental_factors,
)

__all__ = [
    # behavior framework
    "PressureLevel",
    "TerrainType",
    "EnvironmentalTrigger",
    "BehaviorModification",
    "EnhancedBehaviorPattern",
    "get_enhanced_behavior_pattern",
    "get_terrain_movement_pattern",
    "list_enhanced_behavior_patterns",
    "render_enhanced_behavior_block",
    # access analysis
    "AccessType",
    "StealthLevel",
    "AccessPoint",
    "TerrainAlternative",
    "AccessRouteRecommendation",
    "analyze_access_options",
    "identify_access_points",
    "generate_terrain_alternatives",
    "render_enhanced_access_block",
    # regional
    "TerrainCharacteristics",
    "EnvironmentalFactor",
    "EnhancedRegionalModifier",
    "ENHANCED_REGIONAL_REGISTRY",
    "get_enhanced_regional_modifier",
    "render_enhanced_regional_block",
    # master
    "EnhancedHuntContext",
    "MasterPromptComponents",
    "EnhancedPromptBuilder",
    "create_enhanced_hunt_context",
    "build_enhanced_master_prompt",
    "integrate_environmental_factors",
]
