"""Wild Hog (feral swine) prompt pack."""

from .pack import HuntStyleModifier, RegionalModifier, SeasonalModifier, SpeciesPromptPack

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
    hunt_style_modifiers={
        "archery": HuntStyleModifier(
            style_id="archery",
            name="Archery (Hog)",
            behavior_adjustments=(
                "Effective shot window is roughly 15-30 yards AND requires penetration angles through a thick shoulder shield on mature boars — quartering-away is preferred, straight-on is typically a pass.",
                "Sounders present multiple eyes, ears, and noses — draw windows compress to the moment when most of the group is head-down in rooting or feeding.",
            ),
            tactical_adjustments=(
                "Favor stand setups directly on top of a water / wallow / feeder approach at 15-25 yards with thick back-cover, not broad sightline overlooks.",
                "Bias elevated setups (treestand / tower) over ground — hog eyesight is weaker above the horizon line and draw movement is better hidden.",
                "Prioritize evening/early-morning cold-front windows when daylight movement is most likely.",
                "Plan for a slow, deliberate encounter — hogs commit to food but will vanish at the first un-shielded movement.",
            ),
            caution_adjustments=(
                "Do NOT recommend marginal angles or frontal shots as high-confidence setups for archery hog.",
                "Do NOT assume sounders are 'easy multiple targets' — alert levels scale with sounder size, not down.",
            ),
            species_tips_adjustments=(
                "Emphasize tight-range ambush on water / wallow / food with quartering-away shot geometry.",
                "Flag shot-angle discipline explicitly — this matters more for hog than for deer.",
            ),
        ),
        "rifle": HuntStyleModifier(
            style_id="rifle",
            name="Rifle (Hog)",
            behavior_adjustments=(
                "Effective shot window extends to the limit of visibility and shooter skill — setups can work longer ambushes over ag, sendero systems, pipeline right-of-ways, or open creek-bottom approaches.",
                "Sounders can sometimes be taken in multiples if the first shot angle isolates one from the group — setups should consider second-shot geometry, not only the first shot.",
            ),
            tactical_adjustments=(
                "Favor elevated or long-sightline setups: feeder lanes, ag-field corners, sendero intersections, creek-bottom crossings visible from 75-200 yards.",
                "Bias downwind of the expected travel, with enough lateral cover that a missed first shot doesn't immediately burn the setup.",
                "Night / low-light hunting where legal changes everything — flag any hunt_date/time_window implying night work as a distinct context, but never assume night-hunting legality.",
                "Rifle excels in open-country hog setups (Plains, South Texas ranches) where archery would struggle.",
            ),
            caution_adjustments=(
                "Do NOT assume night-hunting legality or thermal-optic access.",
                "Do NOT neglect shot backstop — open-country rifle shots at sounders need a clean backdrop, not just a clean angle.",
            ),
            species_tips_adjustments=(
                "Emphasize elevated long-sightline ambush setups and second-shot geometry on sounders.",
                "Flag night-legality explicitly as an assumption if the hunt context suggests it.",
            ),
        ),
        "blind": HuntStyleModifier(
            style_id="blind",
            name="Ground Blind (Hog)",
            behavior_adjustments=(
                "Blinds hide movement extremely well from hogs — hog eyesight is the weakest of the three species, so a brushed-in blind is highly effective.",
                "Scent containment matters more than for turkey — hogs have strong noses; wind discipline around the blind is still critical.",
                "Tower blinds and elevated box blinds on feeders are the default southern-ranch setup and work well for multiple shot opportunities.",
            ),
            tactical_adjustments=(
                "Favor blind placements at feeders, stock tanks, sendero intersections, and travel corridors with predictable arrival patterns.",
                "Elevated / tower blinds beat ground blinds when terrain allows — they unlock long rifle shots AND keep scent above the hog's plane.",
                "On hot-weather hunts, position blinds with shade and airflow — stationary daylight sits in hot conditions are the primary failure mode.",
                "For archery from a blind, bias to feeder / water ambushes at 15-25 yards with window geometry locked to the expected approach.",
            ),
            caution_adjustments=(
                "Do NOT assume a fresh blind is invisible on a well-hunted trail — hogs learn and avoid unfamiliar structures quickly.",
                "Do NOT ignore wind — blinds reduce but don't eliminate scent spread.",
            ),
            species_tips_adjustments=(
                "Emphasize elevated / tower blind setups on feeders and water with wind discipline.",
                "Call out that fresh blinds on pressured sounders degrade fast — acclimation matters.",
            ),
        ),
        "saddle": HuntStyleModifier(
            style_id="saddle",
            name="Tree Saddle (Hog)",
            behavior_adjustments=(
                "Saddle setups for hog are a mobility tool: the hunter can relocate quickly when rooting sign, wallow use, or a known sounder moves.",
                "Elevated angle reduces visual detection and helps with scent dispersion — both big wins for hog.",
            ),
            tactical_adjustments=(
                "Use the saddle to cover creek-bottom crossings, thick bedding-edge ambush trees, and feeder trails that a fixed blind can't reach cleanly.",
                "Plan multiple candidate trees per zone — as with whitetail, saddle strength is optionality rather than a single perfect spot.",
                "Bias setups downwind of the expected travel; a saddle's mobility lets the hunter reset on a shifted wind during a sit.",
                "For archery hog from a saddle, treat the narrow shot arc seriously — orient the trunk to protect the draw side.",
            ),
            caution_adjustments=(
                "Do NOT assume a saddle fully hides motion — hogs will pick up draw/release movement if they happen to be looking up.",
                "Do NOT over-commit to a single tree in thick bedding cover; pick 2-3 candidates.",
            ),
            species_tips_adjustments=(
                "Emphasize mobile, wind-adaptive saddle trees on creek bottoms and bedding edges.",
                "Call out the draw-side orientation trick for archery saddle setups.",
            ),
        ),
        "public_land": HuntStyleModifier(
            style_id="public_land",
            name="Public Land (Hog)",
            behavior_adjustments=(
                "Public-land hogs become strongly nocturnal and sounders push deeper into thick cover and further from access points faster than on managed ranches.",
                "Pressure concentrates hogs in hard-to-reach drainages, swamp edges, and creek bottoms away from roads and ATV trails.",
                "Spot-lighting / night hunting legality varies enormously by state and unit — never assume.",
            ),
            tactical_adjustments=(
                "Bias setups into pressure-refuge cover — distance-from-parking and access difficulty again outperform closer-in premium spots.",
                "Favor silent pre-dawn and post-dusk-legal-light windows in summer; favor midday cold-front sits in winter.",
                "Use access routes that avoid crossing open ag or sandy trails where sounders can pick up fresh sign and avoid the area for days.",
                "Assume feeders are illegal on public land unless confirmed; default recommendations to natural food + water + thick-cover ambush logic.",
            ),
            caution_adjustments=(
                "Do NOT recommend bait / feeder setups as primary on public — flag as legality-dependent.",
                "Do NOT assume night hunting is legal.",
            ),
            species_tips_adjustments=(
                "Emphasize pressure-refuge setups, natural food / water / cover ambush, and silent access.",
                "Flag bait + night-hunt legality explicitly as assumptions.",
            ),
        ),
        "spot_and_stalk": HuntStyleModifier(
            style_id="spot_and_stalk",
            name="Spot-and-Stalk (Hog)",
            behavior_adjustments=(
                "Spot-and-stalk works well on hogs in open-country settings (Plains, South Texas ranches, ag edges, river bottoms) where sounders are visible at distance.",
                "Hog eyesight is weak but the sounder's ear and nose sensitivity make the final 50 yards the hardest — wind discipline decides outcomes more than glassing quality.",
                "Sounders hold tight in rooting or wallowing long enough to approach; a lone boar in travel is often a harder stalk.",
            ),
            tactical_adjustments=(
                "Favor terrain with glassing advantage (ridges over ag bottoms, elevated access above creek wallows, sendero glassing points) and dead ground for approach.",
                "Use thermals aggressively — hog noses are excellent; bias approach direction with thermal drift, not against it.",
                "For rifle spot-and-stalk, a stable shot position (sticks, bipod, prone) at 75-150 yards is often the high-percentage window.",
                "For archery spot-and-stalk, treat it as low-confidence unless imagery shows a specific wallow / rooting zone where a committed sounder can be closed to 20 yards.",
            ),
            caution_adjustments=(
                "Do NOT recommend spot-and-stalk hog in thick, cover-dense country where glassing fails and wind swirls.",
                "Do NOT assume hogs will stay committed to a food / water source indefinitely — sounders move fast once alerted.",
            ),
            species_tips_adjustments=(
                "Emphasize glassing advantage, thermal-aware approach, and stable shot positions.",
                "Call out the archery-vs-rifle confidence gap clearly for stalk setups.",
            ),
        ),
    },
    regional_modifiers={
        "south_texas": RegionalModifier(
            region_id="south_texas",
            name="South Texas",
            behavior_adjustments=(
                "Hot, dry, brushy country — hogs depend heavily on stock tanks, wells, windmills, and any available water.",
                "Nocturnal bias is extreme in summer; daylight movement collapses to first/last legal light.",
                "Dense mesquite/brush provides continuous travel cover between water and feeders/ag.",
            ),
            tactical_adjustments=(
                "Ambush water sources (stock tanks, troughs, seeps) with downwind cover-line approach — this is the dominant play.",
                "Feeders + senderos + ag edges are secondary; water still usually wins in summer.",
                "Cool-front evenings are the few daylight windows worth investing in.",
            ),
            caution_adjustments=(
                "Do NOT recommend classic deer-style morning sits — South Texas hog daylight movement is too compressed.",
                "Lower confidence on any multi-hour daylight window recommendation.",
            ),
            species_tips_adjustments=(
                "Emphasize water-ambush plays with cover-line access.",
                "Call out nocturnal bias and value of cold fronts.",
            ),
            season_adjustments={
                # Hot weather extends across most of the year.
                "hot_weather": {"min_temp_f": 70, "months": (4, 5, 6, 7, 8, 9, 10)},
                "drought_conditions": {"min_temp_f": 88, "months": (6, 7, 8, 9)},
            },
        ),
        "east_texas": RegionalModifier(
            region_id="east_texas",
            name="East Texas / Piney Woods",
            behavior_adjustments=(
                "Wet bottoms, creek drainages, cane thickets, and palmetto provide continuous security cover + rooting habitat.",
                "Water is abundant — wallows and creek crossings are more common than open water holes.",
            ),
            tactical_adjustments=(
                "Favor creek crossings, wallows, and thick bedding cover edges as ambush setups.",
                "Ag edges and feeders work but are often less dominant than creek-bottom travel.",
            ),
            caution_adjustments=(
                "Do NOT assume open-country water-ambush logic — East Texas hogs have water everywhere.",
            ),
            species_tips_adjustments=(
                "Emphasize creek-bottom and wallow ambush plays.",
                "Call out dense-cover visibility limits on setup selection.",
            ),
        ),
        "southeast_us": RegionalModifier(
            region_id="southeast_us",
            name="Southeast US",
            behavior_adjustments=(
                "Swamps, river bottoms, pine plantations, and ag patches interlace — hogs travel extensively through wet and thick cover.",
                "Large sounders are common on landscapes with abundant food + thick cover.",
            ),
            tactical_adjustments=(
                "Favor river/creek bottom travel corridors, swamp edges, and ag-field corners against thick cover.",
                "Plan shot availability carefully — dense cover limits effective shot windows.",
            ),
            caution_adjustments=(
                "Do NOT apply South Texas water-ambush primacy here — water is too abundant.",
                "Lower confidence on daylight claims without cold-front or strong food concentration support.",
            ),
            species_tips_adjustments=(
                "Emphasize swamp/river-bottom travel corridors and thick-cover edge ambushes.",
            ),
        ),
        "plains": RegionalModifier(
            region_id="plains",
            name="Great Plains",
            behavior_adjustments=(
                "Sparse cover concentrates hogs in creek bottoms, river corridors, and ag-edge cover — movement is more linear than in brushy country.",
                "Water sources punch well above their cover weight in open country.",
            ),
            tactical_adjustments=(
                "Favor creek/river corridor and ag-edge ambushes with strong downwind cover-line approach.",
                "Windmills and stock tanks act as water attractors in drier sub-regions.",
            ),
            caution_adjustments=(
                "Do NOT expect the continuous cover patterns of East Texas or the Southeast.",
            ),
            species_tips_adjustments=(
                "Emphasize creek-corridor and water-source ambushes with long-approach cover.",
            ),
        ),
    },
)
