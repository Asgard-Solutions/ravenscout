"""Enhanced access route analysis.

Provides terrain-based access reasoning when no obvious roads/trails
appear on the map, ranks access points by stealth, and produces
species-specific access preferences keyed to weapon and method.

This module is purely advisory — it produces structured data that
the master prompt builder appends to the prompt. The legacy MAP
ACCESS / ROAD DIRECTIVES in `prompt_builder.py` continue to drive
the LLM's primary access scan; the enhanced block layers on top of
it with concrete fallback alternatives and stealth ranking.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Mapping, Optional, Sequence, Tuple

from .behavior_framework import PressureLevel, TerrainType


class AccessType(str, Enum):
    PAVED_ROAD = "paved_road"
    GRAVEL_ROAD = "gravel_road"
    TWO_TRACK = "two_track"
    LOGGING_ROAD = "logging_road"
    FOOT_TRAIL = "foot_trail"
    POWERLINE = "powerline"
    FENCE_LINE = "fence_line"
    CREEK_ACCESS = "creek_access"
    RIDGE_ACCESS = "ridge_access"
    DRAW_ACCESS = "draw_access"
    FIELD_EDGE = "field_edge"
    BOAT_RAMP = "boat_ramp"
    DENSE_COVER_STALK = "dense_cover_stalk"
    UNKNOWN = "unknown"


class StealthLevel(str, Enum):
    """How concealed a route is from the animal's perspective."""
    VERY_HIGH = "very_high"
    HIGH = "high"
    MODERATE = "moderate"
    LOW = "low"
    VERY_LOW = "very_low"


@dataclass(frozen=True)
class AccessPoint:
    """A single candidate access point identified on the map."""
    access_type: AccessType
    description: str
    stealth: StealthLevel
    suitability: float                # 0.0..1.0
    notes: Tuple[str, ...] = ()


@dataclass(frozen=True)
class TerrainAlternative:
    """A terrain-driven access alternative for when no roads are visible."""
    name: str
    description: str
    stealth: StealthLevel
    suitability: float                # 0.0..1.0
    success_factors: Tuple[str, ...] = ()
    risk_factors: Tuple[str, ...] = ()
    equipment_notes: Tuple[str, ...] = ()
    timing_notes: Tuple[str, ...] = ()


@dataclass(frozen=True)
class AccessRouteRecommendation:
    """Complete recommendation — ranked points, alternatives, contingencies."""
    primary_points: Tuple[AccessPoint, ...] = ()
    alternatives: Tuple[TerrainAlternative, ...] = ()
    contingencies: Tuple[str, ...] = ()
    species_preferences: Tuple[str, ...] = ()
    confidence_note: str = (
        "Access analysis is heuristic. When no roads are visible, ALL "
        "alternatives carry inferred-route uncertainty; lower confidence "
        "and document the limitation in key_assumptions."
    )


# ---------------------------------------------------------------------
# Stealth ranking heuristics
# ---------------------------------------------------------------------

_BASE_STEALTH: Mapping[AccessType, StealthLevel] = {
    AccessType.PAVED_ROAD: StealthLevel.VERY_LOW,
    AccessType.GRAVEL_ROAD: StealthLevel.LOW,
    AccessType.TWO_TRACK: StealthLevel.LOW,
    AccessType.LOGGING_ROAD: StealthLevel.LOW,
    AccessType.FOOT_TRAIL: StealthLevel.MODERATE,
    AccessType.POWERLINE: StealthLevel.MODERATE,
    AccessType.FENCE_LINE: StealthLevel.MODERATE,
    AccessType.CREEK_ACCESS: StealthLevel.HIGH,
    AccessType.RIDGE_ACCESS: StealthLevel.MODERATE,
    AccessType.DRAW_ACCESS: StealthLevel.HIGH,
    AccessType.FIELD_EDGE: StealthLevel.LOW,
    AccessType.BOAT_RAMP: StealthLevel.HIGH,
    AccessType.DENSE_COVER_STALK: StealthLevel.VERY_HIGH,
    AccessType.UNKNOWN: StealthLevel.MODERATE,
}


# ---------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------

