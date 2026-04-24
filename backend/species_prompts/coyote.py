"""Coyote (predator) prompt pack (baseline).

Coyotes have a fundamentally different tactical frame than ungulates
or game birds — the hunter is calling a predator in, not setting up
on a herbivore's food/bedding cycle. Baseline behavior/tactical/
movement/caution/tips plus two seasonal phases: breeding (Jan/Feb)
and pup-rearing food pressure (summer).
"""

from .pack import HuntStyleModifier, RegionalModifier, SeasonalModifier, SpeciesPromptPack


_COYOTE_BREEDING = SeasonalModifier(
    phase_id="breeding_season",
    name="Breeding Season",
    trigger_rules={
        "months": (1, 2, 3),
        "logic": "either",
    },
    behavior_adjustments=(
        "Pairs actively vocalize — howl-yip exchanges, territorial claim barks — and respond strongly to challenge howls.",
        "Males cover long distances seeking / guarding females; daytime movement increases.",
        "Territorial aggression is high; lone coyote calls are treated as intruders and prompt committed responses.",
    ),
    tactical_adjustments=(
        "Challenge-howl setups beat pure prey-distress calls for alpha-male commitment.",
        "Target pair-territory cores — draw heads, brushy hollows near reliable prey, and known den vicinity.",
        "Plan for faster commitment — coyotes come in HARD and FAST in breeding; shot windows open and close inside seconds.",
    ),
    caution_adjustments=(
        "Do NOT assume all commitments are shoot-ready — paired coyotes often circle downwind to verify.",
        "Do NOT rely on distress-call pattern alone when territorial/challenge frames are higher-value.",
    ),
    species_tips_adjustments=(
        "Emphasize challenge-howl + silent-shooter pair setups with pre-cleared lanes.",
        "Call out the fast-commit speed difference from other seasons.",
    ),
)


_COYOTE_PUP_REARING = SeasonalModifier(
    phase_id="pup_rearing",
    name="Pup Rearing / Food Pressure",
    trigger_rules={
        "months": (5, 6, 7, 8),
        "logic": "either",
    },
    behavior_adjustments=(
        "Adults with pups are under intense calorie pressure and commit to high-value distress sounds aggressively.",
        "Daytime movement is more tolerant when food delivery is the priority.",
        "Young-in-distress calls (rabbit, fawn, pup-distress) can produce unusually committed responses.",
    ),
    tactical_adjustments=(
        "Pup-distress and young-prey-distress calls gain weight over pure adult-prey distress.",
        "Target den-area perimeters and high-prey ag-edge concentrations.",
        "Plan for multi-dog commitment — adult pairs may both respond to a big-meal call.",
    ),
    caution_adjustments=(
        "Do NOT set up where a pup-bearing female could be shot — ethically and pragmatically, identification matters.",
        "Do NOT overuse one sound — in pup-rearing, coyotes get pressure-educated fast on repeat setups.",
    ),
    species_tips_adjustments=(
        "Emphasize young-prey distress setups with rapid-commit shot preparation.",
        "Flag the multi-animal commit risk and the need for identification before shots.",
    ),
)


