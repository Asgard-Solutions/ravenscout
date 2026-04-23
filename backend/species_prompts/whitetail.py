"""Whitetail Deer prompt pack."""

from .pack import HuntStyleModifier, RegionalModifier, SeasonalModifier, SpeciesPromptPack

# ----------------------------- Seasonal modifiers -----------------------------
# Trigger rules are conservative Northern Hemisphere US calendars.
# Order matters — selector returns the first match, so list specific
# ranges before broader ones.

_WHITETAIL_RUT = SeasonalModifier(
    phase_id="rut",
    name="Peak Rut",
    trigger_rules={"months": (11,), "logic": "month"},
    behavior_adjustments=(
        "Mature bucks are cruising for estrus does and move more during daylight than any other period.",
        "Wind discipline relaxes — bucks will cross open ground or travel downwind when locked on a doe.",
        "Travel through funnels between doe bedding areas increases sharply.",
        "Scrape activity (checking, freshening, chasing off lines) can be intense but is not a prerequisite for daytime movement.",
    ),
    tactical_adjustments=(
        "Favor all-day stand sits on funnels between known / likely doe-bedding areas.",
        "Mid-day setups become viable — do not dismiss 10:00-14:00 windows.",
        "Stand selection can lean into pinch points even when wind isn't perfect for the travel lane; note the reduced wind-discipline explicitly.",
        "Set stands so the shot presents in cover, not in the middle of an opening — cruising bucks use terrain edges even when mobile.",
    ),
    caution_adjustments=(
        "Do NOT claim a specific rut phase sub-stage (seeking, chasing, lockdown) without strong evidence.",
        "Do NOT promise 'bucks will be on their feet all day' — conditions (moon, weather, pressure) still affect this.",
        "Lower confidence when hunt_date alone is the only cue (state-level rut timing varies by 1-2 weeks).",
    ),
    species_tips_adjustments=(
        "Emphasize mid-day stand sits and funnel / pinch-point setups.",
        "Call out that wind strategy can be relaxed slightly during peak rut but access routes still matter.",
        "Highlight doe-bedding-to-doe-bedding travel corridors as high value.",
    ),
    confidence_note=(
        "Peak-rut timing varies by region and latitude by up to two weeks. If location is unknown, treat phase as coarse and lower confidence for rut-dependent recommendations."
    ),
)

_WHITETAIL_PRE_RUT = SeasonalModifier(
    phase_id="pre_rut",
    name="Pre-Rut",
    trigger_rules={"months": (10,), "logic": "month"},
    behavior_adjustments=(
        "Bucks begin expanding their core area, making scrapes, and checking doe groups along edges.",
        "Daytime movement increases from early-season baseline but usually still concentrated around dusk.",
        "Bachelor groups break up; individual mature bucks travel more.",
    ),
    tactical_adjustments=(
        "Evening setups near food edges and staging cover are higher value than mornings deep in bedding.",
        "Mock scrapes / existing scrape lines along field edges and field-interior trails are supporting evidence but should not drive setup location alone.",
        "Access routes still matter — do not push bedding cover yet.",
    ),
    caution_adjustments=(
        "Do NOT treat pre-rut as rut. Daylight cruising is still the exception, not the rule.",
        "Do NOT invent rub lines or scrape lines — note them only when visible.",
    ),
    species_tips_adjustments=(
        "Lean evening toward food / staging, mornings toward low-impact funnel setups.",
        "Watch for doe-group travel along edges as leading indicator of buck activity.",
    ),
)

_WHITETAIL_POST_RUT = SeasonalModifier(
    phase_id="post_rut",
    name="Post-Rut",
    trigger_rules={"months": (12,), "logic": "month"},
    behavior_adjustments=(
        "Most breeding is finished; surviving mature bucks return to recovery mode and feed heavily when they can.",
        "Secondary / late rut flare-ups can still occur around un-bred does but are brief and unpredictable.",
        "Movement tightens back toward bedding-to-food patterns, but weighted more heavily toward evening.",
    ),
    tactical_adjustments=(
        "Favor evening food-source setups (cut ag, mast, brassicas) and staging cover adjacent to them.",
        "Morning setups should be conservative — do not push bedding to chase a possible late-rut event.",
        "Cold-front evenings near food are particularly high value.",
    ),
    caution_adjustments=(
        "Do NOT assume an ongoing rut. Treat any late-rut claim as low confidence unless clearly supported.",
        "Do NOT describe bucks as 'on their feet' in daylight without supporting evidence (cold front, low pressure, known food concentration).",
    ),
    species_tips_adjustments=(
        "Emphasize evening food-source setups on cold fronts.",
        "Recommend conservative morning access that doesn't sour a known bedding area.",
    ),
)

