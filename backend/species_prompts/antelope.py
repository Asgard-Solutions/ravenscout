"""Pronghorn Antelope prompt pack (baseline).

Baseline behavior/tactical/movement/caution/tips plus two seasonal
phases: early-season water-waiting and rut.
"""

from .pack import HuntStyleModifier, RegionalModifier, SeasonalModifier, SpeciesPromptPack


_ANTELOPE_EARLY = SeasonalModifier(
    phase_id="early_season_water",
    name="Early Season / Water Dependence",
    trigger_rules={
        "months": (8, 9),
        "min_temp_f": 70,
        "logic": "either",
    },
    behavior_adjustments=(
        "Pronghorn depend on free water during hot dry early season — stock tanks, windmills, creek seeps, and reservoirs pull them reliably.",
        "Watering patterns are predictable and often midday in heat.",
        "Bucks hold territorial stations around water complexes.",
    ),
    tactical_adjustments=(
        "Water-hole blind / pit-blind setups are the highest-value archery tactic in this phase.",
        "Glass stock tanks from long range to pattern rotation before committing to a blind location.",
        "Rifle hunters: target terrain breaks between bedding sage and water with cross-wind shooting lanes.",
    ),
    caution_adjustments=(
        "Do NOT rely on rut tactics (decoys, challenge) before rut initiation.",
        "Do NOT assume cover stalks are feasible mid-day — pronghorn eyesight and open country will bust you.",
    ),
    species_tips_adjustments=(
        "Emphasize water-hole ambush discipline and long-range glassing to confirm patterns.",
        "Call out the value of pit / ground blinds over treestand setups in open country.",
    ),
)


_ANTELOPE_RUT = SeasonalModifier(
    phase_id="rut",
    name="Rut (Pronghorn)",
    trigger_rules={
        "months": (9, 10),
        "logic": "either",
    },
    behavior_adjustments=(
        "Dominant bucks herd small doe groups and aggressively defend against satellite bucks.",
        "Bucks commit to decoys and to territorial challenges with remarkable predictability once a pattern is established.",
        "Movement extends beyond classic morning/evening windows and bucks cover serious ground.",
    ),
    tactical_adjustments=(
        "Buck-decoy spot-and-stalk tactics become dominant — locate a territorial buck, then close with a decoy into a shootable window.",
        "Open-country terrain breaks, coulees, and windmills are high-value rut-concentration features.",
        "Shot geometry must be planned before the decoy commit — rut-crazed bucks come in fast and stop at unpredictable distances.",
    ),
    caution_adjustments=(
        "Do NOT treat decoy commitment as a guarantee — some bucks hang up or blow off entirely.",
        "Do NOT apply water-hole primacy in full rut — territorial dynamics outweigh simple water dependence.",
    ),
    species_tips_adjustments=(
        "Emphasize buck-decoy stalks with pre-planned shot geometry.",
        "Call out the importance of identifying a dominant buck before committing.",
    ),
)