def identify_access_points(
    terrain_features: Sequence[Mapping[str, object]],
) -> List[AccessPoint]:
    """Project a list of map-feature dicts onto AccessPoint records.

    Each feature dict accepts:
      - ``type``: one of `AccessType` values (string), or a feature
        type from `prompt_builder.FEATURE_TYPES` we know maps cleanly.
      - ``description``: short text
      - ``visibility``: ``visible`` | ``inferred`` (defaults to visible)
      - ``proximity_to_bedding``: ``adjacent`` | ``near`` | ``far`` |
        ``unknown`` (defaults to unknown) — downgrades stealth when
        adjacent / near.
    """
    out: List[AccessPoint] = []
    for feat in terrain_features or ():
        try:
            raw_type = str(feat.get("type", "")).strip().lower()
        except AttributeError:
            continue
        access_type = _coerce_access_type(raw_type)
        if access_type is None:
            continue

        description = str(feat.get("description", "")).strip() or access_type.value.replace("_", " ")
        visibility = str(feat.get("visibility", "visible")).strip().lower()
        proximity = str(feat.get("proximity_to_bedding", "unknown")).strip().lower()

        stealth = _BASE_STEALTH.get(access_type, StealthLevel.MODERATE)
        suitability = 0.7
        notes: List[str] = []

        if visibility == "inferred":
            suitability -= 0.2
            notes.append("Route is INFERRED, not visible — lower confidence.")
        if proximity == "adjacent":
            stealth = _downgrade_stealth(stealth, steps=2)
            suitability -= 0.2
            notes.append("Adjacent to likely bedding — high blow-out risk.")
        elif proximity == "near":
            stealth = _downgrade_stealth(stealth, steps=1)
            suitability -= 0.1
            notes.append("Within bumping distance of bedding — manage scent and noise.")

        out.append(AccessPoint(
            access_type=access_type,
            description=description,
            stealth=stealth,
            suitability=max(0.0, min(1.0, suitability)),
            notes=tuple(notes),
        ))

    out.sort(
        key=lambda p: (
            -_stealth_score(p.stealth),
            -p.suitability,
        )
    )
    return out


def generate_terrain_alternatives(
    terrain_features: Sequence[Mapping[str, object]],
    species: str,
    *,
    terrain: Optional[TerrainType] = None,
) -> List[TerrainAlternative]:
    """Produce species-aware fallback access plans when no roads are visible.

    `terrain_features` may indicate creek drainages, ridges, fence lines,
    or dense cover. `terrain` is the broad bucket; combined they produce
    alternative plans the LLM should consider.
    """
    species = (species or "").strip().lower()
    species_priors: Tuple[str, ...] = ()
    if species == "whitetail":
        species_priors = (
            "Avoid crossing food-edge or staging cover during access.",
            "Wind discipline trumps shortest-path — add 200-400 yards if needed.",
        )
    elif species == "turkey":
        species_priors = (
            "Roost-aware approach — do not skyline, do not call within 80 yards before flydown.",
            "Quiet footfall on dry leaves matters more than speed.",
        )

    feature_set = {
        str(f.get("type", "")).strip().lower()
        for f in (terrain_features or ())
        if isinstance(f, Mapping)
    }

    alts: List[TerrainAlternative] = []

    if "creek" in feature_set or "draw" in feature_set or terrain == TerrainType.FOREST:
        alts.append(TerrainAlternative(
            name="Creek drainage approach",
            description=(
                "Use water sound to mask footfall and the cut bank for visual "
                "cover. Step in/out of water at hard-bottom transitions only."
            ),
            stealth=StealthLevel.HIGH,
            suitability=0.8,
            success_factors=(
                "Wind upcanyon or quartering; dry boots crossing at gravel bars.",
                "Approach in low light; exit before light change reveals movement.",
            ) + species_priors,
            risk_factors=(
                "High water or recent rain converts this to a noise risk — "
                "reroute if creek is loud or muddy.",
            ),
            equipment_notes=(
                "Knee-high boots, headlamp on red, single trekking pole for "
                "slick rock.",
            ),
            timing_notes=(
                "30-45 minutes before legal light — longer than a road approach "
                "because of the slower pace.",
            ),
        ))

    if "ridge" in feature_set or terrain == TerrainType.MOUNTAIN:
        alts.append(TerrainAlternative(
            name="Ridge line approach",
            description=(
                "Use the ridge spine for a thermal-favorable approach. Stay "
                "off the spine when crossing potential glassing arcs."
            ),
            stealth=StealthLevel.MODERATE,
            suitability=0.7,
            success_factors=(
                "Morning downslope thermals carry scent away from likely bedding below.",
                "Pace is faster than creek approach — useful for last-minute setups.",
            ) + species_priors,
            risk_factors=(
                "Skyline exposure on bald sections — drop off the spine when crossing.",
                "Evening upslope thermals reverse the advantage — plan exit accordingly.",
            ),
            equipment_notes=(
                "Wind-checker / milkweed for thermal verification at every transition.",
            ),
            timing_notes=(
                "Use morning approach only; switch to draw or creek access "
                "for evening sits.",
            ),
        ))

    if "field" in feature_set or terrain == TerrainType.AGRICULTURAL:
        alts.append(TerrainAlternative(
            name="Field-edge approach using fence lines",
            description=(
                "Use fence lines, hedgerows, and crop transitions as a linear "
                "cover corridor between parking and the stand."
            ),
            stealth=StealthLevel.MODERATE,
            suitability=0.65,
            success_factors=(
                "Stay on the downwind side of the fence; do not silhouette "
                "against the open field.",
                "Pre-walked / mowed trail along the fence avoids unexpected noise.",
            ) + species_priors,
            risk_factors=(
                "Mature deer often stage along fence lines pre-dark — may "
                "bump the very deer you intend to hunt.",
            ),
            timing_notes=(
                "Heavy pre-light buffer for evening sits; mornings should use "
                "a cover-deeper alternative.",
            ),
        ))

    if "dense_cover" in feature_set or terrain == TerrainType.BRUSH_COUNTRY:
        alts.append(TerrainAlternative(
            name="Dense cover stalk through timber",
            description=(
                "Slow, very-low-impact stalk through cover. Best when the "
                "setup is close to the truck or the stand is mobile (saddle)."
            ),
            stealth=StealthLevel.VERY_HIGH,
            suitability=0.55,
            success_factors=(
                "Pace under 0.5 mph; stop every 20 yards to glass and listen.",
                "Wet leaves / damp ground multiply success rate — plan around weather.",
            ) + species_priors,
            risk_factors=(
                "Encounter risk with bedded animals during approach — setups "
                "closer than 200 yards from likely beds carry blow-out risk.",
            ),
            equipment_notes=(
                "Soft-sole boots, no exposed metal, head net / gloves to break "
                "hand-face contrast.",
            ),
            timing_notes=(
                "Add 60-90 minutes to the approach budget vs. a road plan.",
            ),
        ))

    alts.sort(key=lambda a: (-_stealth_score(a.stealth), -a.suitability))
    return alts


