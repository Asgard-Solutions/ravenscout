"""
Raven Scout — Modular Prompt Builder
Tier-aware, image-count-aware prompt generation for hunt analysis.

Species-specific behavior is provided by `species_prompts/` (see the
package docstring). This module stays focused on the *shared*
pipeline: base rules, hunt conditions, image context, JSON output
schema, constraints, and user-prompt assembly.
"""

from typing import Optional, Tuple

from species_prompts import (
    RegionResolution,
    SpeciesPromptPack,
    render_no_regional_context_note,
    render_no_seasonal_context_note,
    render_regional_modifier_block,
    render_seasonal_modifier_block,
    resolve_effective_region,
    resolve_regional_modifier,
    resolve_seasonal_modifier,
    resolve_species_pack,
)
from species_prompts.pack import render_species_prompt_block

# --- Constants ---

TIERS_ENUM = ("trial", "core", "pro")

EVIDENCE_LEVELS = {
    1: "limited",
    2: "moderate",
}
# 3+ = "high"

FEATURE_TYPES = [
    "bedding_cover", "food_source", "water", "ridge", "saddle", "bench",
    "draw", "funnel", "edge", "crossing", "open_area", "road", "trail",
    "access_point", "pressure_zone", "unknown",
]

OVERLAY_TYPES = ["stand", "corridor", "access_route", "avoid"]

SETUP_TYPES = ["stand", "saddle", "blind", "observation"]

RISK_LEVELS = ["low", "medium", "high", "unknown"]


def get_evidence_level(image_count: int) -> str:
    if image_count >= 3:
        return "high"
    return EVIDENCE_LEVELS.get(image_count, "limited")


# --- Prompt Builder Functions ---

def build_base_system_prompt() -> str:
    return """You are Raven Scout, an expert hunting strategist AI built by Asgard Solutions. You analyze map imagery and environmental data to produce tactical hunting setup recommendations.

Your role is decision-support only. You do not guarantee outcomes. You provide your best assessment based on available imagery and stated conditions.

You MUST respond with valid JSON only. No markdown. No code fences. No commentary outside the JSON object."""


def build_species_rules(animal: str, species_data: Optional[dict] = None) -> str:
    """Render the species-specific prompt fragment.

    Delegates to the `species_prompts` registry so each species
    gets its targeted behavior/tactical/caution/tips block instead
    of the old single generic behavior-rules list.

    The legacy `species_data` dict is accepted (and ignored) for
    backwards compatibility with callers that haven't migrated yet.
    """
    _ = species_data  # legacy arg — intentionally unused
    pack = resolve_species_pack(animal)
    return render_species_prompt_block(pack)


def build_species_prompt_pack_block(pack: SpeciesPromptPack) -> str:
    """Render a pre-resolved pack directly. Thin wrapper kept for
    explicit callers / tests."""
    return render_species_prompt_block(pack)


def build_hunt_conditions_block(conditions: dict) -> str:
    return f"""
HUNT CONDITIONS:
  Date: {conditions.get('hunt_date', 'Not specified')}
  Time Window: {conditions.get('time_window', 'morning')}
  Wind Direction: {conditions.get('wind_direction', 'Not specified')}
  Temperature: {conditions.get('temperature') or 'Not specified'}
  Precipitation: {conditions.get('precipitation') or 'None'}
  Property Type: {conditions.get('property_type') or 'public'}
  Region: {conditions.get('region') or 'Not specified'}"""


def build_image_context_block(image_count: int, tier: str) -> str:
    if image_count <= 1:
        return """
IMAGE CONTEXT:
  You have been provided 1 image (the primary map).
  Analyze ONLY features that are directly visible in this image.
  Do NOT assume terrain features, boundaries, access points, or hidden features that are not visible.
  If a feature is inferred rather than observed, reduce confidence and note it in the evidence array.
  Prefer conservative, uncertainty-aware recommendations over precise speculation.
  Lower confidence for: inferred bedding, food sources, funnels, hunting pressure, and travel routes that are not clearly visible."""

    # Multi-image (Pro only)
    return f"""
IMAGE CONTEXT (MULTI-IMAGE ANALYSIS):
  You have been provided {image_count} images.
  Image 1 is the PRIMARY map — ALL overlay coordinates (x_percent, y_percent) MUST reference this image only.
  Images 2–{image_count} are SUPPORTING reference views of the same area (e.g., satellite, topo, aerial, or marked maps).
  
  Cross-reference all images to build a richer understanding of terrain:
  - Use satellite imagery for vegetation density, water, clearings, tree lines
  - Use topo imagery for elevation, ridgelines, saddles, draws, benches
  - Use street/access imagery for roads, trails, property boundaries, access points
  
  Prefer conclusions that are supported across multiple images.
  If images show conflicting or ambiguous terrain, note the conflict in key_assumptions.
  Increase confidence when multiple images corroborate a feature.
  Coordinates remain relative to Image 1 (primary) only."""


