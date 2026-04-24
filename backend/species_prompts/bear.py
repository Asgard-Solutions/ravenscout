"""Black Bear prompt pack (baseline).

Covers black bear across forested North America. Does not currently
specialize for grizzly / brown bear — those would warrant their own
pack given the different tactical frame (much more conservative,
more open country in AK/interior). Baseline behavior/tactical/movement/caution/tips
plus two seasonal phases: spring food-concentration and fall hyperphagia.
"""

from .pack import HuntStyleModifier, RegionalModifier, SeasonalModifier, SpeciesPromptPack


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
    hunt_style_modifiers={
        "archery": HuntStyleModifier(
            style_id="archery",
            name="Archery (Black Bear)",
            behavior_adjustments=(
                "Effective range is ~15-40 yards; bears detect scent at hundreds of yards so archery stands live or die on wind + thermal discipline.",
                "Bears approach known food carefully \u2014 a broadside archery shot often requires pre-positioning on trail + wind, not reacting to arrival.",
            ),
            tactical_adjustments=(
                "Favor elevated setups (tree stand / saddle / blind platform) near concentrated food with a pre-cleared 25-35 yard lane.",
                "Plan a downwind approach path that does NOT cross the bear's expected inbound trail.",
                "Where legal, bait setups define the shot lane \u2014 geometry is fixed; plan stand placement around it.",
            ),
            caution_adjustments=(
                "Do NOT set up ground-level inside a bear's inbound scent cone \u2014 a close-range bust is dangerous AND season-ending.",
                "Do NOT rely on visibility without wind \u2014 a bear at 30 yards wins the scent game every time wind is wrong.",
            ),
            species_tips_adjustments=(
                "Emphasize elevation, shot-lane pre-cut, and hard wind/thermal discipline over raw visibility.",
            ),
        ),
        "rifle": HuntStyleModifier(
            style_id="rifle",
            name="Rifle (Black Bear)",
            behavior_adjustments=(
                "Effective window extends to glassing limit \u2014 spring green-up and fall berry/salmon concentrations are glassable at half-mile-plus.",
                "A shootable bear can emerge, feed, and disappear in minutes \u2014 glass-ready setup matters.",
            ),
            tactical_adjustments=(
                "Glass green-up slopes, berry benches, salmon streams, and ag-edge orchards from across-drainage knob positions.",
                "Plan shot lanes 100-400 yards; bears feeding cross-grain to cover show broadside at distance.",
                "Wind/thermal discipline still dominant even at range \u2014 a bear looping downwind of the glasser collapses the hunt regardless of cover.",
            ),
            caution_adjustments=(
                "Do NOT assume a first sighting is a first-and-last chance \u2014 patient glass often produces a better angle 30 minutes later.",
                "Do NOT ignore terrain between shooter and bear \u2014 downhill shots into canyons are recovery nightmares.",
            ),
            species_tips_adjustments=(
                "Emphasize patient across-drainage glassing and recovery-aware shot angles.",
            ),
        ),
        "spot_and_stalk": HuntStyleModifier(
            style_id="spot_and_stalk",
            name="Spot-and-Stalk (Black Bear)",
            behavior_adjustments=(
                "Bears don't pattern like ungulates \u2014 daily food focus drifts. A stalk from spot is often a one-chance window per day.",
                "Bears feed heads-down for long intervals \u2014 the stalk window opens WHILE the bear is engrossed, not when he looks up.",
            ),
            tactical_adjustments=(
                "Close during a heads-down feeding interval; freeze when the bear lifts and looks around.",
                "Use wind + thermal + cover contours to set the approach \u2014 an across-canyon contour stalk beats a direct downhill ridge walk.",
                "Commit the final 80-120 yards only when wind AND terrain AND posture line up.",
            ),
            caution_adjustments=(
                "Do NOT stalk cross-wind \u2014 bears win scent at 200+ yards.",
                "Do NOT assume retreat on failure is safe \u2014 a busted bear upwind of you may come closer to investigate.",
            ),
            species_tips_adjustments=(
                "Emphasize heads-down stalk windows, wind-first approach geometry, and controlled abort criteria.",
            ),
        ),
    },
    regional_modifiers={
        "mountain_west": RegionalModifier(
            region_id="mountain_west",
            name="Mountain West Black Bear",
            behavior_adjustments=(
                "Rocky Mountain / intermountain black bears \u2014 broad elevation range, heavy reliance on south-facing avalanche chute green-up in spring and berry / acorn benches in fall.",
                "Public-land access dominates; bears pressure off roads quickly.",
            ),
            tactical_adjustments=(
                "Glass avalanche chutes and south-facing burn scars at long range through spring; pivot to berry basins and mast flats in fall.",
                "Pit / ridge glass positions across drainages are high-value \u2014 bears on open slopes are visible at mile-plus.",
                "Plan packs-outs \u2014 elevation + distance matter for recovery planning.",
            ),
            caution_adjustments=(
                "Do NOT apply eastern mast-flat tactics \u2014 mountain chutes and burn scars are the classic spring play.",
                "Do NOT neglect grizzly overlap in parts of MT / ID / WY / AK \u2014 identification must be certain before shots.",
            ),
            species_tips_adjustments=(
                "Emphasize avalanche-chute / burn-scar glassing and long recovery logistics.",
            ),
        ),
        "southeast_us": RegionalModifier(
            region_id="southeast_us",
            name="Southeastern Black Bear",
            behavior_adjustments=(
                "Eastern / southeastern black bears live in dense hardwood bottoms, swamps, and pocosins \u2014 mast-driven, ag-subsidized, often nocturnal under pressure.",
                "Habitat is closed \u2014 long-range glassing is rarely feasible; hunts happen inside 100 yards.",
            ),
            tactical_adjustments=(
                "Target acorn / beechnut / oak flats, swamp-edge trails, and mast-heavy bottoms \u2014 bait where legal for ambush geometry.",
                "Hound-hunting, drive, and still-hunt in dense country are regionally common methods \u2014 plan for close-cover setups and short shot lanes.",
                "Use wind and scent-control carefully in tight country \u2014 bears acclimated to human sign still spook on pure scent hits.",
            ),
            caution_adjustments=(
                "Do NOT recommend long-range open-country glassing strategies in closed dense country.",
                "Do NOT apply mountain-West spring green-up tactics \u2014 spring seasons are mast-driven or absent.",
            ),
            species_tips_adjustments=(
                "Emphasize mast-flat and swamp-edge ambush setups with close shot lanes.",
            ),
        ),
        "midwest": RegionalModifier(
            region_id="midwest",
            name="Upper Midwest / Great Lakes Black Bear",
            behavior_adjustments=(
                "Upper Midwest / Great Lakes bears \u2014 classic bait-hunting country, dense deciduous forest, plentiful mast, and agricultural overlap.",
                "Food targeting is strongly mast / ag / berry driven \u2014 bears pattern to single productive sources at short timescales.",
            ),
            tactical_adjustments=(
                "Where legal, bait setups are the dominant play \u2014 optimize wind, shot-lane geometry, and trail-cam pattern data.",
                "Natural-food ambushes target acorn / beech / apple concentrations with active sign (rubs / scat / bitten branches).",
                "Use canopy-cover transitions and swamp-edge trails \u2014 mid-forest is less productive than edge targeting.",
            ),
            caution_adjustments=(
                "Do NOT recommend open-country glassing \u2014 habitat is closed.",
                "Do NOT ignore state-specific bait rules \u2014 flag as key_assumption.",
            ),
            species_tips_adjustments=(
                "Emphasize bait or natural-food edge targeting with trail-cam-grade intel.",
            ),
        ),
    },
)