def analyze_access_options(
    terrain_features: Sequence[Mapping[str, object]],
    species: str,
    *,
    pressure_level: Optional[PressureLevel] = None,
    terrain: Optional[TerrainType] = None,
    hunt_style: Optional[str] = None,
    hunt_weapon: Optional[str] = None,
) -> AccessRouteRecommendation:
    """Produce a structured access recommendation for the prompt.

    The function never throws — unrecognized inputs degrade to an
    empty recommendation with the standard confidence note attached.
    """
    points = tuple(identify_access_points(terrain_features))
    alternatives = tuple(generate_terrain_alternatives(
        terrain_features, species, terrain=terrain,
    ))

    contingencies = _build_contingencies(
        pressure_level=pressure_level,
        has_visible_road=any(
            p.access_type in (
                AccessType.PAVED_ROAD,
                AccessType.GRAVEL_ROAD,
                AccessType.TWO_TRACK,
                AccessType.LOGGING_ROAD,
            )
            for p in points
        ),
    )

    species_prefs = _species_access_preferences(
        species=species,
        hunt_style=hunt_style,
        hunt_weapon=hunt_weapon,
    )

    return AccessRouteRecommendation(
        primary_points=points,
        alternatives=alternatives,
        contingencies=tuple(contingencies),
        species_preferences=tuple(species_prefs),
    )


def render_enhanced_access_block(rec: Optional[AccessRouteRecommendation]) -> str:
    """Render an `AccessRouteRecommendation` into a prompt block."""
    if rec is None:
        return (
            "\nENHANCED ACCESS CONTEXT: unavailable\n"
            "NOTE: No enhanced access analysis was supplied. Use the "
            "legacy MAP ACCESS / ROAD DIRECTIVES as the sole guide."
        )

    parts: List[str] = [
        "",
        "ENHANCED ACCESS ANALYSIS:",
        f"NOTE: {rec.confidence_note}",
    ]

    parts.append("PRIMARY ACCESS POINTS (ranked: stealth desc, suitability desc):")
    if rec.primary_points:
        for ap in rec.primary_points:
            parts.append(
                f"  - [{ap.access_type.value}] {ap.description} "
                f"— stealth={ap.stealth.value}, suitability={ap.suitability:.2f}"
            )
            for note in ap.notes:
                parts.append(f"      • {note}")
    else:
        parts.append("  - (no roads/trails visible — use terrain alternatives below)")

    parts.append("TERRAIN-BASED ALTERNATIVES (used when roads are not visible):")
    if rec.alternatives:
        for alt in rec.alternatives:
            parts.append(
                f"  - {alt.name} — stealth={alt.stealth.value}, "
                f"suitability={alt.suitability:.2f}"
            )
            parts.append(f"      • {alt.description}")
            for ok in alt.success_factors:
                parts.append(f"      ✓ {ok}")
            for risk in alt.risk_factors:
                parts.append(f"      ✗ {risk}")
            if alt.timing_notes:
                for tnote in alt.timing_notes:
                    parts.append(f"      ⏱ {tnote}")
            if alt.equipment_notes:
                for enote in alt.equipment_notes:
                    parts.append(f"      🎒 {enote}")
    else:
        parts.append("  - (no terrain alternatives produced)")

    if rec.species_preferences:
        parts.append("SPECIES-SPECIFIC ACCESS PREFERENCES:")
        for line in rec.species_preferences:
            parts.append(f"  - {line}")

    if rec.contingencies:
        parts.append("CONTINGENCIES:")
        for line in rec.contingencies:
            parts.append(f"  - {line}")

    return "\n".join(parts)


