"""Wild Turkey prompt pack."""

from .pack import SpeciesPromptPack

TURKEY_PACK = SpeciesPromptPack(
    canonical_id="turkey",
    display_name="Wild Turkey",
    aliases=(
        "turkey",
        "wild turkey",
        "eastern turkey",
        "rio grande turkey",
        "merriam turkey",
        "merriams turkey",
        "osceola turkey",
        "gobbler",
    ),
    behavior_rules=(
        "Turkeys roost overnight in mature trees, often on ridges, benches, or along drainages with mature hardwoods near open ground.",
        "Fly-down in the morning is followed by movement toward open strut zones, field edges, logging roads, and openings with good visibility.",
        "Mid-morning turkeys reposition — gobblers follow hens or drift to quieter strut areas; groups can travel a long way on foot.",
        "Afternoon movement often drifts back toward roosting cover along ridges, travel roads, and openings.",
        "Line of sight matters: turkeys rely on vision and will not commit to calling they cannot see into.",
        "Hunting pressure or human noise makes turkeys hang up, shift strut zones, or simply shut up.",
    ),
    tactical_guidance=(
        "Favor setups along natural travel corridors (ridges, logging roads, creek bottoms, transitions) BETWEEN likely roost areas and open strut zones.",
        "Position with clear calling/shooting lanes into openings where a gobbler can approach in view.",
        "Back against cover large enough to break your silhouette; avoid exposed skylining on ridgelines.",
        "Set up for quiet low-impact approach — approach noise and flashlight use can blow a roost.",
        "Do NOT place stands right under or adjacent to a suspected roost tree; place them on travel routes away from it.",
        "For mid-morning windows, move to openings, fields, logging roads, and ridgetop benches where gobblers search.",
        "Mark loud / exposed / high-traffic areas that would bust a setup as `avoid` overlays.",
    ),
    movement_assumptions=(
        "Pre-dawn: birds are in roost; any setup should be already in position before fly-down.",
        "Fly-down -> strut zone (often in or adjacent to an opening or edge).",
        "Mid-morning: repositioning along travel corridors / openings.",
        "Afternoon: drift back toward roosting cover.",
        "Turkeys do not follow whitetail-style wind logic — don't over-apply funnel/saddle/wind-downwind deer tactics.",
    ),
    caution_rules=(
        "Do NOT claim a specific roost tree or gobbling location unless it is clearly visible or strongly inferable from imagery.",
        "Do NOT assume calling will pull a bird across open ground when terrain/cover makes the approach unnatural.",
        "Do NOT apply deer-style pinch-point logic as if it were equivalent for turkeys.",
        "Lower confidence when tactics depend on unseen breeding-season behavior (henned-up gobblers, subdominant birds, hen presence).",
        "Never describe a gobbler's response to calling as certain.",
    ),
    species_tips_guidance=(
        "Turkey-specific tips only — do not drift into deer funnel logic.",
        "Cover setup visibility / calling lanes, low-impact approach, roost-to-strut travel, and mid-morning reposition options.",
        "Note pressure sensitivity and the risk of calling to a bird that can't see the shooter.",
        "Acknowledge when advice depends on unseen breeding-season context (hen presence, henned-up gobblers).",
    ),
)