_WHITETAIL_LATE_SEASON = SeasonalModifier(
    phase_id="late_season",
    name="Late Season",
    trigger_rules={"months": (1, 2), "logic": "month"},
    behavior_adjustments=(
        "Survival behavior dominates — deer are food-focused and prioritize calories, security cover, and thermal cover.",
        "Movement is heavily weighted to evening; morning movement is often after legal shooting light.",
        "Pressure sensitivity is at its highest of the season.",
        "Cold fronts, snow, and wind dramatically affect activity timing.",
    ),
    tactical_adjustments=(
        "Favor evening setups on high-value food sources with nearby security cover and thermal edges (south-facing slopes, cedar).",
        "Limit intrusion — access and exit routes that don't push bedding are more important than stand placement.",
        "Mornings are low-value unless deer are known to pre-sunrise transit a specific funnel.",
    ),
    caution_adjustments=(
        "Do NOT over-commit to morning stands in late season without very strong evidence.",
        "Lower confidence when food sources aren't visible — late-season tactics are food-dependent.",
        "Assume high hunting pressure unless property type / access says otherwise.",
    ),
    species_tips_adjustments=(
        "Emphasize evening food / thermal-cover setups and low-impact access.",
        "Call out pressure avoidance — don't push bedding this late.",
    ),
)

_WHITETAIL_EARLY_SEASON = SeasonalModifier(
    phase_id="early_season",
    name="Early Season",
    trigger_rules={"months": (9,), "logic": "month"},
    behavior_adjustments=(
        "Deer are in tight bedding-to-food patterns — shorter travel, predictable timing.",
        "Bachelor buck groups are still intact; mature bucks move less in daylight than later in fall.",
        "Warm evenings suppress daytime movement.",
        "Water remains a meaningful draw in hot / dry conditions.",
    ),
    tactical_adjustments=(
        "Evening setups on the first edge between bed and food are highest value.",
        "Morning setups are generally poor without low-impact access — do not push bedding.",
        "Focus on green food (soybeans, alfalfa, hayfield edges, early mast).",
    ),
    caution_adjustments=(
        "Do NOT assume rut behavior — it is weeks away.",
        "Do NOT over-commit to all-day sits; early-season daylight movement is brief and edge-bound.",
    ),
    species_tips_adjustments=(
        "Lean evening food-edge setups on first / second ag field transitions.",
        "Recommend extreme low-impact access to avoid burning out a pattern early.",
    ),
)