# ---------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------

_STR_TO_ACCESS_TYPE: Mapping[str, AccessType] = {
    "paved_road": AccessType.PAVED_ROAD,
    "gravel_road": AccessType.GRAVEL_ROAD,
    "two_track": AccessType.TWO_TRACK,
    "logging_road": AccessType.LOGGING_ROAD,
    "foot_trail": AccessType.FOOT_TRAIL,
    "trail": AccessType.FOOT_TRAIL,
    "powerline": AccessType.POWERLINE,
    "fence_line": AccessType.FENCE_LINE,
    "creek_access": AccessType.CREEK_ACCESS,
    "creek": AccessType.CREEK_ACCESS,
    "ridge_access": AccessType.RIDGE_ACCESS,
    "ridge": AccessType.RIDGE_ACCESS,
    "draw_access": AccessType.DRAW_ACCESS,
    "draw": AccessType.DRAW_ACCESS,
    "field_edge": AccessType.FIELD_EDGE,
    "boat_ramp": AccessType.BOAT_RAMP,
    "dense_cover_stalk": AccessType.DENSE_COVER_STALK,
    "dense_cover": AccessType.DENSE_COVER_STALK,
    "road": AccessType.GRAVEL_ROAD,        # default road fallback
    "access_point": AccessType.UNKNOWN,
}


def _coerce_access_type(raw: str) -> Optional[AccessType]:
    if not raw:
        return None
    return _STR_TO_ACCESS_TYPE.get(raw)


def _stealth_score(level: StealthLevel) -> int:
    return {
        StealthLevel.VERY_LOW: 1,
        StealthLevel.LOW: 2,
        StealthLevel.MODERATE: 3,
        StealthLevel.HIGH: 4,
        StealthLevel.VERY_HIGH: 5,
    }[level]


def _downgrade_stealth(level: StealthLevel, *, steps: int = 1) -> StealthLevel:
    order = [
        StealthLevel.VERY_HIGH,
        StealthLevel.HIGH,
        StealthLevel.MODERATE,
        StealthLevel.LOW,
        StealthLevel.VERY_LOW,
    ]
    idx = order.index(level)
    new_idx = min(len(order) - 1, idx + max(0, steps))
    return order[new_idx]


def _build_contingencies(
    *,
    pressure_level: Optional[PressureLevel],
    has_visible_road: bool,
) -> List[str]:
    out: List[str] = []
    if not has_visible_road:
        out.append(
            "No roads/trails are visible — every access option is INFERRED. "
            "State this in key_assumptions and lower confidence on "
            "entry/exit specifics."
        )
    if pressure_level in (PressureLevel.HIGH, PressureLevel.EXTREME):
        out.append(
            "Under high pressure, prefer the second- or third-best access "
            "option that AVOIDS the most obvious entry. Other hunters will "
            "converge on the obvious one."
        )
    if pressure_level == PressureLevel.EXTREME:
        out.append(
            "Under extreme pressure, plan an early-morning extraction route "
            "that avoids any animal you spook on entry from being pushed "
            "toward your stand or another hunter."
        )
    return out


def _species_access_preferences(
    *,
    species: str,
    hunt_style: Optional[str],
    hunt_weapon: Optional[str],
) -> List[str]:
    species = (species or "").strip().lower()
    style = (hunt_style or "").strip().lower()
    weapon = (hunt_weapon or "").strip().lower()
    out: List[str] = []

    if species == "whitetail":
        out.append(
            "Whitetail — wind / scent management dominates. Choose the "
            "access option with the longest wind buffer to bedding, even "
            "if it adds distance."
        )
        if style == "saddle":
            out.append(
                "Saddle hunters can exploit micro-tree options off the "
                "obvious access — favor cover-bound creek or draw approaches."
            )
        if style == "public_land":
            out.append(
                "Public land — distance from parking (1+ mile) often beats "
                "terrain quality close to the truck."
            )
        if weapon == "archery":
            out.append(
                "Archery — cover-rich approach matters more because the "
                "final 30-40 yards is the danger zone for being seen."
            )
    elif species == "turkey":
        out.append(
            "Turkey — hearing dominates. Pre-light approach must be silent; "
            "avoid creek-rock crossings and dry-leaf footfall near roosts."
        )
        if style == "blind":
            out.append(
                "Blind hunters — placement before flydown beats setup speed; "
                "plan a 90-minute pre-light buffer."
            )

    return out