def build_output_schema_block() -> str:
    return """
OUTPUT SCHEMA (v2):
Return this exact JSON structure. Do not omit any keys. Use empty arrays [] instead of dropping fields.

{
  "schema_version": "v2",
  "analysis_context": {
    "image_count": <int>,
    "evidence_level": "limited|moderate|high",
    "used_multi_image_correlation": <bool>
  },
  "map_observations": [
    {
      "id": "obs_1",
      "feature_type": "bedding_cover|food_source|water|ridge|saddle|bench|draw|funnel|edge|crossing|open_area|road|trail|access_point|pressure_zone|unknown",
      "description": "<what you observe>",
      "x_percent": <5-95>,
      "y_percent": <5-95>,
      "confidence": <0.0-1.0>,
      "evidence": ["<what supports this observation>"]
    }
  ],
  "overlays": [
    {
      "id": "ov_1",
      "type": "stand|corridor|access_route|avoid",
      "label": "<short tactical label>",
      "reason": "<why this overlay matters>",
      "x_percent": <5-95>,
      "y_percent": <5-95>,
      "radius_percent": <2-15>,
      "confidence": <0.0-1.0>,
      "based_on": ["obs_1"]
    }
  ],
  "summary": "<2-3 sentence tactical overview>",
  "top_setups": [
    {
      "rank": <1-3>,
      "setup_name": "<descriptive name>",
      "setup_type": "stand|saddle|blind|observation",
      "x_percent": <5-95>,
      "y_percent": <5-95>,
      "target_movement": "<expected game movement pattern>",
      "shot_opportunity": "<shot type and range>",
      "entry_strategy": "<how to approach without alerting game>",
      "exit_strategy": "<how to leave after the hunt>",
      "wind_risk": "low|medium|high",
      "thermals_risk": "low|medium|high|unknown",
      "pressure_risk": "low|medium|high",
      "best_window": "<optimal time window>",
      "confidence": <0.0-1.0>,
      "why_this_works": ["<reason 1>", "<reason 2>"]
    }
  ],
  "wind_notes": {
    "prevailing_wind_analysis": "<analysis of wind impact>",
    "danger_zones": ["<zone description>"],
    "best_downwind_sides": ["<direction>"],
    "wind_shift_risk": "low|medium|high"
  },
  "best_time": {
    "primary_window": "<best time>",
    "secondary_window": "<backup time>",
    "explanation": "<why these times>"
  },
  "key_assumptions": [
    {
      "assumption": "<what was assumed>",
      "impact": "low|medium|high"
    }
  ],
  "species_tips": ["<tip 1>", "<tip 2>"],
  "confidence_summary": {
    "overall_confidence": <0.0-1.0>,
    "main_limitations": ["<limitation 1>"]
  }
}"""


def build_output_constraints() -> str:
    return """
STRICT CONSTRAINTS:
  - Return valid JSON only. No markdown, no code fences, no extra text before or after the JSON.
  - Do not omit required keys. Use empty arrays [] for missing lists.
  - x_percent and y_percent must be between 5 and 95 (within map bounds).
  - confidence values must be between 0.0 and 1.0.
  - All coordinates are relative to the PRIMARY image only.
  - If imagery does not support a conclusion, lower confidence and document uncertainty in key_assumptions.
  - Provide 3-6 overlays covering stands, corridors, access routes, and avoid zones.
  - Provide 1-3 top_setups ranked by tactical advantage.
  - Provide 2-5 map_observations describing key terrain features you identified.
  - species_tips MUST follow the SPECIES TIPS GUIDANCE from the species block above — keep them species-specific, not generic."""


