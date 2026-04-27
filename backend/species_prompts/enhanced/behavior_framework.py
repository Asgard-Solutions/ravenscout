"""Enhanced animal behavior framework.

Supplements the species packs with environment-responsive behavior
patterns that vary with hunting pressure, terrain type, weather, and
moon phase.

The framework is intentionally data-driven — it does not run model
inference. It exposes a registry of `EnhancedBehaviorPattern` objects
the prompt builder can pluck and render into a prompt block.

Usage::

    from species_prompts.enhanced import (
        get_enhanced_behavior_pattern,
        render_enhanced_behavior_block,
        PressureLevel,
        TerrainType,
    )

    pattern = get_enhanced_behavior_pattern(
        species="whitetail",
        pattern_type="pressure_response",
    )
    block = render_enhanced_behavior_block(
        pattern,
        pressure_level=PressureLevel.HIGH,
        terrain=TerrainType.FOREST,
    )
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple


class PressureLevel(str, Enum):
    """Coarse classification of hunter / human pressure on the area."""
    MINIMAL = "minimal"
    MODERATE = "moderate"
    HIGH = "high"
    EXTREME = "extreme"


class TerrainType(str, Enum):
    """Coarse terrain bucket. Tied to species movement archetypes."""
    AGRICULTURAL = "agricultural"
    FOREST = "forest"
    MOUNTAIN = "mountain"
    WETLAND = "wetland"
    BRUSH_COUNTRY = "brush_country"
    PRAIRIE = "prairie"
    SUBURBAN_EDGE = "suburban_edge"
    MIXED = "mixed"


@dataclass(frozen=True)
class EnvironmentalTrigger:
    """A condition under which a behavior modification activates.

    All fields are optional. The matcher returns True when *every*
    populated field matches the supplied hunt context (logical AND).
    """
    pressure_levels: Tuple[PressureLevel, ...] = ()
    terrain_types: Tuple[TerrainType, ...] = ()
    weather: Tuple[str, ...] = ()        # e.g. ("cold_front", "steady_high", "rain")
    moon_phases: Tuple[str, ...] = ()    # e.g. ("new", "full", "first_quarter")
    months: Tuple[int, ...] = ()         # 1..12
    notes: str = ""

    def matches(
        self,
        *,
        pressure_level: Optional[PressureLevel] = None,
        terrain: Optional[TerrainType] = None,
        weather: Optional[str] = None,
        moon_phase: Optional[str] = None,
        month: Optional[int] = None,
    ) -> bool:
        if self.pressure_levels and (pressure_level not in self.pressure_levels):
            return False
        if self.terrain_types and (terrain not in self.terrain_types):
            return False
        if self.weather and (weather not in self.weather):
            return False
        if self.moon_phases and (moon_phase not in self.moon_phases):
            return False
        if self.months and (month not in self.months):
            return False
        return True


@dataclass(frozen=True)
class BehaviorModification:
    """How animal behavior shifts when a trigger fires.

    Lists are intentionally short and tactical — these flow into the
    LLM as bullet adjustments on top of the species pack.
    """
    trigger: EnvironmentalTrigger
    behavior_changes: Tuple[str, ...] = ()
    tactical_adjustments: Tuple[str, ...] = ()
    confidence_note: str = ""


@dataclass(frozen=True)
class EnhancedBehaviorPattern:
    """Complete pattern for a single (species, pattern_type) combo.

    `pattern_type` examples: ``pressure_response``,
    ``weather_response``, ``terrain_movement``, ``moon_response``.
    """
    species: str
    pattern_type: str
    summary: str
    modifications: Tuple[BehaviorModification, ...] = ()
    confidence_note: str = (
        "Enhanced behavior modeling is heuristic. Lower overall "
        "confidence when the trigger fields are inferred rather than "
        "observed."
    )

    def matching_modifications(
        self,
        *,
        pressure_level: Optional[PressureLevel] = None,
        terrain: Optional[TerrainType] = None,
        weather: Optional[str] = None,
        moon_phase: Optional[str] = None,
        month: Optional[int] = None,
    ) -> List[BehaviorModification]:
        return [
            mod for mod in self.modifications
            if mod.trigger.matches(
                pressure_level=pressure_level,
                terrain=terrain,
                weather=weather,
                moon_phase=moon_phase,
                month=month,
            )
        ]


# ---------------------------------------------------------------------
# Registry — keyed by (species, pattern_type)
# ---------------------------------------------------------------------

_WHITETAIL_PRESSURE = EnhancedBehaviorPattern(
    species="whitetail",
    pattern_type="pressure_response",
    summary=(
        "Whitetail behavior collapses toward nocturnal, refuge-seeking "
        "patterns as hunting pressure rises. Daylight movement, route "
        "predictability, and bedding-cover use all degrade quickly."
    ),
    modifications=(
        BehaviorModification(
            trigger=EnvironmentalTrigger(
                pressure_levels=(PressureLevel.MODERATE,),
            ),
            behavior_changes=(
                "Daylight movement compresses into the first 30 minutes "
                "after legal light and the last 30 minutes before dark.",
                "Mature bucks shift bedding 100-300 yards deeper into "
                "the thickest available cover.",
            ),
            tactical_adjustments=(
                "Anchor stand selection to refuge-edge funnels rather than "
                "obvious staging areas.",
                "Use wind-quiet access well before legal shooting light.",
            ),
        ),
        BehaviorModification(
            trigger=EnvironmentalTrigger(
                pressure_levels=(PressureLevel.HIGH, PressureLevel.EXTREME),
            ),
            behavior_changes=(
                "Movement shifts to nocturnal patterns within 24-48 hours.",
                "Bedding moves to the thickest, most remote cover available.",
                "Travel corridors switch to secondary routes avoiding hunter access.",
                "Feeding behavior becomes extremely cautious with minimal "
                "daylight activity.",
            ),
            tactical_adjustments=(
                "Target pressure refuge areas away from obvious access points.",
                "Use unconventional timing to avoid competition with other hunters.",
                "Setup in escape corridors where deer flee when pushed by pressure.",
                "Plan for extended periods between encounters due to nocturnal shift.",
            ),
            confidence_note=(
                "Under high or extreme pressure, even well-placed setups "
                "often produce no daylight encounters. Lower confidence on "
                "any setup that depends on predictable daylight movement."
            ),
        ),
    ),
)

_WHITETAIL_WEATHER = EnhancedBehaviorPattern(
    species="whitetail",
    pattern_type="weather_response",
    summary=(
        "Whitetail daylight movement keys hard on barometric pressure "
        "swings, frontal passages, and post-front cold/clear evenings."
    ),
    modifications=(
        BehaviorModification(
            trigger=EnvironmentalTrigger(weather=("cold_front",)),
            behavior_changes=(
                "Daylight movement increases sharply 12-36 hours after a "
                "cold-front passage, especially the first cold-clear evening.",
                "Mature bucks may travel during legal daylight even in "
                "otherwise pressured areas.",
            ),
            tactical_adjustments=(
                "Prioritize evening food-edge / staging setups in the 24h "
                "after frontal passage.",
                "Wind risk on these days is amplified — verify the "
                "setup remains downwind of the bedding-to-food corridor.",
            ),
        ),
        BehaviorModification(
            trigger=EnvironmentalTrigger(weather=("steady_high",)),
            behavior_changes=(
                "Multi-day stable high pressure suppresses daylight movement; "
                "deer feed more at night and bed longer.",
            ),
            tactical_adjustments=(
                "Lower confidence in daylight encounter forecasts.",
                "Lean morning setups close to bedding rather than evening "
                "food-edge plays.",
            ),
        ),
    ),
)

_TURKEY_PRESSURE = EnhancedBehaviorPattern(
    species="turkey",
    pattern_type="pressure_response",
    summary=(
        "Pressured gobblers go silent on the roost, flush wider after "
        "flydown, and avoid open strut zones the next morning. Calling "
        "strategy must compress, not amplify."
    ),
    modifications=(
        BehaviorModification(
            trigger=EnvironmentalTrigger(
                pressure_levels=(PressureLevel.HIGH, PressureLevel.EXTREME),
            ),
            behavior_changes=(
                "Roost gobbling decreases sharply; birds may flydown silent.",
                "Strut zones shift to thicker, less-glassable cover.",
                "Birds hang up on calling earlier and at greater distance.",
            ),
            tactical_adjustments=(
                "Setup tighter to the roost than usual but with cover-rich "
                "escape lanes — no open field plays.",
                "Use minimal calling cadence; let the bird search rather "
                "than answering aggressive sequences.",
                "Plan a late-morning move-and-locate after the first flydown "
                "window goes quiet.",
            ),
        ),
    ),
)

_REGISTRY: Dict[Tuple[str, str], EnhancedBehaviorPattern] = {
    (p.species, p.pattern_type): p
    for p in (_WHITETAIL_PRESSURE, _WHITETAIL_WEATHER, _TURKEY_PRESSURE)
}


# ---------------------------------------------------------------------
# Terrain movement patterns — separate (not species-keyed) registry
# ---------------------------------------------------------------------

_TERRAIN_MOVEMENT: Dict[TerrainType, Tuple[str, ...]] = {
    TerrainType.AGRICULTURAL: (
        "Movement is dominated by harvest timing — pre-harvest deer hold "
        "interior cover, post-harvest movement explodes onto cut fields.",
        "Travel corridors hug fence lines, woodlots, and creek drainages "
        "between scattered cover blocks.",
        "Pressure concentrates on visible woodlots; mature deer skirt them.",
    ),
    TerrainType.FOREST: (
        "Movement keys on terrain pinches — saddles, benches, ridge ends, "
        "creek crossings, blowdown funnels.",
        "Bedding-to-food travel is shorter, denser, and more wind-sensitive.",
        "Logging-road / two-track travel is BOTH pressure source and access "
        "option simultaneously.",
    ),
    TerrainType.MOUNTAIN: (
        "Thermals dominate — morning downslope, evening upslope. Setups "
        "and approaches must respect both.",
        "Game funnels at saddles, benches, and avalanche-slide edges; "
        "basin transitions are high-value.",
        "Vertical separation often beats horizontal — gaining 200-400 "
        "feet of elevation can flip wind and visibility.",
    ),
    TerrainType.WETLAND: (
        "Travel skirts open water on subtle high-ground spines. Trails "
        "are often narrower than satellite suggests.",
        "Bedding islands, levees, and dike edges drive movement; access "
        "is the limiting factor.",
        "Sound carries far over water — quiet access is critical.",
    ),
    TerrainType.BRUSH_COUNTRY: (
        "Travel follows senderos, ranch roads, and water sources more "
        "than forest funnels.",
        "Heat dictates daylight movement — cool fronts disproportionately "
        "unlock activity.",
        "Visibility is short outside cleared lanes; setups should engineer "
        "the shot window, not hope for it.",
    ),
    TerrainType.PRAIRIE: (
        "Movement keys on coulees, draws, shelterbelts, and isolated "
        "timber — true open prairie travel is brief.",
        "Glassing is viable; spot-and-stalk and ambush at terrain pinches "
        "both work.",
        "Wind is constant and strong — setups must be wind-bullet-proof.",
    ),
    TerrainType.SUBURBAN_EDGE: (
        "Movement is heavily nocturnal; refuge cover is small, high-value, "
        "and predictable to the deer.",
        "Human-activity rhythm (school buses, dog walkers, trash trucks) "
        "shapes daily patterns more than calendar-based rules.",
        "Pressure is constant but low-intensity; deer are tolerant of "
        "static human presence, not novel disturbance.",
    ),
    TerrainType.MIXED: (
        "Treat each sub-terrain on its own terms; do not blend logic across "
        "clearly distinct cover blocks.",
        "Transition edges (ag-to-timber, timber-to-wetland) often outperform "
        "interior plays in mixed terrain.",
    ),
}


# ---------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------

def get_enhanced_behavior_pattern(
    species: str,
    pattern_type: str,
) -> Optional[EnhancedBehaviorPattern]:
    """Lookup an enhanced behavior pattern by species + pattern_type."""
    if not species or not pattern_type:
        return None
    return _REGISTRY.get((species.strip().lower(), pattern_type.strip().lower()))


def list_enhanced_behavior_patterns(
    species: Optional[str] = None,
) -> List[EnhancedBehaviorPattern]:
    """List all registered enhanced patterns, optionally filtered by species."""
    if species is None:
        return list(_REGISTRY.values())
    species = species.strip().lower()
    return [p for p in _REGISTRY.values() if p.species == species]


def get_terrain_movement_pattern(terrain: TerrainType) -> Tuple[str, ...]:
    """Return the canonical movement bullets for a terrain type."""
    return _TERRAIN_MOVEMENT.get(terrain, ())


def _bullets(items) -> str:
    items = tuple(items or ())
    return "\n".join(f"  - {line}" for line in items) if items else "  - (none)"


def render_enhanced_behavior_block(
    pattern: Optional[EnhancedBehaviorPattern],
    *,
    pressure_level: Optional[PressureLevel] = None,
    terrain: Optional[TerrainType] = None,
    weather: Optional[str] = None,
    moon_phase: Optional[str] = None,
    month: Optional[int] = None,
) -> str:
    """Render an enhanced behavior block, including matched modifications.

    If `pattern` is None, an explicit "unavailable" notice is rendered
    so the prompt shape stays stable even when no pattern is registered.
    """
    if pattern is None:
        return (
            "\nENHANCED BEHAVIOR CONTEXT: unavailable\n"
            "NOTE: No enhanced behavior pattern registered for this "
            "species/context. Treat species-pack rules as authoritative."
        )

    matched = pattern.matching_modifications(
        pressure_level=pressure_level,
        terrain=terrain,
        weather=weather,
        moon_phase=moon_phase,
        month=month,
    )

    behavior_changes: List[str] = []
    tactical_adjustments: List[str] = []
    confidence_lines: List[str] = []
    for mod in matched:
        behavior_changes.extend(mod.behavior_changes)
        tactical_adjustments.extend(mod.tactical_adjustments)
        if mod.confidence_note:
            confidence_lines.append(mod.confidence_note)

    terrain_lines = (
        get_terrain_movement_pattern(terrain) if terrain is not None else ()
    )

    parts = [
        "",
        f"ENHANCED BEHAVIOR CONTEXT: {pattern.species} ({pattern.pattern_type})",
        f"NOTE: {pattern.confidence_note}",
        f"SUMMARY: {pattern.summary}",
        "ENVIRONMENTAL TRIGGERS APPLIED:",
        _bullets(_describe_active_triggers(
            pressure_level=pressure_level,
            terrain=terrain,
            weather=weather,
            moon_phase=moon_phase,
            month=month,
        )),
        "BEHAVIOR ADJUSTMENTS (apply IN ADDITION to species pack):",
        _bullets(behavior_changes),
        "TACTICAL ADJUSTMENTS:",
        _bullets(tactical_adjustments),
    ]
    if terrain_lines:
        parts.append(f"TERRAIN MOVEMENT NOTES ({terrain.value}):")
        parts.append(_bullets(terrain_lines))
    if confidence_lines:
        parts.append("CONFIDENCE NOTES:")
        parts.append(_bullets(confidence_lines))
    return "\n".join(parts)


def _describe_active_triggers(
    *,
    pressure_level: Optional[PressureLevel],
    terrain: Optional[TerrainType],
    weather: Optional[str],
    moon_phase: Optional[str],
    month: Optional[int],
) -> List[str]:
    out: List[str] = []
    if pressure_level is not None:
        out.append(f"pressure_level: {pressure_level.value}")
    if terrain is not None:
        out.append(f"terrain: {terrain.value}")
    if weather is not None:
        out.append(f"weather: {weather}")
    if moon_phase is not None:
        out.append(f"moon_phase: {moon_phase}")
    if month is not None:
        out.append(f"month: {month}")
    if not out:
        out.append("(no triggers supplied — using base pattern only)")
    return out
