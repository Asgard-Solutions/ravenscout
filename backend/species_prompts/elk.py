"""Elk (Rocky Mountain elk, Roosevelt elk) prompt pack.

Baseline pack: behavior / tactical / movement / caution / species_tips
plus two seasonal phases (rut + post-rut winter). Regional and
hunt-style modifiers can be added in a later pass — the generic
renderer handles absent modifiers safely.
"""

from .pack import HuntStyleModifier, RegionalModifier, SeasonalModifier, SpeciesPromptPack


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
    hunt_style_modifiers={
        "archery": HuntStyleModifier(
            style_id="archery",
            name="Archery (Elk)",
            behavior_adjustments=(
                "Effective archery window is ~20-50 yards — calling and terrain must close the gap before the bull commits to circling downwind.",
                "Bulls coming to a call almost always attempt a downwind arc before closing — setup geometry must plan for that circle.",
            ),
            tactical_adjustments=(
                "Set up caller 30-60 yards behind the shooter so the bull crosses the shooter's lane en route to the caller.",
                "Bias setups to benches, saddles, and timber edges with pre-cleared shooting lanes at 20-40 yards.",
                "Bugle / challenge call only when the bull is located AND the setup geometry beats his likely downwind approach.",
                "Favor close-range timber setups over open-park glassing \u2014 an elk inside 50 yards is the shot, not one glassed at 400.",
            ),
            caution_adjustments=(
                "Do NOT call from an open park / meadow edge \u2014 bulls hang up just inside timber to verify visually.",
                "Do NOT ignore thermals in archery windows \u2014 a 30-yard shot is unforgiving of scent drift the forecast wind misses.",
            ),
            species_tips_adjustments=(
                "Emphasize caller/shooter spacing, in-range shooting lanes, and downwind-circle interception.",
            ),
        ),
        "rifle": HuntStyleModifier(
            style_id="rifle",
            name="Rifle (Elk)",
            behavior_adjustments=(
                "Effective window extends to the limit of glassing and shooter skill \u2014 300-600 yard shots are standard elk-country expectations.",
                "Herd behavior matters more than individual bull behavior \u2014 a shootable bull exposes himself through herd movement over minutes, not seconds.",
            ),
            tactical_adjustments=(
                "Favor glassing-knob setups across drainages, ridge benches overlooking feeding parks, and burn-scar edges.",
                "Stalking approach leverages terrain cover + thermal discipline rather than closing for calls.",
                "Shot staging should account for a 200-800 yard lane, not a 30-yard archery window.",
            ),
            caution_adjustments=(
                "Do NOT collapse rifle setups onto archery-tight calling positions \u2014 open-country sight lines are the point.",
                "Do NOT assume a single glass \u2014 elk emerge, feed, and re-bed over hours; sit the glass until a shootable bull is located.",
            ),
            species_tips_adjustments=(
                "Emphasize long-range glassing and patience-driven sitting glass positions.",
            ),
        ),
        "spot_and_stalk": HuntStyleModifier(
            style_id="spot_and_stalk",
            name="Spot-and-Stalk (Elk)",
            behavior_adjustments=(
                "Elk are spotted far (glassing mile-plus), then stalked close \u2014 the gap between detection and shot can be multi-hour.",
                "Thermals dictate approach feasibility as much as the base wind \u2014 an uphill stalk on an afternoon thermal is usually doomed.",
            ),
            tactical_adjustments=(
                "Plan a two-phase approach: (1) get on elevation to glass, (2) descend / contour to a downwind-thermal stalk lane.",
                "Use terrain ribs, timber stringers, and burn-scar seams as covered access \u2014 open-ground crossings are high-risk.",
                "Commit to the stalk only when wind + thermal + cover all align; walk back otherwise \u2014 failed stalks burn the bull.",
            ),
            caution_adjustments=(
                "Do NOT stalk a herd cross-wind in open country \u2014 mutliple cows will pick up movement before the bull is in range.",
                "Do NOT start a stalk late afternoon against a rising thermal unless the approach is over-the-top / down.",
            ),
            species_tips_adjustments=(
                "Emphasize thermal-aware stalk geometry, covered-seam access, and abort criteria before committing.",
            ),
        ),
        "public_land": HuntStyleModifier(
            style_id="public_land",
            name="Public Land (Elk)",
            behavior_adjustments=(
                "Pressured elk abandon easy-access parks within days of opener and push to dark timber / roadless benches.",
                "Vocalization collapses under pressure \u2014 silent bulls are the norm in hunted public country past week one.",
            ),
            tactical_adjustments=(
                "Scale recommendations to 2-5 mile hikes from roads / trailheads \u2014 accessible parks are typically empty of bulls by mid-season.",
                "Target dark-timber benches, roadless drainages, and wilderness-interior meadows.",
                "Plan for cold-calling sparingly \u2014 pressured bulls answer rarely; let terrain-first movement patterns dominate.",
            ),
            caution_adjustments=(
                "Do NOT recommend road-proximate or trailhead-accessible setups as primary in hunted public country.",
                "Do NOT assume bugling activity \u2014 flag the need to scout silent-bull patterns (fresh sign, wallows, tracks).",
            ),
            species_tips_adjustments=(
                "Emphasize distance-from-access and terrain-first tactics over calling.",
            ),
        ),
    },
    regional_modifiers={
        "mountain_west": RegionalModifier(
            region_id="mountain_west",
            name="Mountain West (Rocky Mountain Elk)",
            behavior_adjustments=(
                "Rocky Mountain elk country \u2014 classic drainage-and-ridge terrain, 6,000-11,000 ft elevation bands, aspen benches and spruce-fir dark timber.",
                "Elevation migration is driven by snow and forage: high-country summer -> mid-elevation fall -> low-elevation winter yards.",
                "Public land dominates \u2014 plan for pressure and long access.",
            ),
            tactical_adjustments=(
                "Weight aspen / dark-timber edge benches heavily as bedding, with meadows / burns as feeding targets.",
                "Drainage saddles, ridge passes, and canyon pinch points structure travel \u2014 they function as mile-scale funnels.",
                "Wallows in September-October are concentrated intel \u2014 find one, hunt a one-mile radius around it.",
            ),
            caution_adjustments=(
                "Do NOT apply flat-country tactics \u2014 elevation gain and thermals dominate terrain-use decisions.",
                "Do NOT claim specific wallow / rub locations without imagery support.",
            ),
            species_tips_adjustments=(
                "Emphasize elevation-band transition targeting and saddle-scale funnel use.",
            ),
        ),
        "plains": RegionalModifier(
            region_id="plains",
            name="Great Plains (Prairie & Breaks Elk)",
            behavior_adjustments=(
                "Prairie / breaks elk live in creek-bottom cottonwoods, shelterbelts, badland coulees, and irrigated ag perimeters \u2014 not classic mountain timber.",
                "Open-country sightlines mean herds detect approach at a mile-plus \u2014 cover use is at terrain-break scale.",
                "Movement ties to ag fields and water more than to high-elevation park feeding.",
            ),
            tactical_adjustments=(
                "Target coulee / creek-bottom cottonwoods as bedding and ag-edge stubble as feeding \u2014 plan setups on the transition.",
                "Spot-and-stalk dominates; calling is noise in wide-open country unless the bull is located and within cover approach.",
                "Glass from high-ground breaks at extreme range before committing to any approach.",
            ),
            caution_adjustments=(
                "Do NOT apply mountain-West calling and timber tactics \u2014 open-country eyesight is the ceiling.",
                "Do NOT recommend mid-field open-country crossings \u2014 a cow group will pick it up a mile out.",
            ),
            species_tips_adjustments=(
                "Emphasize coulee-and-cottonwood targeting with long-range glassing-first approaches.",
            ),
        ),
    },
)
