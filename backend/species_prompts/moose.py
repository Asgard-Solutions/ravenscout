"""Moose prompt pack (baseline).

Covers North American moose (Alaskan, Shiras, Canadian, Eastern).
Baseline behavior/tactical/movement/caution/tips plus two seasonal
phases: rut (calling) and post-rut winter yarding.
"""

from .pack import HuntStyleModifier, RegionalModifier, SeasonalModifier, SpeciesPromptPack


_MOOSE_RUT = SeasonalModifier(
    phase_id="rut",
    name="Rut (Calling Season)",
    trigger_rules={
        "months": (9, 10),
        "logic": "either",
    },
    behavior_adjustments=(
        "Bulls respond to cow-in-heat calls and competing-bull grunts; vocalization and pond-water-thrashing behaviors increase sharply.",
        "Bulls leave secluded timber to investigate calls and to patrol cow home ranges, often in daylight.",
        "Cow and calf groups may separate briefly as cows seek out bulls.",
    ),
    tactical_adjustments=(
        "Cow-call + raking setups on ridge-edge benches above pond systems are a dominant play.",
        "Target willow/alder bottoms adjacent to cut-over timber, muskeg edges, and beaver-pond complexes.",
        "Plan for a CLOSE encounter — rutting bulls commit hard when a call lands; shot geometry must be pre-staged.",
    ),
    caution_adjustments=(
        "Do NOT treat rut vocalization as a guarantee of a daylight shot window — bulls may answer from out of sight and not commit.",
        "Do NOT assume bulls will circle downwind like an elk — moose often come straight in.",
    ),
    species_tips_adjustments=(
        "Emphasize call-and-setup discipline with pre-staged shooting lanes.",
        "Flag safety — a committed rutting bull is dangerous and must not be 'finished' from the ground at close range without an escape plan.",
    ),
)


_MOOSE_WINTER = SeasonalModifier(
    phase_id="winter_yard",
    name="Winter / Yarding",
    trigger_rules={
        "months": (11, 12, 1, 2),
        "max_temp_f": 20,
        "logic": "either",
    },
    behavior_adjustments=(
        "Moose concentrate in 'yards' — low-snowpack cedar swamps, dense spruce, south-facing browse pockets — to conserve energy.",
        "Movement compresses dramatically; a yarded moose may stay in a 100-acre patch for weeks.",
        "Browse sign (clipped twigs, bark stripping) becomes the dominant visible cue.",
    ),
    tactical_adjustments=(
        "Still-hunt slowly into known yards along browse-heavy corridors; avoid pressuring OUT of the yard.",
        "Use snow-cover sign-interpretation (browse, beds, tracks) as primary intel, imagery permitting.",
        "Plan shorter, denser-cover ambush ranges — winter moose hold tight to thick cover.",
    ),
    caution_adjustments=(
        "Do NOT apply rut tactics (calling) in post-rut winter context.",
        "Do NOT pressure a yard — once disturbed, moose may leave and collapse the hunt.",
    ),
    species_tips_adjustments=(
        "Emphasize low-impact still-hunting in yards with browse-sign following.",
        "Call out the cost of pressuring a yard.",
    ),
)


