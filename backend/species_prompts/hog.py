"""Wild Hog (feral swine) prompt pack."""

from .pack import SpeciesPromptPack

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
)
