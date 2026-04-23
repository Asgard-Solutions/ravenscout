"""Wild Hog (feral swine) prompt pack."""

from .pack import SeasonalModifier, SpeciesPromptPack

# ----------------------------- Seasonal modifiers -----------------------------
# Hog activity is driven more by temperature and water than by
# calendar. Triggers use temperature first, with summer months as a
# backup when temperature is missing. Cold-weather modifier does the
# reverse. Drought modifier is extra-conservative because we can't
# reliably detect drought from a single hunt's metadata — it only
# triggers at high temperatures near the peak of summer.

_HOG_DROUGHT = SeasonalModifier(
    phase_id="drought_conditions",
    name="Drought Conditions (inferred)",
    trigger_rules={
        "min_temp_f": 90,
        "months": (7, 8, 9),
        "logic": "both",
    },
    behavior_adjustments=(
        "Hogs concentrate heavily around any remaining water — creeks, ponds, seeps, wet drainages, stock tanks.",
        "Rooting near water intensifies as uplands dry out.",
        "Daytime activity retreats even further into shaded wet bottoms and thick cover; movement is dominantly nocturnal.",
    ),
    tactical_adjustments=(
        "Ambush near the last reliable water sources feeding a sounder's travel cover is the single highest-value setup.",
        "Stand downwind of trails leading INTO water, not away from it.",
        "Assume shooting windows compress to early morning, late evening, and first legal light; plan access accordingly.",
    ),
    caution_adjustments=(
        "Do NOT claim drought from hunt_date alone. Only treat as drought if temperature is confidently high AND the date falls in mid-to-late summer.",
        "Lower confidence for any daylight recommendation.",
    ),
    species_tips_adjustments=(
        "Emphasize water-ambush setups with cover-line approach.",
        "Call out the strong nocturnal bias explicitly.",
    ),
    confidence_note=(
        "True drought cannot be inferred from a single day's weather. Treat this modifier as a water-ambush bias, not a verified drought claim, and lower confidence accordingly."
    ),
)

_HOG_HOT_WEATHER = SeasonalModifier(
    phase_id="hot_weather",
    name="Hot Weather",
    trigger_rules={
        "min_temp_f": 75,
        "months": (5, 6, 7, 8, 9),
        "logic": "either",
    },
    behavior_adjustments=(
        "Water and wallow dependence intensifies; sounders stay close to wet bottoms, shaded creek draws, and thick cover.",
        "Daytime activity drops sharply; most movement is crepuscular or nocturnal.",
        "Rooting concentrates near moist soil (wet bottoms, shaded stream banks).",
    ),
    tactical_adjustments=(
        "Ambush trails leading to / from water and wallows. Approach from downwind with silent cover-line access.",
        "Bias setups to last legal light of evening and first light of morning.",
        "Shaded thickets adjacent to water are the primary daytime holding pattern — don't bust them on access.",
    ),
    caution_adjustments=(
        "Do NOT recommend long daylight sits as high value.",
        "Lower confidence on any ambitious mid-day setup.",
    ),
    species_tips_adjustments=(
        "Emphasize water/wallow ambush plays at the edges of the day.",
        "Call out silent low-impact access — heat-stressed sounders bust easily.",
    ),
)

_HOG_COLD_WEATHER = SeasonalModifier(
    phase_id="cold_weather",
    name="Cold Weather",
    trigger_rules={
        "max_temp_f": 40,
        "months": (12, 1, 2),
        "logic": "either",
    },
    behavior_adjustments=(
        "Daytime activity INCREASES as hogs feed more to maintain body temperature.",
        "Water dependence relaxes — hogs range wider for food when temperatures drop.",
        "Sounders favor south-facing thickets and sunny thermal cover mid-day, then move to food in the afternoon.",
    ),
    tactical_adjustments=(
        "Afternoon and evening food-source setups (ag edges, feeders, mast concentrations, rooting fields) are prime.",
        "Mid-day sits become viable near thermal cover edges and south-facing thickets.",
        "Cold-front evenings are especially high value.",
    ),
    caution_adjustments=(
        "Do NOT assume cold-weather daylight movement without an actual cold signal (temperature or clear winter months).",
        "Still avoid deer-style funnel logic as the primary frame.",
    ),
    species_tips_adjustments=(
        "Emphasize afternoon/evening food-source setups.",
        "Call out that cold fronts amplify daylight movement.",
    ),
)

