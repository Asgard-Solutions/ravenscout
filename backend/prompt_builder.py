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
    get_hunt_style_label,
    is_method_style,
    is_weapon_style,
    normalize_hunt_method,
    normalize_hunt_style,
    normalize_hunt_weapon,
    render_hunt_style_modifier_block,
    render_no_hunt_style_context_note,
    render_no_regional_context_note,
    render_no_seasonal_context_note,
    render_regional_modifier_block,
    render_seasonal_modifier_block,
    resolve_effective_region,
    resolve_hunt_style_modifier,
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


def build_master_analysis_directives_block() -> str:
    return """
MASTER ANALYSIS DIRECTIVES:
  - Build recommendations by layering evidence in this order: visible map features first, then species rules, regional context, seasonal context, weapon context, hunt-style context, and stated hunt conditions.
  - If two prompt layers conflict, favor the more specific user-selected context and visible map evidence; lower confidence and explain the conflict in key_assumptions.
  - Every setup must be species-specific: expected movement, shot opportunity, wind risk, pressure risk, and access route should match the animal being hunted.
  - Do not let a strong weapon or hunt-style modifier override core animal behavior. Tune the setup to the method, but keep the animal-specific movement model in control.

MAP ACCESS / ROAD DIRECTIVES:
  - Before selecting setups, inspect the map for roads, two-tracks, trails, parking lots, gates, field entrances, bridges, creek crossings, boat ramps, powerlines, pipelines, section lines, property-boundary hints, and obvious map-edge entry options.
  - Treat visible roads and trails as BOTH possible legal access points and possible pressure sources. Road-proximate setups should carry higher pressure_risk unless the species/style context says otherwise.
  - When roads, trails, or access points are visible, include them in map_observations when tactically relevant and anchor entry_strategy / exit_strategy to the safest low-impact access.
  - When no roads or trails are visible, do NOT invent them. Give the best approach from the map edge using terrain, cover, wind, thermals, water, and the least-disruptive route; call out the no-visible-road limitation in key_assumptions.
  - Prefer access routes that avoid crossing bedding cover, roost zones, feeding edges, wallows, water approaches, open skyline, or expected animal travel before the sit.
  - Include an access_route overlay for the primary approach when a route can be reasonably mapped from visible evidence. If the route is only inferred from a map edge, lower confidence and state that clearly."""


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
      "entry_strategy": "<how to approach from visible road/trail/access or, if none visible, best low-impact map-edge approach>",
      "exit_strategy": "<how to leave using visible access or a conservative no-road exit without alerting game>",
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
  - Road/access scan is mandatory: if roads, trails, gates, parking, ramps, or field entrances are visible, mention tactically relevant ones in map_observations and reflect pressure/access implications in top_setups.
  - If no roads or trails are visible, do not invent access. Each top_setup entry_strategy must say the best approach is inferred from the map edge / terrain and include that limitation in key_assumptions.
  - At least one overlay should be an access_route when a plausible route can be mapped from visible evidence; if no route can be mapped, explain why confidence is lower.
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

    base += "\nPriority: identify the best tactical setups with safe access, road/trail-aware entry, and downwind positioning."
    base += "\nAlways inspect visible roads/trails/access points first. If none are visible, recommend the best low-impact approach from map edge/topography and state the limitation."
    base += "\nReturn JSON only. Follow the v2 schema exactly."

    return base


def _present(value: Optional[str]) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _resolve_hunt_context(
    conditions: dict,
    *,
    hunt_style: Optional[str] = None,
    hunt_weapon: Optional[str] = None,
    hunt_method: Optional[str] = None,
) -> dict:
    """Resolve legacy and structured hunting-context inputs.

    Older callers send one `hunt_style` id. Newer clients can send
    `hunt_weapon` and `hunt_method` separately. This resolver keeps
    both paths compatible and returns canonical ids only.
    """
    raw_weapon = hunt_weapon if hunt_weapon is not None else conditions.get("hunt_weapon")
    raw_method = hunt_method if hunt_method is not None else conditions.get("hunt_method")
    raw_legacy = hunt_style if hunt_style is not None else conditions.get("hunt_style")

    weapon_id = normalize_hunt_weapon(raw_weapon) if _present(raw_weapon) else None
    method_id = normalize_hunt_method(raw_method) if _present(raw_method) else None
    legacy_id = normalize_hunt_style(raw_legacy) if _present(raw_legacy) else None

    structured = _present(raw_weapon) or _present(raw_method)

    if legacy_id and not weapon_id and is_weapon_style(legacy_id):
        weapon_id = legacy_id
    if legacy_id and not method_id and is_method_style(legacy_id):
        method_id = legacy_id

    return {
        "structured": structured,
        "legacy_id": legacy_id,
        "weapon_id": weapon_id,
        "method_id": method_id,
        "raw_weapon": raw_weapon,
        "raw_method": raw_method,
        "raw_legacy": raw_legacy,
    }


