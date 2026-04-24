"""Black Bear prompt pack (baseline).

Covers black bear across forested North America. Does not currently
specialize for grizzly / brown bear — those would warrant their own
pack given the different tactical frame (much more conservative,
more open country in AK/interior). Baseline behavior/tactical/movement/caution/tips
plus two seasonal phases: spring food-concentration and fall hyperphagia.
"""

from .pack import SeasonalModifier, SpeciesPromptPack


_BEAR_SPRING = SeasonalModifier(
    phase_id="spring_foods",
    name="Spring Food Concentration",
    trigger_rules={
        "months": (4, 5, 6),
        "logic": "either",
    },
    behavior_adjustments=(
        "Post-emergence bears concentrate hard on first-green vegetation — south-facing avalanche chutes, grassy park edges, dandelion/clover benches.",
        "Bears lose fear of daylight exposure when a concentrated protein or green-up source is available.",
        "Mother sows with cubs bias toward cover-adjacent feeding; boars tolerate more open ground.",
    ),
    tactical_adjustments=(
        "Glass south-facing slopes, burn scars, and green-up edges from long range — this is a glassing-first hunt.",
        "Bait setups (where legal) target cover-line approaches with downwind shot geometry.",
        "Ambush carcasses or winterkill sites when the presence is visible / strongly inferable in imagery.",
    ),
    caution_adjustments=(
        "Do NOT assume rut-style bear behavior in spring — mating activity is early/mid summer, not spring.",
        "Do NOT pressure feeding females with cubs; flag that setup in caution notes if detected.",
    ),
    species_tips_adjustments=(
        "Emphasize glassing south-facing green-up and long-range observation before committing.",
        "Call out safety/identification need — identify sex and cub presence before any shot consideration.",
    ),
)


_BEAR_FALL = SeasonalModifier(
    phase_id="fall_hyperphagia",
    name="Fall Hyperphagia",
    trigger_rules={
        "months": (8, 9, 10),
        "logic": "either",
    },
    behavior_adjustments=(
        "Bears feed ~20 hours/day building fat for denning; daytime food-source activity increases sharply.",
        "Acorn mast, berry thickets, and apple orchards dominate travel — bears will walk long distances to concentrated calorie sources.",
        "Salmon streams (where applicable) become the single dominant attractor.",
    ),
    tactical_adjustments=(
        "Target mast-producing oak / beech flats, berry-thick benches, and ag-edge apple/pear concentrations with a downwind-cover approach.",
        "Trail-camera patterns / fresh scat and trails ARE reliable intel in hyperphagia — weight them heavily when visible.",
        "Ambush setups on concentrated food sources become viable even at classic whitetail dawn/dusk windows.",
    ),
    caution_adjustments=(
        "Do NOT assume a bear on food will re-use the same time window every day — feeding bouts drift.",
        "Do NOT ignore thermals — bears detect human scent at long range and disappear without a sound.",
    ),
    species_tips_adjustments=(
        "Emphasize concentrated-food ambushes with strict wind/thermal discipline.",
        "Call out the risk of scent detection and the value of elevated setups.",
    ),
)


BEAR_PACK = SpeciesPromptPack(
    canonical_id="bear",
    display_name="Black Bear",
    aliases=(
        "bear",
        "bears",
        "black bear",
        "american black bear",
        "boar bear",
        "sow bear",
    ),
    behavior_rules=(
        "Black bears are food-driven above almost all else — seasonal food concentrations (green-up, berries, mast, salmon, carcasses, ag) dictate location.",
        "Bears bed in thick cover adjacent to food — wind, sightlines, and multiple escape routes matter more than specific terrain features.",
        "Smell is a bear's dominant sense — approaches must beat wind AND thermals, not just one.",
        "Bears are typically solitary outside of breeding and sow+cubs — group-animal logic does not apply.",
        "Daytime activity scales with food concentration — extreme during fall hyperphagia, low in mid-summer doldrums.",
        "Rubs, fresh scat, hair on wire/brush, and overturned logs are reliable freshness signals when visible.",
    ),
    tactical_guidance=(
        "Locate the current dominant food source and hunt downwind cover-line access to it.",
        "Glass green-up slopes, burn edges, berry benches, and mast flats from long range before committing.",
        "Prefer elevated setups — bear eyesight is modest above the horizon line and thermals carry scent predictably.",
        "Plan an approach that accepts bear sensory range: scent windows measured in hundreds of yards, not tens.",
        "Treat any bait / attractant (where legal) as the highest-weight feature — setups orient around it.",
    ),
    movement_assumptions=(
        "Bed (thick cover) <-> food (concentrated mast / berries / ag / salmon) with transitions that drift through the day in hyperphagia.",
        "Night activity is common especially under hunting pressure — daylight recommendations require strong food-concentration support.",
        "Bears walk established trails to and from concentrated food; these are high-value ambush points when visible.",
    ),
    caution_rules=(
        "Do NOT apply whitetail rut / dawn-dusk logic as the dominant frame — bears are food-phase driven, not rut-driven.",
        "Do NOT invent specific bait sites, orchards, or carcass locations unless visually supported or strongly inferable.",
        "Do NOT claim safety or shot-opportunity certainty — identification (sow vs boar, cub presence) must come first.",
        "Lower confidence sharply when the active food source can't be reasonably inferred from terrain and season.",
    ),
    species_tips_guidance=(
        "Black-bear-specific themes only — do not drift into ungulate tactics.",
        "Cover food-concentration targeting, glassing-first approaches, wind/thermal discipline, and identification discipline.",
        "Acknowledge that hunter presence can collapse daytime activity quickly.",
    ),
    seasonal_modifiers={
        "spring_foods": _BEAR_SPRING,
        "fall_hyperphagia": _BEAR_FALL,
    },
)
