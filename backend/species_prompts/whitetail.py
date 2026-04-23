"""Whitetail Deer prompt pack."""

from .pack import SpeciesPromptPack

WHITETAIL_PACK = SpeciesPromptPack(
    canonical_id="whitetail",
    display_name="Whitetail Deer",
    aliases=(
        "deer",
        "whitetail",
        "whitetail deer",
        "white-tailed deer",
        "white tailed deer",
        "whitetailed deer",
    ),
    behavior_rules=(
        "Whitetails bed in secure cover by day and shift toward feeding areas during dawn and dusk transitions.",
        "Mature bucks prefer concealed travel and use cover + terrain to avoid open exposure during daylight.",
        "Travel concentrates through funnels, saddles, creek crossings, benches, and transition lines between cover types.",
        "Wind is a primary safety cue — deer strongly prefer to travel with wind in their favor, especially near bedding.",
        "Hunting pressure causes deer to shift to thicker cover, swap travel routes, and move more at night.",
        "Water draws deer in hot/dry conditions but is rarely a dominant factor in cool weather.",
    ),
    tactical_guidance=(
        "Prioritize funnel/saddle/creek-crossing stand setups over open feeding areas, especially for morning hunts.",
        "Set stands downwind of expected travel; explicitly describe the wind_risk for each top_setup.",
        "For morning hunts favor stands closer to bedding with low-impact access that avoids crossing feeding areas.",
        "For evening hunts favor staging areas between bedding and feeding, or inside feeding-area cover edges.",
        "Use benches and terrain breaks on ridges as mid-slope pinch points.",
        "Plan entry and exit routes that avoid silhouetting on ridgelines and don't push deer off bedding cover.",
        "Mark areas likely to be pressured (roads, parking, trails) as `avoid` overlays when visible.",
    ),
    movement_assumptions=(
        "Morning: bedding <- feeding (deer returning toward bedding).",
        "Evening: bedding -> staging -> feeding.",
        "Mid-day movement is generally low outside of rut; lower confidence on mid-day setups.",
        "Wind-relative travel preference is a strong prior; weight it heavily in overlay placement.",
    ),
    caution_rules=(
        "Do NOT invent specific scrape lines, rub lines, licking branches, or bedding locations unless they are visibly supported.",
        "Do NOT assert a specific trail without visible evidence (clearing, edge, bench, crossing).",
        "Do NOT assume rut behavior unless hunt date/context explicitly indicates it; mark as assumed when used.",
        "Lower confidence when behavior would depend on unseen seasonal context (rut phase, crop stage, mast drop).",
        "Never describe individual deer behavior as certain — use cautious phrasing ('likely', 'expected').",
    ),
    species_tips_guidance=(
        "Whitetail-specific tips only — do not use turkey or hog tactics here.",
        "Cover downwind stand selection, low-impact access, morning-vs-evening positioning, and terrain-driven travel funnels.",
        "Note pressure avoidance and scent-control considerations relevant to whitetails.",
        "Acknowledge when advice depends on unseen seasonal/rut context.",
    ),
)