ANTELOPE_PACK = SpeciesPromptPack(
    canonical_id="antelope",
    display_name="Pronghorn Antelope",
    aliases=(
        "antelope",
        "antelopes",
        "pronghorn",
        "pronghorns",
        "speedgoat",
        "buck antelope",
        "doe antelope",
    ),
    behavior_rules=(
        "Pronghorn live in open country — grasslands, sage flats, short-grass prairie — where eyesight (equivalent to 8x glass) dominates their defense.",
        "Pronghorn depend on free water in hot dry conditions, especially early season.",
        "Does and fawns form loose groups; bucks are more solitary outside rut.",
        "Pronghorn rarely jump fences — they go UNDER. Known crossing points create funnels across open country.",
        "Wind-scoured ridges, coulees, and windmill/tank complexes are the landscape features that concentrate movement.",
    ),
    tactical_guidance=(
        "Favor spot-and-stalk terrain use — cover is rare; coulees, draws, and wind-scoured benches are the approach corridors.",
        "Water-hole blinds (pit / ground blind) are the dominant early-season play.",
        "Fence-crossing funnels beat random cross-country intercept in open country.",
        "Glass from elevated terrain at extreme range — a mile+ is normal scouting distance.",
        "Plan shot geometry around open-country rangefinding — 300-500 yard shots are normal rifle expectations.",
    ),
    movement_assumptions=(
        "Water (dawn / midday in heat) <-> bedding in sparse sage with long sightlines <-> evening feeding.",
        "Rut disrupts simple water-bedding cycles — bucks drive movement based on territorial dynamics.",
        "Pronghorn rarely bed in heavy cover; plan against open-country sight advantages.",
    ),
    caution_rules=(
        "Do NOT apply deer/elk cover-based logic — pronghorn tactics live or die on open-country terrain use.",
        "Do NOT invent water sources or fence-crossing locations unless visible or strongly inferable.",
        "Do NOT assume a stalk will go unnoticed — pronghorn eyesight is the tactical ceiling.",
        "Lower confidence on daytime stalk recommendations if terrain breaks can't be reasonably inferred.",
    ),
    species_tips_guidance=(
        "Pronghorn-specific themes only — do not drift into deer/elk cover tactics.",
        "Cover water-hole blind setups, coulee/draw stalking, fence-crossing funnels, and long-range shot realism.",
        "Call out the dominant role of eyesight in pronghorn defense.",
    ),
    seasonal_modifiers={
        "early_season_water": _ANTELOPE_EARLY,
        "rut": _ANTELOPE_RUT,
    },
    hunt_style_modifiers={
        "archery": HuntStyleModifier(
            style_id="archery",
            name="Archery (Pronghorn)",
            behavior_adjustments=(
                "Effective archery window is ~20-45 yards \u2014 open-country visibility matters less than getting inside bow range.",
                "Pronghorn eyesight treats movement at 300+ yards as a threat; a stalked-in archery shot requires cover-discipline that pronghorn country rarely supplies.",
            ),
            tactical_adjustments=(
                "Water-hole ambush from pit blind / ground blind is the dominant archery method \u2014 commit to a blind on pattern-confirmed water.",
                "Decoy-based rut stalks: use dominant buck aggression to close in on a decoy inside a rangefinder-confirmed distance.",
                "Coulees and draws are the only archery-feasible stalk corridors \u2014 approach is a cover-first game, not distance-first.",
            ),
            caution_adjustments=(
                "Do NOT recommend cross-country open-plain stalks \u2014 eyesight kills the approach before you're inside 100 yards.",
                "Do NOT assume a committed rut buck equals a clean shot \u2014 pronghorn stop at unpredictable ranges on a decoy.",
            ),
            species_tips_adjustments=(
                "Emphasize water-hole blinds and decoy-based rut stalks; flag eyesight as the tactical ceiling.",
            ),
        ),
        "rifle": HuntStyleModifier(
            style_id="rifle",
            name="Rifle (Pronghorn)",
            behavior_adjustments=(
                "Effective window extends to the limit of optics and shooter skill \u2014 300-600 yard shots are normal open-country expectations.",
                "Pronghorn rarely hold standing broadside at close range \u2014 the shot opportunity is at distance, across coulees, or from prone rested positions.",
            ),
            tactical_adjustments=(
                "Glass from breaks / ridge points at extreme range; stalk uses terrain to close to a prone-rested shot position.",
                "Favor coulee / draw access for approach \u2014 crest terrain and drop prone before presenting skyline.",
                "Plan shot from a stable rest (bipod / pack) with pre-ranged reference points.",
            ),
            caution_adjustments=(
                "Do NOT shoot offhand at pronghorn \u2014 the open-country standard is a rested prone position with verified range.",
                "Do NOT chase a group that is already running \u2014 pronghorn outrun you easily; re-plan from a fresh glass.",
            ),
            species_tips_adjustments=(
                "Emphasize terrain-cover approach and rested-prone shot staging.",
            ),
        ),
        "blind": HuntStyleModifier(
            style_id="blind",
            name="Ground Blind / Pit Blind (Pronghorn)",
            behavior_adjustments=(
                "Pronghorn tolerate established blinds at water better than deer do \u2014 movement inside a brushed-in blind usually goes undetected.",
                "Pattern predictability at water is the highest of any North American big-game species during hot dry early season.",
            ),
            tactical_adjustments=(
                "Target stock tanks, windmill outflows, creek-edge seeps, and earthen reservoirs with confirmed daily rotations.",
                "Favor pit blinds where legal \u2014 lowest silhouette = highest success.",
                "Brush in a ground blind days ahead of the sit if possible \u2014 fresh blinds spook heat-pressured pronghorn.",
            ),
            caution_adjustments=(
                "Do NOT assume instant pattern \u2014 blind placement requires 1-3 days of intel before sitting.",
                "Do NOT sit a dry tank \u2014 water activity changes week to week in drought cycles.",
            ),
            species_tips_adjustments=(
                "Emphasize blind brushing, pit / ground legality, and pattern-first sit selection.",
            ),
        ),
        "spot_and_stalk": HuntStyleModifier(
            style_id="spot_and_stalk",
            name="Spot-and-Stalk (Pronghorn)",
            behavior_adjustments=(
                "Spotted pronghorn usually detect a human within 1/4 mile unless cover is used correctly.",
                "Stalk windows open when pronghorn feed head-down in coulees, arroyos, or drop over a ridge out of sight.",
            ),
            tactical_adjustments=(
                "Use coulees, draws, dry washes, and cut-bank ridges as approach corridors \u2014 never walk a skyline.",
                "Watch the group; stalk during head-down feeding or when they crest over a terrain break.",
                "Finish the stalk on a belly crawl over the last 100-200 yards, using a range-ready rest.",
            ),
            caution_adjustments=(
                "Do NOT stalk upwind-of-cover with open ground to cross \u2014 a single sentinel doe ends the hunt.",
                "Do NOT chase a bumped group \u2014 pronghorn run miles; wait for new groups.",
            ),
            species_tips_adjustments=(
                "Emphasize coulee / draw approach, head-down timing, and terrain-break stalk finals.",
            ),
        ),
    },
    regional_modifiers={
        "plains": RegionalModifier(
            region_id="plains",
            name="Great Plains (High-Density Pronghorn)",
            behavior_adjustments=(
                "Great Plains country \u2014 Wyoming, Montana, Dakotas, Nebraska sandhills, northeastern Colorado \u2014 the core pronghorn range.",
                "High densities mean multiple glassable groups per mile in strong country; selection matters as much as finding.",
                "Fence-crossing funnels across BLM / private checkerboard are important landscape-scale features.",
            ),
            tactical_adjustments=(
                "Plan glassing routes along section lines, BLM / private fence lines, and gravel road networks \u2014 pattern movement BEFORE stalking.",
                "Identify dominant bucks early in the season before pressure shifts herd composition.",
                "Water-hole blinds near stock tanks / windmills are best early season; spot-and-stalk dominates after water dries or cools.",
            ),
            caution_adjustments=(
                "Do NOT ignore fence-crossing points \u2014 access geometry constrains real approach options across the checkerboard.",
                "Do NOT underestimate truck pressure \u2014 road-accessible country is heavily glassed and spooked.",
            ),
            species_tips_adjustments=(
                "Emphasize pattern-first glassing, water-hole setups, and fence-crossing awareness.",
            ),
        ),
        "mountain_west": RegionalModifier(
            region_id="mountain_west",
            name="Intermountain West / Sagebrush Pronghorn",
            behavior_adjustments=(
                "Intermountain West (ID / NV / UT / OR high desert) \u2014 sagebrush basins, alkali flats, and juniper-sage transition.",
                "Lower densities than the Plains but larger solitary bucks and more terrain relief.",
            ),
            tactical_adjustments=(
                "Target juniper-sage transition ridges and sagebrush basins with long glass before approach.",
                "Terrain relief supports coulee / ridge approach better than the flatter Plains \u2014 exploit it.",
                "Water-hole sits viable on remote springs; spot-and-stalk for large solitary bucks is the classic play.",
            ),
            caution_adjustments=(
                "Do NOT apply high-density Plains pattern expectations \u2014 sagebrush country demands more ground covered per buck.",
                "Do NOT overlook tag / unit complexity; flag as key_assumption.",
            ),
            species_tips_adjustments=(
                "Emphasize juniper-sage targeting and long-glass solitary-buck hunting.",
            ),
        ),
    },
)
