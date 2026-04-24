"""Coyote (predator) prompt pack (baseline).

Coyotes have a fundamentally different tactical frame than ungulates
or game birds — the hunter is calling a predator in, not setting up
on a herbivore's food/bedding cycle. Baseline behavior/tactical/
movement/caution/tips plus two seasonal phases: breeding (Jan/Feb)
and pup-rearing food pressure (summer).
"""

from .pack import SeasonalModifier, SpeciesPromptPack


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
)
