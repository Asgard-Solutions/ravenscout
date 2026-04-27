"""Enhanced master prompt assembly.

Glues the behavior framework, access analysis, and enhanced regional
modifiers together into a single appended block on top of the legacy
prompt, plus a structured `EnhancedHuntContext` for callers that want
to reason about the inputs before assembly.

The enhanced master prompt does NOT replace `prompt_builder.assemble_system_prompt`.
It is invoked from inside that function when `use_enhanced_*` flags
are True (additive output), or directly via `EnhancedPromptBuilder.build`
for tests / standalone analysis.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Mapping, Optional, Sequence, Tuple

from .access_analysis import (
    AccessRouteRecommendation,
    analyze_access_options,
    render_enhanced_access_block,
)
from .behavior_framework import (
    EnhancedBehaviorPattern,
    PressureLevel,
    TerrainType,
    get_enhanced_behavior_pattern,
    render_enhanced_behavior_block,
)
from .regional_modifiers import (
    EnhancedRegionalModifier,
    get_enhanced_regional_modifier,
    render_enhanced_regional_block,
)


@dataclass(frozen=True)
class EnhancedHuntContext:
    """Comprehensive structured hunt scenario fed to the enhanced layer."""
    species: str
    region_id: Optional[str] = None
    pressure_level: Optional[PressureLevel] = None
    terrain: Optional[TerrainType] = None
    weather: Optional[str] = None
    moon_phase: Optional[str] = None
    month: Optional[int] = None
    hunt_style: Optional[str] = None
    hunt_weapon: Optional[str] = None
    hunt_method: Optional[str] = None
    terrain_features: Tuple[Mapping[str, Any], ...] = ()
    behavior_pattern_types: Tuple[str, ...] = ("pressure_response", "weather_response")

    def with_overrides(self, **kwargs: Any) -> "EnhancedHuntContext":
        return _replace_dataclass(self, **kwargs)


@dataclass(frozen=True)
class MasterPromptComponents:
    """All enhanced prompt fragments + the structured inputs that built them."""
    behavior_blocks: Tuple[str, ...]
    access_block: Optional[str]
    regional_block: Optional[str]
    matched_behavior_patterns: Tuple[EnhancedBehaviorPattern, ...]
    access_recommendation: Optional[AccessRouteRecommendation]
    enhanced_regional: Optional[EnhancedRegionalModifier]
    interaction_notes: Tuple[str, ...] = ()

    def to_prompt_block(self) -> str:
        """Concatenate all components into a single appended prompt block.

        The block always begins with a stable banner so the LLM can spot
        when enhanced context is active.
        """
        parts: List[str] = [
            "",
            "================================================================",
            "ENHANCED PROMPT EXTENSIONS (additive — do NOT replace species pack)",
            "================================================================",
            "INTEGRATION RULES:",
            "  - These extensions LAYER ON TOP of the species, regional, seasonal,",
            "    and hunt-style blocks already provided. Existing rules remain",
            "    authoritative on species behavior and base setup geometry.",
            "  - When extensions and a base block conflict, prefer the more",
            "    specific user-supplied / map-derived signal and lower confidence.",
            "  - Pressure / terrain / weather modifications are TRIGGERED — do",
            "    not invent a trigger that was not supplied.",
        ]
        if self.regional_block:
            parts.append(self.regional_block)
        for blk in self.behavior_blocks:
            parts.append(blk)
        if self.access_block:
            parts.append(self.access_block)
        if self.interaction_notes:
            parts.append("")
            parts.append("CROSS-MODULE INTERACTION NOTES:")
            for note in self.interaction_notes:
                parts.append(f"  - {note}")
        parts.append("")
        parts.append("================================================================")
        parts.append("END ENHANCED PROMPT EXTENSIONS")
        parts.append("================================================================")
        return "\n".join(parts)


class EnhancedPromptBuilder:
    """Builds the enhanced extension block for a hunt context."""

    def build(self, ctx: EnhancedHuntContext) -> MasterPromptComponents:
        # 1) Match behavior patterns for the requested types.
        matched: List[EnhancedBehaviorPattern] = []
        behavior_blocks: List[str] = []
        for ptype in ctx.behavior_pattern_types or ():
            pattern = get_enhanced_behavior_pattern(ctx.species, ptype)
            if pattern is None:
                continue
            matched.append(pattern)
            behavior_blocks.append(render_enhanced_behavior_block(
                pattern,
                pressure_level=ctx.pressure_level,
                terrain=ctx.terrain,
                weather=ctx.weather,
                moon_phase=ctx.moon_phase,
                month=ctx.month,
            ))

        # 2) Access analysis.
        access_rec: Optional[AccessRouteRecommendation] = None
        access_block: Optional[str] = None
        if ctx.terrain_features:
            access_rec = analyze_access_options(
                ctx.terrain_features,
                species=ctx.species,
                pressure_level=ctx.pressure_level,
                terrain=ctx.terrain,
                hunt_style=ctx.hunt_style or ctx.hunt_method,
                hunt_weapon=ctx.hunt_weapon,
            )
            access_block = render_enhanced_access_block(access_rec)

        # 3) Enhanced regional overlay.
        enhanced_regional: Optional[EnhancedRegionalModifier] = None
        regional_block: Optional[str] = None
        if ctx.region_id:
            enhanced_regional = get_enhanced_regional_modifier(ctx.region_id)
            if enhanced_regional is not None:
                regional_block = render_enhanced_regional_block(enhanced_regional)

        # 4) Cross-module interaction notes.
        interaction_notes = self._derive_interaction_notes(
            ctx,
            enhanced_regional=enhanced_regional,
            access_rec=access_rec,
            matched_patterns=matched,
        )

        return MasterPromptComponents(
            behavior_blocks=tuple(behavior_blocks),
            access_block=access_block,
            regional_block=regional_block,
            matched_behavior_patterns=tuple(matched),
            access_recommendation=access_rec,
            enhanced_regional=enhanced_regional,
            interaction_notes=tuple(interaction_notes),
        )

    # ------------------------------------------------------------------
    # Cross-module reasoning
    # ------------------------------------------------------------------

    def _derive_interaction_notes(
        self,
        ctx: EnhancedHuntContext,
        *,
        enhanced_regional: Optional[EnhancedRegionalModifier],
        access_rec: Optional[AccessRouteRecommendation],
        matched_patterns: Sequence[EnhancedBehaviorPattern],
    ) -> List[str]:
        notes: List[str] = []

        # Pressure baseline reconciliation.
        if (
            enhanced_regional is not None
            and enhanced_regional.pressure_baseline is not None
            and ctx.pressure_level is None
        ):
            notes.append(
                f"No explicit pressure_level supplied; defaulting to regional "
                f"baseline '{enhanced_regional.pressure_baseline.value}' from "
                f"{enhanced_regional.name}."
            )
        elif (
            enhanced_regional is not None
            and enhanced_regional.pressure_baseline is not None
            and ctx.pressure_level is not None
            and ctx.pressure_level != enhanced_regional.pressure_baseline
        ):
            notes.append(
                f"Supplied pressure_level '{ctx.pressure_level.value}' differs "
                f"from regional baseline '{enhanced_regional.pressure_baseline.value}'. "
                f"Honor the supplied level but lower confidence on "
                f"region-baseline-derived recommendations."
            )

        # Terrain inferred from region when not supplied.
        if (
            enhanced_regional is not None
            and enhanced_regional.terrain_type is not None
            and ctx.terrain is None
        ):
            notes.append(
                f"No explicit terrain supplied; defaulting to regional terrain "
                f"type '{enhanced_regional.terrain_type.value}' from "
                f"{enhanced_regional.name} for movement reasoning."
            )

        # Weapon / method compatibility hints.
        compat = _weapon_terrain_compatibility(
            species=ctx.species,
            hunt_weapon=ctx.hunt_weapon,
            hunt_method=ctx.hunt_method or ctx.hunt_style,
            terrain=ctx.terrain or (enhanced_regional.terrain_type if enhanced_regional else None),
        )
        notes.extend(compat)

        # Access vs pressure interaction.
        if (
            access_rec is not None
            and ctx.pressure_level in (PressureLevel.HIGH, PressureLevel.EXTREME)
            and access_rec.primary_points
        ):
            notes.append(
                "High pressure + visible access points: prefer the second- "
                "or third-best access point rather than the most obvious one "
                "(other hunters will use the obvious one)."
            )

        # Weather-pressure interaction.
        weather_patterns = [
            p for p in matched_patterns
            if p.pattern_type == "weather_response"
        ]
        if (
            weather_patterns
            and ctx.weather == "cold_front"
            and ctx.pressure_level in (PressureLevel.HIGH, PressureLevel.EXTREME)
        ):
            notes.append(
                "Cold front under high pressure is the highest-leverage sit "
                "window: the front partially overrides pressure-driven "
                "nocturnal collapse — setups can be slightly more aggressive "
                "than baseline pressure rules suggest."
            )

        return notes


# ---------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------

def create_enhanced_hunt_context(
    species: str,
    conditions: Mapping[str, Any],
    terrain_features: Optional[Sequence[Mapping[str, Any]]] = None,
    *,
    region_id: Optional[str] = None,
    pressure_level: Optional[PressureLevel] = None,
    terrain: Optional[TerrainType] = None,
    behavior_pattern_types: Optional[Sequence[str]] = None,
) -> EnhancedHuntContext:
    """Build an EnhancedHuntContext from the legacy conditions dict.

    Pulls weather / month / moon out of the conditions when present.
    """
    weather = _infer_weather_token(conditions)
    month = _infer_month(conditions)
    moon = conditions.get("moon_phase") if isinstance(conditions, Mapping) else None

    return EnhancedHuntContext(
        species=species,
        region_id=region_id,
        pressure_level=pressure_level,
        terrain=terrain,
        weather=weather,
        moon_phase=moon if isinstance(moon, str) else None,
        month=month,
        hunt_style=conditions.get("hunt_style") if isinstance(conditions, Mapping) else None,
        hunt_weapon=conditions.get("hunt_weapon") if isinstance(conditions, Mapping) else None,
        hunt_method=conditions.get("hunt_method") if isinstance(conditions, Mapping) else None,
        terrain_features=tuple(terrain_features or ()),
        behavior_pattern_types=tuple(behavior_pattern_types) if behavior_pattern_types else (
            "pressure_response", "weather_response",
        ),
    )


def build_enhanced_master_prompt(ctx: EnhancedHuntContext) -> str:
    """Build the appended prompt block for a hunt context."""
    return EnhancedPromptBuilder().build(ctx).to_prompt_block()


def integrate_environmental_factors(ctx: EnhancedHuntContext) -> MasterPromptComponents:
    """Run the full enhanced pipeline and return the structured result."""
    return EnhancedPromptBuilder().build(ctx)


# ---------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------

def _replace_dataclass(obj, **kwargs):
    """Tiny shim around `dataclasses.replace` that tolerates non-existent keys."""
    from dataclasses import fields, replace as dc_replace
    valid = {f.name for f in fields(obj)}
    safe = {k: v for k, v in kwargs.items() if k in valid}
    return dc_replace(obj, **safe)


def _infer_weather_token(conditions: Mapping[str, Any]) -> Optional[str]:
    if not isinstance(conditions, Mapping):
        return None
    explicit = conditions.get("weather")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip().lower()
    # Coarse heuristic: precipitation present → "rain", explicit cold-front flag
    # via a string like "front" anywhere in conditions["notes"] or so.
    if conditions.get("precipitation"):
        return "rain"
    return None


def _infer_month(conditions: Mapping[str, Any]) -> Optional[int]:
    if not isinstance(conditions, Mapping):
        return None
    raw = conditions.get("hunt_date") or conditions.get("date")
    if isinstance(raw, str) and len(raw) >= 7 and raw[4] == "-":
        try:
            return int(raw[5:7])
        except (TypeError, ValueError):
            return None
    if isinstance(raw, (int, float)) and 1 <= int(raw) <= 12:
        return int(raw)
    return None


def _weapon_terrain_compatibility(
    *,
    species: str,
    hunt_weapon: Optional[str],
    hunt_method: Optional[str],
    terrain: Optional[TerrainType],
) -> List[str]:
    species = (species or "").strip().lower()
    weapon = (hunt_weapon or "").strip().lower()
    method = (hunt_method or "").strip().lower()
    out: List[str] = []
    if not weapon and not method:
        return out

    if weapon == "archery" and terrain == TerrainType.PRAIRIE:
        out.append(
            "Archery + prairie terrain is a low-compatibility match — favor "
            "draws / coulees / shelterbelts and lower confidence on open-field "
            "setups."
        )
    if weapon == "shotgun" and terrain == TerrainType.MOUNTAIN:
        out.append(
            "Shotgun in mountain terrain is range-limited — setups must engineer "
            "sub-50-yard cover-bound shot lanes; long-range glassing setups are "
            "out of scope."
        )
    if method == "saddle" and terrain == TerrainType.WETLAND:
        out.append(
            "Saddle in wetland terrain depends on usable trees on bedding "
            "islands / dike edges — verify candidate trees before committing."
        )
    if method == "spot_and_stalk" and terrain in (TerrainType.FOREST, TerrainType.WETLAND):
        out.append(
            "Spot-and-stalk in dense terrain has a low confidence ceiling — "
            "glassing is suppressed; lean toward stand or ambush setups."
        )
    if species == "turkey" and terrain == TerrainType.MOUNTAIN:
        out.append(
            "Mountain turkeys (Merriam's especially) move farther per day than "
            "eastern flock patterns; expect 0.5-2 mile relocations during a sit."
        )
    return out