WHITETAIL_PACK = SpeciesPromptPack(
    canonical_id="whitetail",
    display_name="Whitetail Deer",
    aliases=(
        "deer",
        "whitetail",
        "whitetail deer",
        "white-tailed deer",
        "white tailed deer",
        "whitetailed deer",
    ),
    behavior_rules=(
        "Whitetails bed in secure cover by day and shift toward feeding areas during dawn and dusk transitions.",
        "Mature bucks prefer concealed travel and use cover + terrain to avoid open exposure during daylight.",
        "Travel concentrates through funnels, saddles, creek crossings, benches, and transition lines between cover types.",
        "Wind is a primary safety cue — deer strongly prefer to travel with wind in their favor, especially near bedding.",
        "Hunting pressure causes deer to shift to thicker cover, swap travel routes, and move more at night.",
        "Water draws deer in hot/dry conditions but is rarely a dominant factor in cool weather.",
    ),
    tactical_guidance=(
        "Prioritize funnel/saddle/creek-crossing stand setups over open feeding areas, especially for morning hunts.",
        "Set stands downwind of expected travel; explicitly describe the wind_risk for each top_setup.",
        "For morning hunts favor stands closer to bedding with low-impact access that avoids crossing feeding areas.",
        "For evening hunts favor staging areas between bedding and feeding, or inside feeding-area cover edges.",
        "Use benches and terrain breaks on ridges as mid-slope pinch points.",
        "Plan entry and exit routes that avoid silhouetting on ridgelines and don't push deer off bedding cover.",
        "Mark areas likely to be pressured (roads, parking, trails) as `avoid` overlays when visible.",
    ),
    movement_assumptions=(
        "Morning: bedding <- feeding (deer returning toward bedding).",
        "Evening: bedding -> staging -> feeding.",
        "Mid-day movement is generally low outside of rut; lower confidence on mid-day setups.",
        "Wind-relative travel preference is a strong prior; weight it heavily in overlay placement.",
    ),
    caution_rules=(
        "Do NOT invent specific scrape lines, rub lines, licking branches, or bedding locations unless they are visibly supported.",
        "Do NOT assert a specific trail without visible evidence (clearing, edge, bench, crossing).",
        "Do NOT assume rut behavior unless hunt date/context explicitly indicates it; mark as assumed when used.",
        "Lower confidence when behavior would depend on unseen seasonal context (rut phase, crop stage, mast drop).",
        "Never describe individual deer behavior as certain — use cautious phrasing ('likely', 'expected').",
    ),
    species_tips_guidance=(
        "Whitetail-specific tips only — do not use turkey or hog tactics here.",
        "Cover downwind stand selection, low-impact access, morning-vs-evening positioning, and terrain-driven travel funnels.",
        "Note pressure avoidance and scent-control considerations relevant to whitetails.",
        "Acknowledge when advice depends on unseen seasonal/rut context.",
    ),
    # Order matters — first match wins. Most specific windows first.
    seasonal_modifiers={
        "rut": _WHITETAIL_RUT,
        "pre_rut": _WHITETAIL_PRE_RUT,
        "post_rut": _WHITETAIL_POST_RUT,
        "late_season": _WHITETAIL_LATE_SEASON,
        "early_season": _WHITETAIL_EARLY_SEASON,
    },
    hunt_style_modifiers={
        "archery": HuntStyleModifier(
            style_id="archery",
            name="Archery (Whitetail)",
            behavior_adjustments=(
                "Effective shot window is roughly 15-40 yards — setups must push deer inside that cone, not merely within sight.",
                "Deer body language (tail flicks, head-on posture, alertness) matters more than for rifle — the encounter is long and close.",
            ),
            tactical_adjustments=(
                "Favor tight pinch points (creek crossings, saddle throats, hinge-cut gaps, inside-corner field edges) that funnel travel to within ~30 yards.",
                "Bias stand height and orientation to present a broadside or quartering-away shot, not a head-on gate.",
                "Prioritize low-noise access and wind discipline — a buck at 25 yards is unforgiving of scent or gear bumps.",
                "Sits can be longer and quieter than rifle sits; plan for 3-5 hour windows around pre-rut and rut funnels.",
            ),
            caution_adjustments=(
                "Do NOT recommend long-range visibility setups (open field corners, exposed ridges) as archery stands — they look strong on a map but fail in-range.",
                "Do NOT over-weight visibility at the cost of in-range shot lanes.",
            ),
            species_tips_adjustments=(
                "Emphasize short-range funnels, wind discipline, and shot-lane quality.",
                "Call out that 'great sightlines' and 'great archery stand' are not the same thing.",
            ),
        ),
        "rifle": HuntStyleModifier(
            style_id="rifle",
            name="Rifle (Whitetail)",
            behavior_adjustments=(
                "Effective shot window extends to the limit of visibility and shooter skill — setups can leverage open terrain, field corners, and ridge glassing.",
                "Deer behavior in the final 50 yards matters less; what matters is whether a broadside shot is available anywhere in the covered ground.",
            ),
            tactical_adjustments=(
                "Favor elevated or open-sighting setups: ridge benches, field-edge corners, clearcut seams, CRP/shelterbelt overlooks.",
                "Staging areas between bedding and food that are visible across a field corner are high value even when deer don't enter bow range.",
                "Wind still matters, but a marginal wind at 150 yards is recoverable — a marginal wind at 25 yards isn't.",
                "Plan shot lanes for likely travel, not single points — rifle setups thrive on breadth of coverage.",
            ),
            caution_adjustments=(
                "Do NOT collapse rifle setups onto archery-tight pinch points when broader terrain offers safer, longer shots.",
                "Do NOT assume rifle legality — some properties / public units are archery-only. Flag as key_assumption.",
            ),
            species_tips_adjustments=(
                "Emphasize open-sight stands, ridge benches, and field-corner overlooks.",
                "Call out that shot-lane breadth outweighs archery-tight funnel geometry here.",
            ),
        ),
        "blind": HuntStyleModifier(
            style_id="blind",
            name="Ground Blind (Whitetail)",
            behavior_adjustments=(
                "Concealment and scent containment are high — deer tolerate movement inside the blind that would bust a treestand setup.",
                "Deer acclimate to blinds over days, not minutes — a freshly placed blind in pressured country often blows a sit.",
                "Blinds restrict shot arc to the window geometry — shot lanes are narrower than they look on a map.",
            ),
            tactical_adjustments=(
                "Favor locations where a blind can sit INSIDE existing cover or against an edge — brushed-in blinds outperform exposed ones.",
                "Bias to well-used food edges, feeder lanes, and predictable afternoon staging where deer expect to see the structure.",
                "Ground-level shot geometry prefers broadside crossings at 20-40 yards — setups should engineer that, not hope for it.",
                "Mornings are generally weaker than evenings for ground blinds unless the blind is well-established or set well before first light with low-impact access.",
            ),
            caution_adjustments=(
                "Do NOT recommend last-minute blind placements in heavily pressured setups without calling out the acclimation risk.",
                "Do NOT assume blinds compensate for bad wind — they slow scent but don't hide it.",
            ),
            species_tips_adjustments=(
                "Emphasize established blinds, brushed-in placement, and evening food-edge plays.",
                "Flag acclimation risk for fresh blinds.",
            ),
        ),
        "saddle": HuntStyleModifier(
            style_id="saddle",
            name="Tree Saddle (Whitetail)",
            behavior_adjustments=(
                "Mobility is the defining trait — the hunter can reset on wind or sign the same morning and hunt exact, small trees other methods can't.",
                "Shot window is narrow but adjustable around the tree — setups benefit from a ~270° usable arc with the trunk to the strong side.",
            ),
            tactical_adjustments=(
                "Favor mobile, cover-bound trees directly on travel (inside-edge, creek-bend trees, blowdown pockets) rather than established stand hubs.",
                "Pick access routes that let the hunter hang silently before light and pull out without crossing a food edge.",
                "Saddle hunters can exploit marginal wind setups that a permanent stand couldn't — the location can move with a shift.",
                "Plan multiple candidate trees per sit so the tactical call moves with the wind, not the calendar.",
            ),
            caution_adjustments=(
                "Do NOT over-commit to a single 'best' tree — saddle strength is tree optionality, not tree specificity.",
                "Do NOT assume a saddle hides the hunter as well as a blind — silhouette and motion are still exposed.",
            ),
            species_tips_adjustments=(
                "Emphasize mobility, wind-adaptive tree selection, and silent access.",
                "Call out that a saddle's advantage is optionality — suggest 2-3 candidate trees per zone.",
            ),
        ),
        "public_land": HuntStyleModifier(
            style_id="public_land",
            name="Public Land (Whitetail)",
            behavior_adjustments=(
                "Hunting pressure is the dominant variable — deer shift to thicker cover, move more nocturnally, and avoid predictable access routes.",
                "Bedding cover tightens and gets deeper; travel corridors move off obvious roads and trails into secondary cover.",
                "Mature bucks especially favor pressure-refuge pockets (blocks bordered by private, hard-to-reach timber, ridges a mile from parking).",
            ),
            tactical_adjustments=(
                "Bias setups INTO pressure-refuge pockets — distance from parking and hard access often outperforms terrain quality close to the truck.",
                "Favor early-dark access, low-impact trails, and wind-aware routes that don't cross other hunters' likely paths.",
                "Assume other hunters push deer toward you — set on likely escape corridors and pressure boundary edges.",
                "Mornings can beat evenings on public because pressure pushes afternoon movement later and after legal light.",
            ),
            caution_adjustments=(
                "Do NOT recommend high-visibility, near-parking setups without flagging the pressure cost.",
                "Do NOT assume private-land movement patterns hold on public; reduce confidence on daylight travel claims.",
            ),
            species_tips_adjustments=(
                "Emphasize pressure-refuge pockets, hard access, and escape-corridor setups.",
                "Call out the morning > evening flip that pressure often forces.",
            ),
        ),
        "spot_and_stalk": HuntStyleModifier(
            style_id="spot_and_stalk",
            name="Spot-and-Stalk (Whitetail)",
            behavior_adjustments=(
                "Spot-and-stalk on whitetail is a demanding minority tactic — works best in open country (Plains, Mountain West river breaks, early-season ag edges) where glassing is viable.",
                "Deer eyesight and ear detection at close range are extreme — the final 80 yards is where most stalks fail.",
                "Wind, thermals, and light direction dominate outcome more than initial glassing quality.",
            ),
            tactical_adjustments=(
                "Favor terrain that enables glassing ingress with dead ground for approach — ridges above a draw, coulee systems, shelterbelt gaps.",
                "Bias approach plans to use thermals (morning downslope, evening upslope) and broken cover — not straight-line attempts.",
                "Select glassing points that overlook likely bedding / feeding transitions at first and last light, then stalk from there.",
                "Accept that most days end with observation, not a shot — the overlay logic should reflect that breadth of coverage matters.",
            ),
            caution_adjustments=(
                "Do NOT recommend spot-and-stalk in timbered, cover-dense country where glassing fails — it is not a universal tactic.",
                "Do NOT promise stalk success; this method's confidence ceiling is lower than stand-based methods.",
            ),
            species_tips_adjustments=(
                "Emphasize glassing-point selection and thermal-aware approach.",
                "Call out that whitetail spot-and-stalk is terrain-gated — confidence should drop hard in timbered settings.",
            ),
        ),
    },
    regional_modifiers={
        "south_texas": RegionalModifier(
            region_id="south_texas",
            name="South Texas (Brush Country)",
            behavior_adjustments=(
                "Sparse, thorny brush (mesquite, huisache, prickly pear) dominates — travel follows senderos, ranch roads, water, and feeder lanes more than forested funnels.",
                "Heat and water access strongly shape daylight movement; cool fronts matter disproportionately.",
                "Pressure varies by ranch management — low-fence public / leased properties can behave very differently from managed high-fence ranches.",
            ),
            tactical_adjustments=(
                "Bias setups along senderos, sendero intersections, water sources, and travel between feed and dense brush cover.",
                "On warm evenings, water access setups outperform generic food-edge stands.",
                "Morning sits can be more productive than in the Midwest when cover is thick and access is quiet.",
            ),
            caution_adjustments=(
                "Do NOT apply classic Midwest ag/timber transition logic here — the ecosystem is fundamentally different.",
                "Do NOT assume northern rut timing; rut peaks later in South Texas.",
            ),
            species_tips_adjustments=(
                "Emphasize sendero + water + feeder travel logic.",
                "Call out heat-stress effects on daylight movement and the outsized value of cold fronts.",
            ),
            season_adjustments={
                # Rut shifts to mid-Dec into early Jan.
                "rut": {"months": (12, 1)},
                "pre_rut": {"months": (11,)},
                "post_rut": {"months": (2,)},
                # Early season extends because of long warm fall.
                "early_season": {"months": (9, 10)},
                "late_season": {"months": (3,)},
            },
            confidence_note=(
                "South Texas rut timing varies substantially ranch-to-ranch and year-to-year. Lower confidence on any specific phase claim."
            ),
        ),
        "east_texas": RegionalModifier(
            region_id="east_texas",
            name="East Texas / Piney Woods",
            behavior_adjustments=(
                "Thick pine/hardwood cover with dense understory — deer movement is tighter, more edge- and creek-bottom-bound than in open ag country.",
                "Clearcut edges, logging roads, and creek drainages are primary travel corridors.",
                "Hunting pressure on public land and small private tracts is typically high.",
            ),
            tactical_adjustments=(
                "Favor creek crossings, clearcut edges, and logging-road travel hubs over open field setups.",
                "Low-impact access matters more than in open ag country — noise and scent travel farther in humid pine cover.",
                "Acorn / food-plot transitions matter but are often less dominant than cover-line travel.",
            ),
            caution_adjustments=(
                "Do NOT project ag-heavy Midwest travel logic onto East Texas — food is more distributed and cover-driven.",
                "Do NOT assume mid-November rut timing — peak is closer to late November in much of East Texas.",
            ),
            species_tips_adjustments=(
                "Emphasize cover edges, creek bottoms, and clearcut transitions.",
                "Call out high pressure sensitivity and value of quiet access.",
            ),
            season_adjustments={
                "rut": {"months": (11, 12)},
                "post_rut": {"months": (1,)},
            },
        ),
        "southeast_us": RegionalModifier(
            region_id="southeast_us",
            name="Southeast US",
            behavior_adjustments=(
                "Pine plantations, hardwood bottoms, and agricultural patches interlace — travel is typically edge-bound and cover-driven.",
                "Mast (acorns) is a major late-fall/early-winter driver in many states.",
                "Regional rut timing varies significantly by latitude and state — Deep South rut is weeks later than the Midwest.",
            ),
            tactical_adjustments=(
                "Favor hardwood bottoms, oak flats, and cover-to-food transitions over open field setups.",
                "Logging roads and firebreaks are important low-impact access routes and travel corridors.",
                "For Deep South hunts, expect secondary rut activity later than Midwestern calendars suggest.",
            ),
            caution_adjustments=(
                "Do NOT apply a single regional rut date — variance is wide across the Southeast.",
                "Do NOT over-weight open-field ag logic where pine plantations dominate.",
            ),
            species_tips_adjustments=(
                "Emphasize cover transitions, logging roads, and mast sources.",
                "Call out state-level rut variance and lower confidence accordingly.",
            ),
            season_adjustments={
                "rut": {"months": (11, 12)},
                "post_rut": {"months": (1,)},
            },
        ),
        "midwest": RegionalModifier(
            region_id="midwest",
            name="Midwest / Corn Belt",
            behavior_adjustments=(
                "Agricultural food sources (corn, soybeans, alfalfa) dominate fall behavior; bedding/food/ag transitions are the core travel frame.",
                "Timbered fingers between ag fields are high-value funnels.",
                "Classic Nov 5-20 rut timing applies most cleanly here.",
            ),
            tactical_adjustments=(
                "Prioritize field-edge + timber-funnel setups on downwind sides of likely bedding.",
                "Standing-corn edges and cut-corn transitions are high-value once harvest begins.",
                "Cold-front evenings on ag food are especially productive in post-rut.",
            ),
            caution_adjustments=(
                "Do NOT import southern / mountain-west tactics — deer here are ag-tied and timber-transition-driven.",
                "Still account for pressure on small private tracts and public land.",
            ),
            species_tips_adjustments=(
                "Emphasize bedding-to-ag transitions, timber funnels, and cold-front evenings.",
                "Call out standing-corn cover effects on travel patterns.",
            ),
            # No season_adjustments needed — Midwest matches base calendar.
        ),
        "plains": RegionalModifier(
            region_id="plains",
            name="Great Plains",
            behavior_adjustments=(
                "Sparse cover concentrates deer in river/creek bottoms, shelterbelts, CRP, and draws.",
                "Water and thermal cover matter disproportionately in both summer and winter extremes.",
                "Travel across open ground is rare in daylight — corridors are narrow and repeatable.",
            ),
            tactical_adjustments=(
                "Setups on creek bottoms, shelterbelts, and CRP transitions dramatically outperform open-country ambitions.",
                "Wind discipline is critical — open country means wind shifts reach deer quickly.",
                "Access routes must use cover; skylining a ridge is especially costly here.",
            ),
            caution_adjustments=(
                "Do NOT assume open-country daylight travel is common.",
                "Do NOT project Midwest ag-interior logic onto Plains hunts — the geometry is different.",
            ),
            species_tips_adjustments=(
                "Emphasize creek-bottom, shelterbelt, and CRP corridor setups.",
                "Call out the outsized importance of wind and cover-line access.",
            ),
        ),
        "mountain_west": RegionalModifier(
            region_id="mountain_west",
            name="Mountain West",
            behavior_adjustments=(
                "Terrain drives movement — drainages, benches, saddles, and aspect (north vs south faces) matter more than ag or edge logic.",
                "Whitetails often occupy river bottoms, riparian corridors, and ag-in-drainage pockets rather than full mountain terrain.",
                "Elevation + weather (early snow, cold fronts) shifts movement dramatically.",
            ),
            tactical_adjustments=(
                "Favor bench/saddle/drainage setups and riparian travel corridors.",
                "Thermals matter as much as weather winds — morning thermals run downslope, evening thermals run upslope.",
                "Season openers run earlier in some western states; early-season tactics can apply in late August.",
            ),
            caution_adjustments=(
                "Do NOT project Midwest ag logic into mountain terrain.",
                "Do NOT ignore thermal drift when evaluating wind_risk.",
            ),
            species_tips_adjustments=(
                "Emphasize terrain- and aspect-driven setups, riparian travel, and thermal wind discipline.",
                "Acknowledge early opener timing in some western units.",
            ),
            season_adjustments={
                # Early season opens earlier in many western states.
                "early_season": {"months": (8, 9)},
            },
        ),
    },
)