MOOSE_PACK = SpeciesPromptPack(
    canonical_id="moose",
    display_name="Moose",
    aliases=(
        "moose",
        "mooses",
        "bull moose",
        "cow moose",
        "alces",
        "shiras moose",
        "alaska moose",
        "canadian moose",
    ),
    behavior_rules=(
        "Moose are tied to water — beaver ponds, lake shorelines, marsh edges, willow/alder bottoms, muskegs — for food, cooling, and the rut.",
        "Moose bed in dense conifer / alder thickets and on shaded benches; they tolerate proximity to water better than most ungulates.",
        "Movement is slower and shorter-range than elk — a moose's daily circuit can fit in a single drainage or pond complex.",
        "Vision is modest; smell and hearing are strong. Wind discipline matters more than concealment coloration.",
        "Moose are solitary outside rut and cow-calf pairs; large-group logic does not apply.",
    ),
    tactical_guidance=(
        "Target pond systems, beaver-cut bottoms, willow/alder feeding runs, and muskeg edges as primary movement zones.",
        "Glass pond shorelines at first/last light; moose will stand in water and feed at length.",
        "Favor elevated ridges above pond complexes for call-and-wait setups during the rut.",
        "Plan an approach by canoe, quiet foot access, or long glass — moose detect footfall vibration surprisingly well in soft ground.",
        "Acknowledge pack-out logistics — setups within reach of water/road transport matter to a valid recommendation.",
    ),
    movement_assumptions=(
        "Pond / marsh feeding at dawn and dusk (often well into full dark) -> bedding in dense conifer / alder during midday.",
        "Rut movement is less time-bound — bulls may travel and vocalize at any hour.",
        "Winter movement collapses to yards; assume very small daily range.",
    ),
    caution_rules=(
        "Do NOT apply deer- or elk-scale funnel/saddle logic — moose operate at pond-and-drainage scale, slower and tighter.",
        "Do NOT invent specific ponds, beaver complexes, or wallows unless visible or strongly inferable from imagery.",
        "Do NOT assume a shot-ready approach is feasible without considering pack-out distance to water or road.",
        "Lower confidence sharply for daylight movement claims outside of rut or yard proximity.",
    ),
    species_tips_guidance=(
        "Moose-specific themes only — do not drift into elk or whitetail tactics.",
        "Cover pond-and-willow targeting, canoe/quiet access, pack-out realism, and rut-specific calling disciplines.",
        "Flag safety around rutting bulls explicitly.",
    ),
    seasonal_modifiers={
        "rut": _MOOSE_RUT,
        "winter_yard": _MOOSE_WINTER,
    },
    hunt_style_modifiers={
        "rifle": HuntStyleModifier(
            style_id="rifle",
            name="Rifle (Moose)",
            behavior_adjustments=(
                "Effective window is any open pond / bog / willow-bottom sightline \u2014 100 to 400 yards typical.",
                "Moose are large targets, and shots from standing broadside can be patient \u2014 the challenge is finding a moose, not placing the shot.",
            ),
            tactical_adjustments=(
                "Ridge-edge benches above pond systems, cut-bank overlooks on rivers, and high points above willow-bottom networks are dominant setups.",
                "Plan pack-out and recovery \u2014 a moose down across a bog is a 12-24 hour rescue operation; setup validity depends on extraction feasibility.",
                "Calling paired with rifle adds a layer: pull a bull to edge, shoot from pre-staged rest.",
            ),
            caution_adjustments=(
                "Do NOT recommend setups with no accessible recovery route to water / road \u2014 moose weight and terrain make this a real gating factor.",
                "Do NOT shoot a swimming moose \u2014 recovery is usually impossible.",
            ),
            species_tips_adjustments=(
                "Emphasize recovery-aware shot staging from ridge-edge benches overlooking ponds / willow bottoms.",
            ),
        ),
        "archery": HuntStyleModifier(
            style_id="archery",
            name="Archery (Moose)",
            behavior_adjustments=(
                "Effective range ~20-40 yards; calling in rut is the dominant archery play \u2014 bulls commit hard and close.",
                "A committed bull may close to 15 yards inside seconds \u2014 shot preparation must be pre-staged.",
            ),
            tactical_adjustments=(
                "Cow-call and rake setups on ridge-edge benches with pre-cleared 25-yard lanes.",
                "Canoe-based paddle-and-listen approaches on pond complexes are a classic archery play \u2014 glass pond edges from water-line.",
                "Bias to broadside-ready lanes along known travel corridors between pond systems.",
            ),
            caution_adjustments=(
                "Do NOT attempt archery from open-pond shorelines without a tree / rise for elevation \u2014 a committed rutting bull at ground level is a safety problem.",
                "Do NOT call without a planned abort / escape route in rut.",
            ),
            species_tips_adjustments=(
                "Emphasize call-and-wait setups with pre-staged broadside lanes and safety-aware positioning.",
            ),
        ),
        "spot_and_stalk": HuntStyleModifier(
            style_id="spot_and_stalk",
            name="Spot-and-Stalk (Moose)",
            behavior_adjustments=(
                "Moose are often spotted feeding in water / willow and stalked along shoreline / cut-bank cover.",
                "Movement is slow \u2014 a stalk can unfold over an hour of slow closing through soft ground.",
            ),
            tactical_adjustments=(
                "Use shoreline cover, cut banks, willow strips, and alder hedges as approach corridors.",
                "Plan final approach from slightly downwind + ground-level cover \u2014 moose are less sharp-eyed than ungulates but detect footfall vibration.",
                "Commit final 60-80 yards only when wind is sustained correct.",
            ),
            caution_adjustments=(
                "Do NOT stalk a moose across open water or exposed mud \u2014 the approach is visible from every angle.",
                "Do NOT assume silent approach through wet soft ground \u2014 vibration carries to a moose's fine hearing in soft medium.",
            ),
            species_tips_adjustments=(
                "Emphasize shoreline-contour stalks with wind-first finals.",
            ),
        ),
        "blind": HuntStyleModifier(
            style_id="blind",
            name="Ground / Canoe Blind (Moose)",
            behavior_adjustments=(
                "Moose blind hunting is dominantly water-edge: shore platforms, dock blinds, and canoe / boat-platform setups on pond / lake / river systems.",
                "Moose tolerate steady-state structures (existing docks, overgrown duck blinds) better than fresh-built brush.",
                "Calling from a fixed water-edge blind in rut produces high commit rates from cruising bulls.",
            ),
            tactical_adjustments=(
                "Set up brushed-in shore blinds 50-100 yards along willow / pond edges where bulls travel between feeding pockets.",
                "Canoe-platform blinds enable quiet approach to remote pond complexes \u2014 plan paddle-in and brush-in the day prior.",
                "Pre-cleared 30-yard archery lanes on water-edge willow trails are the dominant blind-and-bow play.",
            ),
            caution_adjustments=(
                "Do NOT build / brush a blind during the morning of the sit \u2014 moose detect fresh disturbance.",
                "Do NOT shoot toward open water on rut bulls \u2014 a swimming moose is not recoverable.",
            ),
            species_tips_adjustments=(
                "Emphasize water-edge brushed blind + willow-corridor lane geometry.",
            ),
        ),
        "public_land": HuntStyleModifier(
            style_id="public_land",
            name="Public Land (Moose)",
            behavior_adjustments=(
                "Most North American moose hunting is on public land or by drawing public-allocation tags \u2014 access is structurally constrained.",
                "Pressure rapidly pushes moose off accessible water systems and into back-of-beyond drainages within 1-2 days of opener.",
                "Vocalization patterns flatten quickly under repeated calling pressure.",
            ),
            tactical_adjustments=(
                "Plan setups 2-5+ miles from boat ramps / road accesses \u2014 first-day shore moose are gone fast.",
                "Target backcountry pond chains, hike-in muskegs, and untrailed willow bottoms.",
                "Pack-out logistics dominate setup choice \u2014 a moose down 6 miles in is a multi-day evolution.",
                "Calling discipline matters \u2014 do not over-call pressured moose; expect fewer answers and longer commits.",
            ),
            caution_adjustments=(
                "Do NOT recommend road-proximate or first-mile shoreline setups in pressured public country.",
                "Do NOT shoot a bull you cannot pack out \u2014 the constraint is real and ethical.",
            ),
            species_tips_adjustments=(
                "Emphasize distance-from-access setups with explicit pack-out feasibility.",
            ),
        ),
    },
    regional_modifiers={
        "mountain_west": RegionalModifier(
            region_id="mountain_west",
            name="Mountain West (Shiras Moose)",
            behavior_adjustments=(
                "Shiras moose \u2014 smallest North American subspecies, intermountain West (WY / MT / ID / CO / UT), beaver complexes, willow riparian zones, spruce-fir benches.",
                "Moose densities are low; finding one is the challenge \u2014 pattern is less 'where moose live' and more 'where the water + willows + cover overlap'.",
            ),
            tactical_adjustments=(
                "Target riparian willow-and-beaver complexes, high-country willow bogs, and spruce-fir benches adjacent to water.",
                "Glass willow bottoms from ridge edges at range before committing to an approach.",
                "Fall rut calling is effective but produces fewer answering bulls than Canadian / Alaskan country \u2014 adjust expectations.",
            ),
            caution_adjustments=(
                "Do NOT apply Alaskan calling density expectations.",
                "Do NOT overlook grizzly overlap in MT / WY wilderness; pack-out / carcass defense is a real concern.",
            ),
            species_tips_adjustments=(
                "Emphasize low-density riparian targeting + long glass before committing.",
            ),
        ),
        "midwest": RegionalModifier(
            region_id="midwest",
            name="Upper Midwest / Great Lakes Moose",
            behavior_adjustments=(
                "Upper Midwest / Great Lakes moose \u2014 Minnesota, Upper Peninsula Michigan, northern Wisconsin \u2014 deep forest, lakes, logging cuts, beaver complexes.",
                "Populations are constrained (tick loads, climate) \u2014 tags are hard to draw and setups matter proportionally more.",
            ),
            tactical_adjustments=(
                "Target cut-over edges, beaver complexes, and lake-shoreline willow bottoms.",
                "Canoe and boat approach are underrated: lake-to-lake water approach beats long overland slog.",
                "Work wind and thermals despite modest terrain relief \u2014 closed canopy carries scent further than expected.",
            ),
            caution_adjustments=(
                "Do NOT overlook permit / tag / season specifics \u2014 strongly regulated; flag as key_assumption.",
                "Do NOT assume pressure-free country \u2014 modern Midwest moose range is heavily scouted.",
            ),
            species_tips_adjustments=(
                "Emphasize water / cut-edge targeting and canoe-access thinking.",
            ),
        ),
        "northeast": RegionalModifier(
            region_id="northeast",
            name="Northeast (Maine / VT / NH / Adirondacks Moose)",
            behavior_adjustments=(
                "Northeast moose country \u2014 northern Maine, Vermont, New Hampshire, Adirondacks \u2014 mixed hardwood / softwood forest, mountainous, beaver flowage networks, logging-road access.",
                "Densest moose populations in the lower 48; rut activity (Sept/Oct) is reliable in undisturbed back country.",
                "Tick load and climate stress lower density compared to Canada but produce respectable bulls in good country.",
            ),
            tactical_adjustments=(
                "Target beaver flowages, recent logging cuts, and softwood-hardwood transitions adjacent to water.",
                "Logging-road systems set the access geometry \u2014 hike or ATV in 1-3 miles to find unpressured ponds.",
                "Calling sequences (cow-call + raking) are more responsive than US west country \u2014 dense bull populations support call-in tactics well.",
                "Glass burned-off slash piles, recent cuts, and beaver dam complexes from elevation when available.",
            ),
            caution_adjustments=(
                "Do NOT recommend road-edge setups in opener week \u2014 first-mile country is heavily pressured.",
                "Do NOT discount tick-load impacts on bull body condition / behavior post-rut.",
                "Do NOT overlook private timber / paper company access rules \u2014 flag as key_assumption.",
            ),
            species_tips_adjustments=(
                "Emphasize beaver-flowage + cut-edge targeting with logging-road access realism.",
            ),
        ),
    },
)