def build_user_prompt(species_name: str, conditions: dict, image_count: int) -> str:
    time_window = conditions.get("time_window", "morning")
    wind = conditions.get("wind_direction", "unknown")
    property_type = conditions.get("property_type", "public")
    region = conditions.get("region", "")

    base = f"Analyze the attached hunt map{'s' if image_count > 1 else ''} for a {species_name} {time_window} hunt."

    if image_count > 1:
        base += "\nUse the primary image (Image 1) as the coordinate reference."
        base += "\nUse all additional images as supporting terrain context."

    base += f"\nWind from {wind}. Property: {property_type}."
    if region:
        base += f" Region: {region}."

    base += "\nPriority: identify the best tactical setups with safe access and downwind positioning."
    base += "\nReturn JSON only. Follow the v2 schema exactly."

    return base


# --- Full Prompt Assembly ---

def assemble_system_prompt(
    animal: str,
    conditions: dict,
    image_count: int,
    tier: str,
    species_data: Optional[dict] = None,
    *,
    gps_coords: Optional[Tuple[float, float]] = None,
    map_centroid: Optional[Tuple[float, float]] = None,
    manual_region_override: Optional[str] = None,
    region_resolution: Optional[RegionResolution] = None,
) -> str:
    """Assemble the complete system prompt from modular parts.

    Pipeline:
        base
        -> species pack
        -> regional modifier (or neutral 'generic' notice)
        -> seasonal modifier (region-aware, or neutral 'unavailable' notice)
        -> hunt conditions
        -> image/tier context
        -> output schema
        -> constraints

    Region resolution uses `resolve_effective_region` with this
    precedence: manual override > GPS > map centroid > default.
    Callers may pre-resolve and pass `region_resolution` directly
    (e.g. to reuse a resolution already computed for persistence).

    The regional modifier can additionally shift seasonal phase
    boundaries via its `season_adjustments` field — the seasonal
    selector consults it before matching a phase.
    """
    _ = species_data  # legacy — ignored
    pack = resolve_species_pack(animal)

    # 1) Region resolution (caller can pre-resolve).
    if region_resolution is None:
        gps_lat, gps_lon = (gps_coords or (None, None))
        region_resolution = resolve_effective_region(
            gps_lat=gps_lat,
            gps_lon=gps_lon,
            map_centroid=map_centroid,
            manual_override=manual_region_override,
        )

    # 2) Species-scoped regional modifier (may be None even if region
    #    is resolved — a species might not bother with some buckets).
    regional_mod = resolve_regional_modifier(pack, region_resolution.region_id)

    # 3) Seasonal modifier, region-aware.
    seasonal_mod = resolve_seasonal_modifier(
        pack, conditions, regional_modifier=regional_mod,
    )

    regional_block = (
        render_regional_modifier_block(
            regional_mod,
            region_id=region_resolution.region_id,
            region_label=region_resolution.region_label,
            source=region_resolution.source,
        )
        if regional_mod is not None
        else render_no_regional_context_note(
            region_id=region_resolution.region_id,
            region_label=region_resolution.region_label,
            source=region_resolution.source,
        )
    )
    seasonal_block = (
        render_seasonal_modifier_block(seasonal_mod)
        if seasonal_mod is not None
        else render_no_seasonal_context_note()
    )

    parts = [
        build_base_system_prompt(),
        build_species_prompt_pack_block(pack),
        regional_block,
        seasonal_block,
        build_hunt_conditions_block(conditions),
        build_image_context_block(image_count, tier),
        build_output_schema_block(),
        build_output_constraints(),
    ]
    return "\n".join(parts)


def assemble_user_prompt(
    species_name: str,
    conditions: dict,
    image_count: int,
) -> str:
    """Assemble the user message text."""
    return build_user_prompt(species_name, conditions, image_count)


def get_repair_prompt(raw_output: str) -> str:
    """Generate a repair prompt when the LLM response fails validation."""
    return f"""Your previous response failed schema validation. The raw output was:

{raw_output[:2000]}

Please correct this response to match the v2 schema EXACTLY. Return valid JSON only.
Key requirements:
- Include "schema_version": "v2"
- Include all required keys: analysis_context, map_observations, overlays, summary, top_setups, wind_notes, best_time, key_assumptions, species_tips, confidence_summary
- x_percent/y_percent: 5-95, confidence: 0.0-1.0
- No markdown, no code fences
- Use empty arrays [] for missing lists

Return the corrected JSON now."""