COYOTE_PACK = SpeciesPromptPack(
    canonical_id="coyote",
    display_name="Coyote",
    aliases=(
        "coyote",
        "coyotes",
        "song dog",
        "song dogs",
        "prairie wolf",
        "yote",
        "yotes",
    ),
    behavior_rules=(
        "Coyotes are territorial pair-bonded predators — local pair territories set the frame, not broad migration or herd dynamics.",
        "Smell and hearing are decisive — coyotes circle downwind of any sound source to verify before committing.",
        "Coyotes feed on rodents, rabbits, fawns, carrion, ag waste, and garbage — food sources shape hot-spot geography.",
        "Coyotes are crepuscular-to-nocturnal; daytime movement is elevated in breeding, pup-rearing, and heavy food-pressure conditions.",
        "Fresh tracks, scat on trails, and lope runs through snow/dust are reliable sign — den sites concentrate activity seasonally.",
    ),
    tactical_guidance=(
        "Calling (distress / challenge howl / vocalization) is the dominant engagement mode — set up to intercept the downwind circle, not face-on to the call.",
        "Favor setups with a crosswind or slight quartering wind into a cleared downwind shooting lane.",
        "Target transition zones between ag / prey-rich cover and loafing areas — shelter belts, creek bottoms, ag-edge brush.",
        "Plan setups with elevated sightlines — coyote eyesight is modest but they use terrain like a rifleman.",
        "Consider an electronic caller + decoy motion — a visual decoy shortens commit times sharply.",
    ),
    movement_assumptions=(
        "Patrol circuit through territory with repeated bed / loaf / hunt / scent-mark stops — territorial loops are commonly daily or near-daily.",
        "Daytime activity scales with breeding / pup-rearing / food pressure; winter nights are high activity generally.",
        "Expect a downwind circle on nearly every call commit — plan the ambush around that circle, not the straight-in lane.",
    ),
    caution_rules=(
        "Do NOT apply ungulate bedding/feeding-cycle logic as the dominant frame for coyotes — territorial and pair-bonded dynamics dominate.",
        "Do NOT invent den sites, scent posts, or pair territories unless visible or strongly inferable from imagery.",
        "Do NOT assume a commit equals a shot — downwind circling and hang-ups are the norm.",
        "Lower confidence sharply when wind/thermal direction can't be reasonably inferred — wind is the entire game.",
    ),
    species_tips_guidance=(
        "Coyote-specific predator-calling themes only — do not drift into big-game tactics.",
        "Cover crosswind-setup discipline, downwind-circle interception, caller + decoy synergy, and territorial/pair frames.",
        "Call out identification discipline — dogs, foxes, and pup-bearing females must not be confused for target coyotes.",
    ),
    seasonal_modifiers={
        "breeding_season": _COYOTE_BREEDING,
        "pup_rearing": _COYOTE_PUP_REARING,
    },
    hunt_style_modifiers={
        "rifle": HuntStyleModifier(
            style_id="rifle",
            name="Rifle (Coyote)",
            behavior_adjustments=(
                "Effective window is 50-400 yards \u2014 coyotes circling downwind expose broadside at distance more reliably than face-on at close range.",
                "A committed coyote closes fast \u2014 rifle setup must be pre-rested and zeroed to an expected kill zone, not chased with the rifle.",
            ),
            tactical_adjustments=(
                "Set up with a rested bipod / pack, sight downwind and crosswind of the caller \u2014 the downwind arc is where the shot comes.",
                "Favor elevated sightline positions with 360-degree visibility \u2014 coyotes pop up from unexpected quadrants.",
                "Night hunting with thermal / night vision is an increasingly common rifle style \u2014 plan setup around that if hunt-style indicates it.",
            ),
            caution_adjustments=(
                "Do NOT set rifle pointed toward the call \u2014 shots come from the downwind side, not the caller's side.",
                "Do NOT shoot running coyotes casually \u2014 misses educate territory residents quickly.",
            ),
            species_tips_adjustments=(
                "Emphasize pre-rested rifle, downwind-arc coverage, and elevated sight lines.",
            ),
        ),
        "archery": HuntStyleModifier(
            style_id="archery",
            name="Archery (Coyote)",
            behavior_adjustments=(
                "Archery effective range is ~20-40 yards \u2014 requires a coyote to commit close, typically to a decoy + call in cover.",
                "Decoy + motion is nearly mandatory \u2014 a coyote committing to a visual lock inside bow range gets fixated long enough for a shot.",
            ),
            tactical_adjustments=(
                "Combine electronic caller + decoy in an opening with 20-30 yard cleared lanes behind it.",
                "Hide 15-25 yards off the decoy, slightly crosswind, with a concealed shooting position.",
                "Set up with a partner running the caller remotely when possible.",
            ),
            caution_adjustments=(
                "Do NOT expect rifle-style commit patterns \u2014 archery requires CLOSER, more visual commitment.",
                "Do NOT rely on distress alone \u2014 decoy-based visual fixation dramatically improves bow range opportunities.",
            ),
            species_tips_adjustments=(
                "Emphasize decoy + caller setups with pre-cleared close-range lanes.",
            ),
        ),
        "public_land": HuntStyleModifier(
            style_id="public_land",
            name="Public Land (Coyote)",
            behavior_adjustments=(
                "Pressured coyotes on public land are call-shy \u2014 repeated pressure teaches them electronic calls mean danger.",
                "Territory turnover is faster \u2014 what worked two weeks ago may be a different pair now.",
            ),
            tactical_adjustments=(
                "Vary call types and sounds aggressively \u2014 fewer repeated sequences, more low-volume challenge howls.",
                "Target less-accessed pockets \u2014 creek bottoms, timber strips off-road, and sections behind walk-in barriers.",
                "Shorten sit times (15-20 min) and cover more ground \u2014 pressured coyotes commit within 10 min or not at all.",
            ),
            caution_adjustments=(
                "Do NOT repeat call sequences that educated the local population.",
                "Do NOT assume long-sit tactics from private land translate \u2014 public-land coyote hunting is a mobile game.",
            ),
            species_tips_adjustments=(
                "Emphasize varied calls, mobile sits, and access-distance thinking.",
            ),
        ),
    },
    regional_modifiers={
        "plains": RegionalModifier(
            region_id="plains",
            name="Great Plains / Open-Country Coyote",
            behavior_adjustments=(
                "Plains coyote country \u2014 wide open, moderate cover in creek bottoms, shelterbelts, and ag-edge brush.",
                "Coyotes are highly visual \u2014 they commit from long distances once a call is located.",
            ),
            tactical_adjustments=(
                "Set up on elevated prairie breaks / ridge points with 360-degree sightlines \u2014 commits come from a half-mile+.",
                "Use fox pro / foxpro + decoy with long-range visibility \u2014 scope the horizon during the entire sit.",
                "Work fields adjacent to shelterbelts and creek bottoms as staging areas for traveling coyotes.",
            ),
            caution_adjustments=(
                "Do NOT set up low \u2014 plains coyotes use the whole horizon; elevation is the setup.",
                "Do NOT ignore cross-wind geometry \u2014 even in open country, the downwind arc is the kill zone.",
            ),
            species_tips_adjustments=(
                "Emphasize elevated 360-sight setups and decoy + caller combos.",
            ),
        ),
        "southeast_us": RegionalModifier(
            region_id="southeast_us",
            name="Southeastern Coyote",
            behavior_adjustments=(
                "Southeastern coyote country \u2014 dense hardwood, pine plantation, agricultural mosaic, swamp-edge habitat.",
                "Closed cover means commits are close (inside 100 yards) and often silent \u2014 the first you see them is at bow/shotgun range.",
                "Warm climate keeps coyotes on food-pressure cycles year-round.",
            ),
            tactical_adjustments=(
                "Set up on ag-edge cover / field corners / clearcut transitions with 50-100 yard cleared lanes.",
                "Shotgun (with buckshot) is a regionally common method \u2014 plan for CLOSE-range commits, not long shots.",
                "Coop scent + decoy are especially effective in mixed-ag country where coyotes hunt easy meals.",
            ),
            caution_adjustments=(
                "Do NOT set up for open-country long shots \u2014 the habitat doesn't support it.",
                "Do NOT ignore shotgun as a legitimate tool \u2014 habitat dictates weapon choice.",
            ),
            species_tips_adjustments=(
                "Emphasize close-range field-corner / transition-edge setups.",
            ),
        ),
        "mountain_west": RegionalModifier(
            region_id="mountain_west",
            name="Mountain West Coyote",
            behavior_adjustments=(
                "Mountain West coyotes use elevation and vegetation zones \u2014 sage flats, juniper, aspen benches, and willow bottoms.",
                "Thermals + wind structure commit patterns strongly \u2014 coyotes use terrain like small predators.",
            ),
            tactical_adjustments=(
                "Set up downwind of classic prey-concentrating terrain (willow bottoms, aspen benches, sage flats with rodent sign).",
                "Use terrain contours and cover lines \u2014 a glass-first commitment pattern often beats the walking-and-calling Plains method.",
                "Consider winter snow cover for pattern reading (tracks, scat freshness) as intel before calling sequence.",
            ),
            caution_adjustments=(
                "Do NOT apply Plains open-sight tactics to contour country \u2014 coyotes use terrain to hide during the commit.",
                "Do NOT neglect thermals; they flip twice daily and change downwind geometry mid-sit.",
            ),
            species_tips_adjustments=(
                "Emphasize thermal-aware terrain-based setups in sage / juniper / aspen country.",
            ),
        ),
    },
)
