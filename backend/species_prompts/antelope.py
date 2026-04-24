"""Pronghorn Antelope prompt pack (baseline).

Baseline behavior/tactical/movement/caution/tips plus two seasonal
phases: early-season water-waiting and rut.
"""

from .pack import SeasonalModifier, SpeciesPromptPack


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
)