def _render_selected_context_block(
    pack: SpeciesPromptPack,
    style_id: Optional[str],
    *,
    context_label: str,
) -> str:
    label = get_hunt_style_label(style_id)
    modifier = resolve_hunt_style_modifier(pack, style_id)
    if modifier is not None and style_id:
        return render_hunt_style_modifier_block(
            modifier,
            style_id=style_id,
            source="user_selected",
            context_label=context_label,
        )
    if style_id and label:
        return render_no_hunt_style_context_note(
            context_label,
            selected_label=label,
            style_id=style_id,
        )
    return render_no_hunt_style_context_note(context_label)


def build_hunt_context_resolution_block(context: dict) -> str:
    weapon_id = context.get("weapon_id")
    method_id = context.get("method_id")
    legacy_id = context.get("legacy_id")
    weapon_label = get_hunt_style_label(weapon_id) or "unspecified"
    method_label = get_hunt_style_label(method_id) or "unspecified"
    legacy_label = get_hunt_style_label(legacy_id) or "unspecified"
    weapon_suffix = f" (style_id={weapon_id})" if weapon_id else ""
    method_suffix = f" (style_id={method_id})" if method_id else ""
    legacy_suffix = f" (style_id={legacy_id})" if legacy_id else ""
    source = "structured_weapon_method" if context.get("structured") else "legacy_hunt_style"
    return f"""
HUNT CONTEXT RESOLUTION:
  Source: {source}
  Weapon: {weapon_label}{weapon_suffix}
  Hunt Style / Method: {method_label}{method_suffix}
  Legacy Hunt Style: {legacy_label}{legacy_suffix}
  Apply weapon and hunt-style / method contexts additively. Weapon controls ethical range, sightline, shot-window, and recovery assumptions; hunt style controls concealment, mobility, pressure, and setup geometry."""


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
    hunt_style: Optional[str] = None,
    hunt_weapon: Optional[str] = None,
    hunt_method: Optional[str] = None,
) -> str:
    """Assemble the complete system prompt from modular parts.

    Pipeline:
        base
        -> species pack
        -> regional modifier (or neutral 'generic' notice)
        -> seasonal modifier (region-aware, or neutral 'unavailable' notice)
        -> master map/access directives
        -> weapon modifier + hunt-style/method modifier (or neutral notices)
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

    `hunt_weapon` and `hunt_method` may be passed explicitly or read
    from `conditions['hunt_weapon']` / `conditions['hunt_method']`.
    `hunt_style` remains supported as the legacy single-field input.
    Values are normalized to canonical ids; anything unrecognized
    falls back to the neutral 'unspecified' notice.
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

    # 4) Weapon / hunt-style context. New clients pass weapon and
    #    method separately; older clients pass one legacy hunt_style.
    hunt_context = _resolve_hunt_context(
        conditions,
        hunt_style=hunt_style,
        hunt_weapon=hunt_weapon,
        hunt_method=hunt_method,
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
    if hunt_context["structured"]:
        hunt_style_block = "\n".join([
            build_hunt_context_resolution_block(hunt_context),
            _render_selected_context_block(
                pack,
                hunt_context["weapon_id"],
                context_label="WEAPON",
            ),
            _render_selected_context_block(
                pack,
                hunt_context["method_id"],
                context_label="HUNT STYLE",
            ),
        ])
    else:
        # Back-compat path: preserve the legacy single HUNT STYLE block
        # shape when older callers do not send structured fields.
        legacy_id = hunt_context["legacy_id"]
        legacy_mod = resolve_hunt_style_modifier(pack, legacy_id)
        hunt_style_block = (
            render_hunt_style_modifier_block(
                legacy_mod,
                style_id=legacy_id,
                source="user_selected",
            )
            if legacy_mod is not None and legacy_id
            else render_no_hunt_style_context_note()
        )

    parts = [
        build_base_system_prompt(),
        build_species_prompt_pack_block(pack),
        regional_block,
        seasonal_block,
        build_master_analysis_directives_block(),
        hunt_style_block,
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