HOG_PACK = SpeciesPromptPack(
    canonical_id="hog",
    display_name="Wild Hog",
    aliases=(
        "hog",
        "hogs",
        "pig",
        "pigs",
        "wild hog",
        "wild hogs",
        "feral hog",
        "feral hogs",
        "feral swine",
        "wild boar",
        "boar",
    ),
    behavior_rules=(
        "Hogs bed in thick security cover — briar thickets, cane, cedar bottoms, swamps, palmetto, CRP, briar-choked drainages.",
        "Hogs are tied to water: creeks, rivers, ponds, seeps, wallows, and wet drainages are primary attractants.",
        "Hogs concentrate on easy food: agricultural edges, feeders, mast, rooting fields, spilled grain, wet crop bottoms.",
        "Pressure and temperature shift hogs heavily toward night activity; daytime movement drops in hot or hunted conditions.",
        "Hogs often travel as sounders — multiple eyes, ears, and noses in one group make an approach riskier.",
        "Rooting, trails, wallows, and mud rubs are sign; assume movement where this sign is clearly visible.",
    ),
    tactical_guidance=(
        "Prioritize ambush setups between thick bedding cover and water / food / wallows.",
        "Favor creek crossings, wet-bottom edges, ag-field corners against cover, and feeder lines as stand locations when clearly supported by imagery.",
        "Wind matters but line of sight through dense cover matters more — pick a setup where shots into a travel lane are actually available.",
        "Low-impact silent access is critical; sounders of hogs bust easily and then go nocturnal.",
        "For hot / midday conditions, bias toward shaded wet bottoms and wallows; for cool evenings bias toward feeding concentrations.",
        "Mark roads, parking areas, and high-traffic human zones that would push sounders as `avoid` overlays.",
        "Acknowledge that productive windows may fall OUTSIDE classic deer dawn/dusk — hogs can move at any time tied to temperature, pressure, and food.",
    ),
    movement_assumptions=(
        "Bed (thick cover) <-> water / wallow (mid-day or heat).",
        "Bed -> feed (ag edge, feeder, mast) evening, often extending into full dark.",
        "Night movement is common — lower confidence on pure daylight setups without strong cover/water concentration support.",
        "Sounder size amplifies alertness; single-boar assumptions are weaker priors than sounder-travel assumptions.",
    ),
    caution_rules=(
        "Do NOT invent wallows, rooting, feeders, or specific bedding locations unless they are visually supported or strongly inferable from imagery.",
        "Do NOT apply deer-style funnel/saddle logic as the dominant frame for hogs; cover + water + food concentration usually outweighs it.",
        "Do NOT claim a legal-shooting-light daytime window is likely without explicit terrain/cover/food support.",
        "Lower confidence heavily when the recommendation relies on temperature, hunting pressure, or nocturnal behavior that is not visible in imagery.",
        "Never treat a sounder's reaction to wind or approach noise as certain.",
    ),
    species_tips_guidance=(
        "Hog-specific tips only — do not drift into deer or turkey tactics.",
        "Cover thick-cover-to-water/food ambush logic, silent low-impact approach, sounder-awareness, and temperature-driven activity windows.",
        "Note that hog activity can fall outside classic dawn/dusk and that nocturnal behavior is common under pressure or heat.",
        "Acknowledge uncertainty about wallows, feeders, and bedding that aren't visibly supported in imagery.",
    ),
    # Drought first (most specific), then hot, then cold.
    seasonal_modifiers={
        "drought_conditions": _HOG_DROUGHT,
        "hot_weather": _HOG_HOT_WEATHER,
        "cold_weather": _HOG_COLD_WEATHER,
    },
)
