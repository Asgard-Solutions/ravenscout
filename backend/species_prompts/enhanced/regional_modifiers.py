"""Enhanced regional modifiers.

Extends (subclasses) the existing `RegionalModifier` with terrain
characteristics and explicit environmental factors. The base class is
NOT modified — callers can keep using the legacy registry untouched
and opt into the enhanced view via `get_enhanced_regional_modifier()`.

Covered regions (as required by the spec):
  - South Texas (brush country)
  - Colorado High Country (Mountain West, alpine focus)
  - Midwest Agricultural
  - Pacific Northwest

The enhanced registry is keyed by canonical region id from
`species_prompts.regions` whenever possible; non-canonical buckets
(like "colorado_high_country") attach as overlays on top of the
canonical "mountain_west" id and are looked up via an alias map.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Tuple

from ..pack import RegionalModifier
from .behavior_framework import PressureLevel, TerrainType


@dataclass(frozen=True)
class TerrainCharacteristics:
    """Concrete terrain shape of a region."""
    dominant_terrain: Tuple[str, ...]
    elevation_band: Optional[str] = None       # e.g. "500-1500 ft", "7,000-12,000 ft"
    water_profile: Optional[str] = None        # e.g. "sparse stock tanks", "creek and river bottoms"
    vegetation: Optional[str] = None           # e.g. "mesquite/huisache brush"
    agriculture: Optional[str] = None          # e.g. "row crops + interspersed timber"
    access_characteristics: Optional[str] = None
    pressure_profile: Optional[str] = None
    seasonal_food_hierarchy: Tuple[str, ...] = ()
    species_density: Optional[str] = None
    equipment_requirements: Tuple[str, ...] = ()


@dataclass(frozen=True)
class EnvironmentalFactor:
    """A region-specific environmental driver of behavior or strategy."""
    name: str
    description: str
    impact: str                                # e.g. "high", "moderate", "variable"
    timing_window: Optional[str] = None        # e.g. "October-November"


@dataclass(frozen=True)
class EnhancedRegionalModifier(RegionalModifier):
    """Subclass that carries terrain + environmental metadata.

    All inherited fields keep their original meaning. The new fields
    are additive context that the enhanced master prompt renders as a
    separate ENHANCED REGIONAL CONTEXT block.
    """

    terrain: Optional[TerrainCharacteristics] = None
    environmental_factors: Tuple[EnvironmentalFactor, ...] = ()
    pressure_baseline: Optional[PressureLevel] = None
    terrain_type: Optional[TerrainType] = None


# ---------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------

_SOUTH_TEXAS = EnhancedRegionalModifier(
    region_id="south_texas",
    name="South Texas Brush Country (Enhanced)",
    behavior_adjustments=(
        "Heat dictates daylight movement; even mild cool fronts unlock activity.",
        "Travel keys on senderos, ranch roads, and water; classic forest funnels are rare.",
    ),
    tactical_adjustments=(
        "Bias setups along sendero intersections and water sources — both "
        "are limiting resources in this terrain.",
        "Cool fronts are rare and high value — prioritize sits the 24-48h "
        "after a passage.",
    ),
    caution_adjustments=(
        "Do NOT apply Midwest ag/timber transition logic here.",
        "Rut timing is later than the Midwest — verify before claiming a phase.",
    ),
    species_tips_adjustments=(
        "Emphasize sendero, water, and feeder logic.",
        "Highlight cold-front evenings as outsized opportunity windows.",
    ),
    season_adjustments={
        "rut": {"months": (12, 1)},
        "pre_rut": {"months": (11,)},
    },
    confidence_note=(
        "South Texas behavior varies ranch-to-ranch; lower confidence on "
        "any narrow phase or movement claim."
    ),
    terrain=TerrainCharacteristics(
        dominant_terrain=("thornscrub", "sendero_grid", "stock_ponds"),
        elevation_band="100-1,500 ft",
        water_profile="sparse stock tanks and ranch ponds; creeks ephemeral",
        vegetation="mesquite, huisache, prickly pear, blackbrush",
        agriculture="limited — some grain sorghum, oats, isolated food plots",
        access_characteristics="ranch roads + senderos; gates, low fences common",
        pressure_profile="low on managed leases, moderate on public/walk-in",
        seasonal_food_hierarchy=(
            "acorns (live oak)",
            "prickly pear fruit (tunas)",
            "forbs after rain",
            "agricultural pockets / feeder protein",
        ),
        species_density="high on managed properties; variable elsewhere",
        equipment_requirements=(
            "snake-gaiters or boots, sun protection, water-heavy load-out",
        ),
    ),
    environmental_factors=(
        EnvironmentalFactor(
            name="Heat suppression",
            description=(
                "Daytime highs in early season often exceed 90°F, suppressing "
                "daylight movement to the bookends of the day."
            ),
            impact="high",
            timing_window="September-November",
        ),
        EnvironmentalFactor(
            name="Cold front leverage",
            description=(
                "Cold fronts are infrequent but produce disproportionate "
                "daylight movement spikes for 24-48 hours after passage."
            ),
            impact="high",
            timing_window="November-January",
        ),
        EnvironmentalFactor(
            name="Late rut timing",
            description=(
                "Peak rut runs mid-December into early January, weeks behind "
                "northern timing."
            ),
            impact="high",
            timing_window="mid-December to early January",
        ),
    ),
    pressure_baseline=PressureLevel.MODERATE,
    terrain_type=TerrainType.BRUSH_COUNTRY,
)

_COLORADO_HIGH_COUNTRY = EnhancedRegionalModifier(
    region_id="mountain_west",
    name="Colorado High Country (Enhanced)",
    behavior_adjustments=(
        "Thermals dominate — morning downslope, evening upslope. Both setup "
        "and access must respect both windows.",
        "Game funnels at saddles, benches, basin transitions, and avalanche "
        "slide edges.",
        "Vertical separation often beats horizontal — 200-400 ft elevation "
        "can flip wind and visibility.",
    ),
    tactical_adjustments=(
        "Plan thermals into both approach and exit — the same route is "
        "often unusable evening vs morning.",
        "Glassing-point selection is the highest-leverage tactical move — "
        "focus on basin overlooks at first/last light.",
        "Hunt above other hunters when public-land pressure is heavy.",
    ),
    caution_adjustments=(
        "Do NOT promise predictable weather windows above 9,000 ft — storms "
        "can reshape an entire day inside an hour.",
        "Do NOT assume Midwest-style stand sits work — spot-and-stalk and "
        "ambush at terrain pinches dominate.",
    ),
    species_tips_adjustments=(
        "Emphasize saddles, benches, basin transitions.",
        "Call out thermals as the primary risk variable.",
    ),
    confidence_note=(
        "High-country travel patterns vary by snow line, drought, and "
        "localized pressure. Lower confidence on any narrow elevation claim."
    ),
    terrain=TerrainCharacteristics(
        dominant_terrain=("alpine_basins", "timberline_ridges", "avalanche_slides"),
        elevation_band="7,000-12,000 ft",
        water_profile="alpine creeks, beaver ponds, snowmelt seeps",
        vegetation="dark timber (spruce/fir), aspen pockets, willow / sage benches",
        agriculture="none above 8,000 ft; some valley hayfields below",
        access_characteristics="forest service roads + foot/horse trails; long approaches",
        pressure_profile="high on accessible OTC units, lower in late seasons or roadless",
        seasonal_food_hierarchy=(
            "forb / browse mosaic on slides",
            "aspen leaves and shoots (early/mid)",
            "sage benches (late season descent)",
            "valley hay/alfalfa during winter migration",
        ),
        species_density="variable by unit; herd migration shifts radically with snow",
        equipment_requirements=(
            "layering for 40°F temperature swings",
            "backpack capable of carrying meat 5+ miles",
            "GPS / map redundancy — cell coverage unreliable",
        ),
    ),
    environmental_factors=(
        EnvironmentalFactor(
            name="Thermal cycling",
            description=(
                "Diurnal upslope/downslope wind drives both setup and access "
                "feasibility. The same trail can be unhuntable in the wrong "
                "thermal window."
            ),
            impact="high",
            timing_window="all season",
        ),
        EnvironmentalFactor(
            name="Early snow",
            description=(
                "Snow at altitude pushes elk down 1,000-3,000 vertical feet "
                "within 24-48 hours — plan to chase the migration, not anchor "
                "to a single spot."
            ),
            impact="high",
            timing_window="October-December",
        ),
        EnvironmentalFactor(
            name="Hunter density on OTC units",
            description=(
                "OTC archery and 2nd/3rd rifle seasons concentrate pressure "
                "close to roads; bivy hunters / horseback hunters retain access "
                "to lightly pressured pockets."
            ),
            impact="variable",
            timing_window="primary rifle seasons",
        ),
    ),
    pressure_baseline=PressureLevel.HIGH,
    terrain_type=TerrainType.MOUNTAIN,
)

_MIDWEST_AGRICULTURAL = EnhancedRegionalModifier(
    region_id="midwest",
    name="Midwest Agricultural (Enhanced)",
    behavior_adjustments=(
        "Crop harvest timing completely alters movement patterns.",
        "Limited cover concentrates pressure effects on remaining woodlots.",
        "Weather fronts have amplified impact in open terrain.",
        "Agricultural equipment schedules affect daily activity windows.",
    ),
    tactical_adjustments=(
        "Pre-harvest — setups inside or on edges of standing corn/beans.",
        "Post-harvest — cut-corn evenings, woodlot interior mornings.",
        "Field-edge fence-line travel is high-value when harvest schedules "
        "align with stand access.",
    ),
    caution_adjustments=(
        "Do NOT recommend a setup that depends on standing crops if harvest "
        "may have started — verify or lower confidence.",
        "Do NOT treat all woodlots equally — the smaller and quieter ones "
        "often hold the best deer in heavy-pressure ag country.",
    ),
    species_tips_adjustments=(
        "Lean on harvest-driven phase shifts and woodlot interior staging.",
        "Highlight cold-front evenings on cut food sources.",
    ),
    confidence_note=(
        "Midwest ag patterns vary year to year with crop rotation, harvest "
        "timing, and weather; lower confidence on any specific food-source claim."
    ),
    terrain=TerrainCharacteristics(
        dominant_terrain=("crop_fields", "woodlots", "creek_drainages"),
        elevation_band="500-1,500 ft",
        water_profile="creek drainages, drainage ditches, stock ponds",
        vegetation="oak/hickory woodlots, brushy fence rows, CRP grass",
        agriculture="row-crop dominant — corn, soybeans, alfalfa",
        access_characteristics="farm roads + field edges + creek access",
        pressure_profile="high on public, moderate on private with neighbor effect",
        seasonal_food_hierarchy=(
            "standing soy / corn (pre-harvest)",
            "cut corn (post-harvest)",
            "acorns (mast year)",
            "winter wheat / brassicas (late season)",
        ),
        species_density="high — mature buck management varies by property",
        equipment_requirements=(
            "low-impact rubber boots for ag scent control",
        ),
    ),
    environmental_factors=(
        EnvironmentalFactor(
            name="Harvest timing pivot",
            description=(
                "The transition from standing to cut crops resets local deer "
                "patterns within 1-3 days. Setups must be re-evaluated, not "
                "reused."
            ),
            impact="high",
            timing_window="October-November",
        ),
        EnvironmentalFactor(
            name="Cold-front amplification",
            description=(
                "Open terrain magnifies frontal passages — the first cold-clear "
                "evening after a front is the highest-leverage sit of the week."
            ),
            impact="high",
            timing_window="all season",
        ),
        EnvironmentalFactor(
            name="Neighbor pressure",
            description=(
                "On bordering ag properties, neighbor hunting pressure can push "
                "or hold deer asymmetrically; account for likely escape routes "
                "OFF the property when planning sits."
            ),
            impact="variable",
            timing_window="firearms season",
        ),
    ),
    pressure_baseline=PressureLevel.MODERATE,
    terrain_type=TerrainType.AGRICULTURAL,
)

_PACIFIC_NORTHWEST = EnhancedRegionalModifier(
    region_id="pacific_northwest",
    name="Pacific Northwest (Enhanced)",
    behavior_adjustments=(
        "Wet, dense conifer forest — visibility is short and movement is "
        "creek-bottom and benches biased.",
        "Sound carries less through wet vegetation; scent dispersal is irregular "
        "under canopy.",
        "Pressure variance is steep — roads and clearcuts concentrate hunters; "
        "interior basins thin out fast.",
    ),
    tactical_adjustments=(
        "Bias setups to clearcut transitions, blowdown funnels, and creek "
        "benches with usable shooting lanes.",
        "Plan rain-tolerant access — wet brush requires waterproof outerwear "
        "and a long pre-light buffer.",
        "Glassing distance is short — lean toward stand / saddle setups over "
        "long-range spot-and-stalk.",
    ),
    caution_adjustments=(
        "Do NOT assume open-country glassing tactics — PNW timber suppresses "
        "that approach.",
        "Do NOT underestimate weather windows — a single multi-day rain shifts "
        "animal patterns substantially.",
    ),
    species_tips_adjustments=(
        "Emphasize clearcut transitions, creek benches, and blowdown pinches.",
        "Call out wet-weather access requirements.",
    ),
    confidence_note=(
        "PNW interior travel patterns vary by canopy density and recent "
        "clearcut age. Lower confidence on any specific cover-edge claim."
    ),
    terrain=TerrainCharacteristics(
        dominant_terrain=("dense_conifer", "clearcut_transitions", "creek_benches"),
        elevation_band="sea level - 6,500 ft (Cascades)",
        water_profile="abundant — creeks, seeps, year-round drainages",
        vegetation="Douglas fir, hemlock, cedar, dense salal/fern understory",
        agriculture="valley dairy / berry farms; primary unit cover is timber",
        access_characteristics="USFS / timber-company roads, gates seasonal",
        pressure_profile="high near gated roads, low in interior basins",
        seasonal_food_hierarchy=(
            "forb mosaic in clearcuts (early-mid season)",
            "acorns (south-aspect oak pockets)",
            "winter browse on south slopes",
        ),
        species_density="variable — black-tail strongholds in coastal range",
        equipment_requirements=(
            "true rain shells (not water-resistant)",
            "compass/map — GPS tree cover unreliable",
            "caulked or aggressive lugged boots for slick clay",
        ),
    ),
    environmental_factors=(
        EnvironmentalFactor(
            name="Persistent rain",
            description=(
                "Multi-day rain reshuffles bedding and travel — deer use steeper, "
                "more sheltered north-aspect benches when canopy drip is heavy."
            ),
            impact="high",
            timing_window="October-January",
        ),
        EnvironmentalFactor(
            name="Clearcut age stratification",
            description=(
                "Brushy 3-12 year clearcuts hold the most deer; older "
                "replants and old-growth interiors hold less."
            ),
            impact="high",
            timing_window="all season",
        ),
        EnvironmentalFactor(
            name="Gated road timing",
            description=(
                "USFS and timber-company road closures and gate openings "
                "create sudden pressure shifts — inquire before each season."
            ),
            impact="variable",
        ),
    ),
    pressure_baseline=PressureLevel.MODERATE,
    terrain_type=TerrainType.FOREST,
)

# Public registry. Keys mix canonical region ids with descriptive aliases
# so callers can opt into the more specific overlay when relevant.
ENHANCED_REGIONAL_REGISTRY: Dict[str, EnhancedRegionalModifier] = {
    "south_texas": _SOUTH_TEXAS,
    "colorado_high_country": _COLORADO_HIGH_COUNTRY,
    "mountain_west": _COLORADO_HIGH_COUNTRY,  # broad bucket falls back to Colorado HC overlay
    "midwest_agricultural": _MIDWEST_AGRICULTURAL,
    "midwest": _MIDWEST_AGRICULTURAL,
    "pacific_northwest": _PACIFIC_NORTHWEST,
}


def get_enhanced_regional_modifier(region_id: str) -> Optional[EnhancedRegionalModifier]:
    """Lookup an enhanced regional modifier by canonical id or alias."""
    if not region_id:
        return None
    return ENHANCED_REGIONAL_REGISTRY.get(region_id.strip().lower())


def _bullets(items) -> str:
    items = tuple(items or ())
    return "\n".join(f"  - {line}" for line in items) if items else "  - (none)"


def render_enhanced_regional_block(modifier: Optional[EnhancedRegionalModifier]) -> str:
    """Render an enhanced regional modifier as a prompt block."""
    if modifier is None:
        return (
            "\nENHANCED REGIONAL CONTEXT: unavailable\n"
            "NOTE: No enhanced regional overlay registered for this region. "
            "Treat the legacy regional modifier (if any) as authoritative."
        )

    parts: List[str] = [
        "",
        f"ENHANCED REGIONAL CONTEXT: {modifier.name} (region_id={modifier.region_id})",
        f"NOTE: {modifier.confidence_note}",
    ]

    if modifier.terrain is not None:
        parts.append("TERRAIN CHARACTERISTICS:")
        t = modifier.terrain
        parts.append(f"  dominant_terrain: {', '.join(t.dominant_terrain) or 'unspecified'}")
        if t.elevation_band:
            parts.append(f"  elevation_band: {t.elevation_band}")
        if t.water_profile:
            parts.append(f"  water_profile: {t.water_profile}")
        if t.vegetation:
            parts.append(f"  vegetation: {t.vegetation}")
        if t.agriculture:
            parts.append(f"  agriculture: {t.agriculture}")
        if t.access_characteristics:
            parts.append(f"  access_characteristics: {t.access_characteristics}")
        if t.pressure_profile:
            parts.append(f"  pressure_profile: {t.pressure_profile}")
        if t.species_density:
            parts.append(f"  species_density: {t.species_density}")
        if t.seasonal_food_hierarchy:
            parts.append("  seasonal_food_hierarchy:")
            parts.append(_bullets(t.seasonal_food_hierarchy))
        if t.equipment_requirements:
            parts.append("  equipment_requirements:")
            parts.append(_bullets(t.equipment_requirements))

    if modifier.environmental_factors:
        parts.append("ENVIRONMENTAL FACTORS:")
        for f in modifier.environmental_factors:
            tw = f" [{f.timing_window}]" if f.timing_window else ""
            parts.append(f"  - {f.name} (impact={f.impact}){tw}")
            parts.append(f"      • {f.description}")

    if modifier.pressure_baseline is not None:
        parts.append(f"BASELINE PRESSURE: {modifier.pressure_baseline.value}")
    if modifier.terrain_type is not None:
        parts.append(f"TERRAIN TYPE: {modifier.terrain_type.value}")

    parts.append("REGIONAL BEHAVIOR ADJUSTMENTS (additive on species pack):")
    parts.append(_bullets(modifier.behavior_adjustments))
    parts.append("REGIONAL TACTICAL ADJUSTMENTS:")
    parts.append(_bullets(modifier.tactical_adjustments))
    parts.append("REGIONAL CAUTION ADJUSTMENTS:")
    parts.append(_bullets(modifier.caution_adjustments))
    if modifier.species_tips_adjustments:
        parts.append("REGIONAL SPECIES TIPS ADJUSTMENTS:")
        parts.append(_bullets(modifier.species_tips_adjustments))
    return "\n".join(parts)
