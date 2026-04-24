"""Elk (Rocky Mountain elk, Roosevelt elk) prompt pack.

Baseline pack: behavior / tactical / movement / caution / species_tips
plus two seasonal phases (rut + post-rut winter). Regional and
hunt-style modifiers can be added in a later pass — the generic
renderer handles absent modifiers safely.
"""

from .pack import SeasonalModifier, SpeciesPromptPack


_ELK_RUT = SeasonalModifier(
    phase_id="rut",
    name="Rut (Bugle)",
    trigger_rules={
        "months": (9, 10),
        "logic": "either",
    },
    behavior_adjustments=(
        "Bulls actively bugle and herd cows; movement extends well beyond classic dawn/dusk.",
        "Satellite bulls prowl the fringes of herded groups looking to break cows off.",
        "Cow groups shift to higher-elevation timbered benches and meadows as bulls push them.",
        "Wallows and rub trees see intense visitation; sign freshens within hours not days.",
    ),
    tactical_adjustments=(
        "Favor midday setups on bugling herd bulls holed up in dark timber saddles and benches — not just dawn/dusk.",
        "Target active wallows, mud-torn rub lines, and fresh bugle crescendos as high-value ambush or call-in points.",
        "Cold-calling / bugle-challenge setups become viable when the bull is located and approachable within cover.",
        "Pressure during the rut is high; silent access and scent discipline matter more than raw distance covered.",
    ),
    caution_adjustments=(
        "Do NOT treat bugle activity as a guaranteed daytime shot window — dominant bulls frequently break off and disappear.",
        "Do NOT assume every bugle is a shootable bull; satellite bulls, cows, and spikes all vocalize.",
    ),
    species_tips_adjustments=(
        "Emphasize calling discipline and the need for a close, quiet setup before committing to a challenge sequence.",
        "Call out wallow and fresh-rub concentration as near-term high-value targets.",
    ),
)


_ELK_WINTER = SeasonalModifier(
    phase_id="winter_range",
    name="Late Season / Winter Range",
    trigger_rules={
        "months": (11, 12, 1),
        "max_temp_f": 30,
        "logic": "either",
    },
    behavior_adjustments=(
        "Herds concentrate on lower-elevation wintering grounds — south-facing slopes, wind-scoured ridges, and valley benches.",
        "Movement is food-driven (remaining forage, ag edges, haystacks) rather than rut-driven.",
        "Group sizes expand; larger herds create overlapping sightlines that make stalks difficult.",
    ),
    tactical_adjustments=(
        "Target south-facing feeding benches, ag edges, and low-elevation browse with strong glassing setups.",
        "Plan long-range observation before committing to a stalk — large herds detect movement easily.",
        "Wind-scoured ridgelines are high-probability bedding / loafing zones on cold days.",
    ),
    caution_adjustments=(
        "Do NOT apply rut tactics (calling, bugle-challenge) in post-rut winter context.",
        "Do NOT assume high-elevation timber holds elk once snowpack and cold drive them down.",
    ),
    species_tips_adjustments=(
        "Emphasize glassing-first, stalk-second approach on open wintering ground.",
        "Call out the transition from cover-hunting to open-country glassing.",
    ),
)


ELK_PACK = SpeciesPromptPack(
    canonical_id="elk",
    display_name="Elk",
    aliases=(
        "elk",
        "elks",
        "wapiti",
        "rocky mountain elk",
        "roosevelt elk",
        "bull elk",
        "cow elk",
    ),
    behavior_rules=(
        "Elk bed in dark north-facing timber, secluded benches, and thick pockets where they can hear and smell incoming threats from multiple directions.",
        "Elk feed in mountain meadows, burns, old cuts, ag edges, and aspen benches — typically at the cool edges of daylight and through the night.",
        "Wind is decisive — elk travel on thermals: downhill in the morning cool, uphill in afternoon warmth.",
        "Water sources (seeps, springs, wallows) become social hubs, especially in late summer and the rut.",
        "Elk are herd animals; cow groups have many eyes/ears/noses — approach geometry must beat the whole group, not just the target.",
        "Rubs, wallows, tracks, and droppings give strong freshness signals when visible on the landscape.",
    ),
    tactical_guidance=(
        "Favor transition zones between bedding timber and feeding parks, saddles that connect drainages, and benches above creek bottoms.",
        "Thermals matter as much as the forecast wind — plan an approach that beats BOTH the synoptic wind AND the likely thermal drift at the recommended hour.",
        "Glassing from ridgelines / across drainages is often higher-value than still-hunting — cover distance with optics before burning boot leather.",
        "Target wallows, rub lines, and fresh sign concentrations when they can be confirmed in imagery or strongly inferred from terrain + water.",
        "Expect to hunt hard, far, and high — recommend setups that accept elk country scale, not a one-mile deer-woods radius.",
    ),
    movement_assumptions=(
        "Feed (parks / burns / meadows) at night -> bedding (dark timber / high north benches) at first light -> transition back at dusk.",
        "Thermals flip twice a day — morning downslope, evening upslope — and drive access choices as much as the base wind.",
        "Mid-day movement is possible in cool shaded draws and during the rut; lower confidence elsewhere.",
    ),
    caution_rules=(
        "Do NOT apply whitetail funnel/saddle logic at deer-woods scale — elk terrain operates at drainage and ridge scale.",
        "Do NOT invent wallows, rub lines, or specific beds unless visible or strongly inferable from imagery.",
        "Do NOT claim a specific bull's behavior — recommendations should target herd/age-class patterns.",
        "Lower confidence sharply when thermals can't be reasonably inferred from slope aspect and time of day.",
    ),
    species_tips_guidance=(
        "Elk-specific themes only — do not drift into whitetail or mule-deer tactics.",
        "Cover thermal-aware access, glass-first / stalk-second, bedding-to-feeding drainage travel, and the role of water/wallows.",
        "Acknowledge elk-country scale and that setups will often be mile-plus affairs.",
    ),
    seasonal_modifiers={
        "rut": _ELK_RUT,
        "winter_range": _ELK_WINTER,
    },
)
