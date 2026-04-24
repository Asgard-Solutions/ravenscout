"""Moose prompt pack (baseline).

Covers North American moose (Alaskan, Shiras, Canadian, Eastern).
Baseline behavior/tactical/movement/caution/tips plus two seasonal
phases: rut (calling) and post-rut winter yarding.
"""

from .pack import SeasonalModifier, SpeciesPromptPack


_MOOSE_RUT = SeasonalModifier(
    phase_id="rut",
    name="Rut (Calling Season)",
    trigger_rules={
        "months": (9, 10),
        "logic": "either",
    },
    behavior_adjustments=(
        "Bulls respond to cow-in-heat calls and competing-bull grunts; vocalization and pond-water-thrashing behaviors increase sharply.",
        "Bulls leave secluded timber to investigate calls and to patrol cow home ranges, often in daylight.",
        "Cow and calf groups may separate briefly as cows seek out bulls.",
    ),
    tactical_adjustments=(
        "Cow-call + raking setups on ridge-edge benches above pond systems are a dominant play.",
        "Target willow/alder bottoms adjacent to cut-over timber, muskeg edges, and beaver-pond complexes.",
        "Plan for a CLOSE encounter — rutting bulls commit hard when a call lands; shot geometry must be pre-staged.",
    ),
    caution_adjustments=(
        "Do NOT treat rut vocalization as a guarantee of a daylight shot window — bulls may answer from out of sight and not commit.",
        "Do NOT assume bulls will circle downwind like an elk — moose often come straight in.",
    ),
    species_tips_adjustments=(
        "Emphasize call-and-setup discipline with pre-staged shooting lanes.",
        "Flag safety — a committed rutting bull is dangerous and must not be 'finished' from the ground at close range without an escape plan.",
    ),
)


_MOOSE_WINTER = SeasonalModifier(
    phase_id="winter_yard",
    name="Winter / Yarding",
    trigger_rules={
        "months": (11, 12, 1, 2),
        "max_temp_f": 20,
        "logic": "either",
    },
    behavior_adjustments=(
        "Moose concentrate in 'yards' — low-snowpack cedar swamps, dense spruce, south-facing browse pockets — to conserve energy.",
        "Movement compresses dramatically; a yarded moose may stay in a 100-acre patch for weeks.",
        "Browse sign (clipped twigs, bark stripping) becomes the dominant visible cue.",
    ),
    tactical_adjustments=(
        "Still-hunt slowly into known yards along browse-heavy corridors; avoid pressuring OUT of the yard.",
        "Use snow-cover sign-interpretation (browse, beds, tracks) as primary intel, imagery permitting.",
        "Plan shorter, denser-cover ambush ranges — winter moose hold tight to thick cover.",
    ),
    caution_adjustments=(
        "Do NOT apply rut tactics (calling) in post-rut winter context.",
        "Do NOT pressure a yard — once disturbed, moose may leave and collapse the hunt.",
    ),
    species_tips_adjustments=(
        "Emphasize low-impact still-hunting in yards with browse-sign following.",
        "Call out the cost of pressuring a yard.",
    ),
)


MOOSE_PACK = SpeciesPromptPack(
    canonical_id="moose",
    display_name="Moose",
    aliases=(
        "moose",
        "mooses",
        "bull moose",
        "cow moose",
        "alces",
        "shiras moose",
        "alaska moose",
        "canadian moose",
    ),
    behavior_rules=(
        "Moose are tied to water — beaver ponds, lake shorelines, marsh edges, willow/alder bottoms, muskegs — for food, cooling, and the rut.",
        "Moose bed in dense conifer / alder thickets and on shaded benches; they tolerate proximity to water better than most ungulates.",
        "Movement is slower and shorter-range than elk — a moose's daily circuit can fit in a single drainage or pond complex.",
        "Vision is modest; smell and hearing are strong. Wind discipline matters more than concealment coloration.",
        "Moose are solitary outside rut and cow-calf pairs; large-group logic does not apply.",
    ),
    tactical_guidance=(
        "Target pond systems, beaver-cut bottoms, willow/alder feeding runs, and muskeg edges as primary movement zones.",
        "Glass pond shorelines at first/last light; moose will stand in water and feed at length.",
        "Favor elevated ridges above pond complexes for call-and-wait setups during the rut.",
        "Plan an approach by canoe, quiet foot access, or long glass — moose detect footfall vibration surprisingly well in soft ground.",
        "Acknowledge pack-out logistics — setups within reach of water/road transport matter to a valid recommendation.",
    ),
    movement_assumptions=(
        "Pond / marsh feeding at dawn and dusk (often well into full dark) -> bedding in dense conifer / alder during midday.",
        "Rut movement is less time-bound — bulls may travel and vocalize at any hour.",
        "Winter movement collapses to yards; assume very small daily range.",
    ),
    caution_rules=(
        "Do NOT apply deer- or elk-scale funnel/saddle logic — moose operate at pond-and-drainage scale, slower and tighter.",
        "Do NOT invent specific ponds, beaver complexes, or wallows unless visible or strongly inferable from imagery.",
        "Do NOT assume a shot-ready approach is feasible without considering pack-out distance to water or road.",
        "Lower confidence sharply for daylight movement claims outside of rut or yard proximity.",
    ),
    species_tips_guidance=(
        "Moose-specific themes only — do not drift into elk or whitetail tactics.",
        "Cover pond-and-willow targeting, canoe/quiet access, pack-out realism, and rut-specific calling disciplines.",
        "Flag safety around rutting bulls explicitly.",
    ),
    seasonal_modifiers={
        "rut": _MOOSE_RUT,
        "winter_yard": _MOOSE_WINTER,
    },
)
