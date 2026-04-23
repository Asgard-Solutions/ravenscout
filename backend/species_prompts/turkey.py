"""Wild Turkey prompt pack."""

from .pack import HuntStyleModifier, RegionalModifier, SeasonalModifier, SpeciesPromptPack

# ----------------------------- Seasonal modifiers -----------------------------
# Spring season focus. Fall turkey hunting uses a different playbook
# and is intentionally omitted here.

_TURKEY_PEAK_BREEDING = SeasonalModifier(
    phase_id="peak_breeding",
    name="Peak Breeding",
    trigger_rules={"months": (4,), "logic": "month"},
    behavior_adjustments=(
        "Gobblers are actively seeking hens and move more in search of them throughout the morning.",
        "Response to calling improves notably; gobblers will cut calls and cover distance to hens they can hear.",
        "Strut-zone occupation is prime — open benches, field edges, logging roads, old log sets see heavy activity.",
        "Hen presence still dominates outcomes: a henned-up gobbler will ignore calling in favor of real hens.",
    ),
    tactical_adjustments=(
        "Favor setups with clear calling lanes into likely strut zones adjacent to roost travel corridors.",
        "Mid-morning setups remain high value — dominant gobblers circle after hens leave them.",
        "Use decoys only in locations with realistic line-of-sight approach; never in overly exposed openings with no approach cover.",
    ),
    caution_adjustments=(
        "Do NOT promise a specific call-and-response outcome.",
        "Do NOT claim a specific roost tree or gobbling location unless clearly inferable from imagery.",
        "Lower confidence when hen presence can't be estimated from imagery.",
    ),
    species_tips_adjustments=(
        "Emphasize mid-morning reposition plays when dawn setups go quiet.",
        "Call out hen-influence risk — a henned-up gobbler is not moving to calls.",
    ),
    confidence_note=(
        "Breeding timing varies by region by up to 3–4 weeks between southern and northern states. Lower confidence on peak-phase claims without region support."
    ),
)

_TURKEY_EARLY_SEASON = SeasonalModifier(
    phase_id="early_season",
    name="Early Season",
    trigger_rules={"months": (3,), "logic": "month"},
    behavior_adjustments=(
        "Birds are still flocked — gobblers are often with dominant hen groups and less responsive to independent calling.",
        "Movement is present but tighter — shorter fly-down-to-strut-zone distances.",
        "Gobbling can be limited; subdominant birds may gobble more than dominants.",
    ),
    tactical_adjustments=(
        "Favor observation setups over aggressive calling to identify where flocks break.",
        "Position along likely travel between communal roosts and preferred morning strut areas.",
        "Keep calling soft and infrequent; loud or aggressive calling can alert a dominant bird and shut him down.",
    ),
    caution_adjustments=(
        "Do NOT assume a gobbler will leave hens to investigate a call.",
        "Lower confidence on pure calling-based tactics.",
    ),
    species_tips_adjustments=(
        "Emphasize low-impact scouting / observation first.",
        "Recommend soft calling rather than aggressive cutting.",
    ),
)

_TURKEY_LATE_SEASON = SeasonalModifier(
    phase_id="late_season",
    name="Late Season",
    trigger_rules={"months": (5,), "logic": "month"},
    behavior_adjustments=(
        "Birds are pressured — gobbling is reduced; approaches are cautious.",
        "Hens are nesting, leaving some gobblers searching again (breakable gobblers), but they are wary.",
        "Travel patterns become more predictable once pressure forces birds into familiar low-disturbance cover.",
    ),
    tactical_adjustments=(
        "Favor quiet setups in pressure-refuge cover — drainages, ridgetop benches, logging roads away from parking.",
        "Scale calling down significantly — listening and locating are more productive than running gun.",
        "Mid-morning and midday setups become relatively more valuable than opening dawn sits.",
    ),
    caution_adjustments=(
        "Do NOT expect prolific gobbling.",
        "Lower confidence on any call-heavy strategy; pressured birds hang up silently.",
    ),
    species_tips_adjustments=(
        "Emphasize quiet scouting, pressure-refuge setups, and muted calling.",
        "Call out that silent approaches sometimes out-perform call-runs late season.",
    ),
)

TURKEY_PACK = SpeciesPromptPack(
    canonical_id="turkey",
    display_name="Wild Turkey",
    aliases=(
        "turkey",
        "wild turkey",
        "eastern turkey",
        "rio grande turkey",
        "merriam turkey",
        "merriams turkey",
        "osceola turkey",
        "gobbler",
    ),
    behavior_rules=(
        "Turkeys roost overnight in mature trees, often on ridges, benches, or along drainages with mature hardwoods near open ground.",
        "Fly-down in the morning is followed by movement toward open strut zones, field edges, logging roads, and openings with good visibility.",
        "Mid-morning turkeys reposition — gobblers follow hens or drift to quieter strut areas; groups can travel a long way on foot.",
        "Afternoon movement often drifts back toward roosting cover along ridges, travel roads, and openings.",
        "Line of sight matters: turkeys rely on vision and will not commit to calling they cannot see into.",
        "Hunting pressure or human noise makes turkeys hang up, shift strut zones, or simply shut up.",
    ),
    tactical_guidance=(
        "Favor setups along natural travel corridors (ridges, logging roads, creek bottoms, transitions) BETWEEN likely roost areas and open strut zones.",
        "Position with clear calling/shooting lanes into openings where a gobbler can approach in view.",
        "Back against cover large enough to break your silhouette; avoid exposed skylining on ridgelines.",
        "Set up for quiet low-impact approach — approach noise and flashlight use can blow a roost.",
        "Do NOT place stands right under or adjacent to a suspected roost tree; place them on travel routes away from it.",
        "For mid-morning windows, move to openings, fields, logging roads, and ridgetop benches where gobblers search.",
        "Mark loud / exposed / high-traffic areas that would bust a setup as `avoid` overlays.",
    ),
    movement_assumptions=(
        "Pre-dawn: birds are in roost; any setup should be already in position before fly-down.",
        "Fly-down -> strut zone (often in or adjacent to an opening or edge).",
        "Mid-morning: repositioning along travel corridors / openings.",
        "Afternoon: drift back toward roosting cover.",
        "Turkeys do not follow whitetail-style wind logic — don't over-apply funnel/saddle/wind-downwind deer tactics.",
    ),
    caution_rules=(
        "Do NOT claim a specific roost tree or gobbling location unless it is clearly visible or strongly inferable from imagery.",
        "Do NOT assume calling will pull a bird across open ground when terrain/cover makes the approach unnatural.",
        "Do NOT apply deer-style pinch-point logic as if it were equivalent for turkeys.",
        "Lower confidence when tactics depend on unseen breeding-season behavior (henned-up gobblers, subdominant birds, hen presence).",
        "Never describe a gobbler's response to calling as certain.",
    ),
    species_tips_guidance=(
        "Turkey-specific tips only — do not drift into deer funnel logic.",
        "Cover setup visibility / calling lanes, low-impact approach, roost-to-strut travel, and mid-morning reposition options.",
        "Note pressure sensitivity and the risk of calling to a bird that can't see the shooter.",
        "Acknowledge when advice depends on unseen breeding-season context (hen presence, henned-up gobblers).",
    ),
    seasonal_modifiers={
        "peak_breeding": _TURKEY_PEAK_BREEDING,
        "early_season": _TURKEY_EARLY_SEASON,
        "late_season": _TURKEY_LATE_SEASON,
    },
    hunt_style_modifiers={
        "archery": HuntStyleModifier(
            style_id="archery",
            name="Archery (Turkey)",
            behavior_adjustments=(
                "Effective shot window is roughly 15-30 yards AND requires a moment where the bird's head is behind the fan or the hunter is otherwise hidden — draw movement is what busts most archery turkey setups.",
                "Calling volume and aggression matter less than concealment and bird commitment — a hung-up gobbler at 45 yards is a failed archery setup.",
            ),
            tactical_adjustments=(
                "Strongly bias setups to blinds (see blind style) or very thick back-cover that fully hides a draw stroke — open-setup archery on uncommitted birds usually fails.",
                "Favor decoy setups where the gobbler must cross inside 25 yards to engage the decoy — this is how draw windows get created.",
                "Mid-morning reposition plays are high-value because committed, pecking gobblers give draw windows that pre-dawn setups rarely do.",
                "Accept that archery turkey caps productive radius — reflect this with narrower, higher-confidence overlays rather than broad ambush coverage.",
            ),
            caution_adjustments=(
                "Do NOT recommend open-ground archery setups without flagging the draw-movement risk.",
                "Do NOT treat 'turkey in range' as 'turkey killable' for archery — committed angle and distraction matter as much as yardage.",
            ),
            species_tips_adjustments=(
                "Emphasize concealment, draw windows, and decoy placement that forces close, distracted approaches.",
                "Flag that most calling-run tactics don't translate well to archery.",
            ),
        ),
        "rifle": HuntStyleModifier(
            style_id="rifle",
            name="Shotgun / Rifle (Turkey)",
            behavior_adjustments=(
                "Shotgun / rimfire effective window extends to ~40-50 yards for shotgun and further for legal rifle states — setups can work birds that hang up further than archery tolerates.",
                "Patterning discipline matters: setups that seem strong on a map can be beyond pattern density at actual range.",
            ),
            tactical_adjustments=(
                "Favor setups with clear sightlines into likely strut zones at 30-45 yards where a bird can stop, periscope, and be taken without requiring full commitment.",
                "Running-and-gunning (move, call, sit, move) is more viable because shot windows forgive a longer hang-up.",
                "Logging roads, pipeline right-of-ways, and field edges are especially effective — they deliver shot windows without requiring tight commitment.",
                "Note: some turkey seasons are shotgun-only — if imagery/context doesn't confirm legality, flag rifle assumptions in key_assumptions.",
            ),
            caution_adjustments=(
                "Do NOT describe birds as 'in range' at distances beyond a realistic pattern envelope (40-45 yards for most shotgun setups).",
                "Do NOT assume rifle legality — default to shotgun framing unless confirmed.",
            ),
            species_tips_adjustments=(
                "Emphasize 30-45 yard sightline setups and the value of running-and-gunning.",
                "Call out the shotgun-only legal default and flag rifle assumptions.",
            ),
        ),
        "blind": HuntStyleModifier(
            style_id="blind",
            name="Ground Blind (Turkey)",
            behavior_adjustments=(
                "Turkeys generally tolerate blinds well — the big win is hidden movement, not scent concealment (turkey scent-detection is weak).",
                "Birds approach a blind more naturally in open ground; in thick cover, birds often walk past and lose interest in calling outside the blind's sight cone.",
                "Blind windows restrict the shot arc — setups must place the decoy and bird approach inside that arc, not hope for it.",
            ),
            tactical_adjustments=(
                "Favor blind placements on field edges, food plots, open logging roads, and pipeline corridors with decoys in clear view.",
                "Bias to east-facing (evening) and west-facing (morning) blind windows so the sun doesn't silhouette the hunter in the shot cone.",
                "Blinds UNLOCK archery turkey setups — cross-reference with the archery style when both are selected.",
                "Ground blinds are the strongest default for novice / youth / accessibility hunters — reflect that in the confidence and framing when supported.",
            ),
            caution_adjustments=(
                "Do NOT recommend blind placements in dense cover with no sight cone into a realistic strut zone.",
                "Do NOT assume a freshly-dropped blind is invisible — brush it in where possible.",
            ),
            species_tips_adjustments=(
                "Emphasize open-ground blind placements with decoy geometry inside the shot arc.",
                "Call out that blinds tolerate hunter movement but shot arcs are narrow — the setup has to engineer the approach, not hope for it.",
            ),
        ),
        "saddle": HuntStyleModifier(
            style_id="saddle",
            name="Tree Saddle (Turkey)",
            behavior_adjustments=(
                "Saddle hunting for turkey is a niche tactic — relevant for observation, run-and-gun mobility in thick cover, and setups where ground-level sightlines are bad.",
                "Elevated angle improves visibility in rolling terrain but does not meaningfully improve calling effectiveness and can hurt it — sound drops off hunters in trees oddly.",
            ),
            tactical_adjustments=(
                "Use the saddle primarily as a mobile observation platform — relocate to a stand-hunting position on the ground once a bird is located.",
                "On steep terrain, saddles can glass ridge benches and funnel birds into known strut areas across a drainage — treat as intel, not final setup.",
                "Do NOT rely on saddles as the primary shot platform for turkey except in specific terrain where a ground setup isn't viable.",
            ),
            caution_adjustments=(
                "Do NOT default to elevated turkey setups — ground setups outperform in almost all cases.",
                "Lower confidence when recommending saddle as the primary turkey shot position.",
            ),
            species_tips_adjustments=(
                "Frame saddle as a mobility / observation tool first, not a primary turkey platform.",
                "Suggest ground-level transitions from a saddle position once a bird is committed.",
            ),
        ),
        "public_land": HuntStyleModifier(
            style_id="public_land",
            name="Public Land (Turkey)",
            behavior_adjustments=(
                "Pressured gobblers hang up silently, skip calling, and move to pressure-refuge cover faster than turkeys on managed properties.",
                "Parking-area clusters and obvious road openings get hunted first and hardest — later-in-morning and further-from-access tactics win on public.",
                "Weekends and opening-day aggression rise sharply; midweek and late-season sits favor quiet setups over call-runs.",
            ),
            tactical_adjustments=(
                "Bias setups to pressure-refuge country — distance and hard access again usually outperform closer-in premium terrain.",
                "Scale calling down significantly. Listening and locating quietly often beats aggressive run-and-gun on public.",
                "Midday setups on logging-road benches and ridge spines see better activity than dawn chaos near parking.",
                "Assume birds hang up outside visible calling distance by default — setups should anticipate hang-up lines and angle shot lanes accordingly.",
            ),
            caution_adjustments=(
                "Do NOT recommend aggressive call-heavy tactics as primary on public without flagging the hang-up risk.",
                "Do NOT ignore other-hunter safety — recommend setups that keep shot lanes away from likely other-hunter approaches.",
            ),
            species_tips_adjustments=(
                "Emphasize pressure-refuge setups, muted calling, and midday opportunities.",
                "Call out the hang-up default and the other-hunter safety overlay.",
            ),
        ),
        "spot_and_stalk": HuntStyleModifier(
            style_id="spot_and_stalk",
            name="Run-and-Gun / Stalk (Turkey)",
            behavior_adjustments=(
                "Run-and-gun for turkey is location-then-relocate-fast: gobble, pinpoint, close, set up well under 100 yards, then call.",
                "The stalk phase is rarely a true 'stalk to shot' — it's a fast move to a calling setup in front of the bird's travel line.",
                "Works best on hilly or broken terrain where terrain absorbs approach movement and drops sound around the hunter.",
            ),
            tactical_adjustments=(
                "Favor terrain with sound-baffle ridges, benches, and rolling draws that let a hunter cover ground fast and set up again.",
                "Plan multiple candidate setup trees / benches along likely gobble lines, not a single 'best spot'.",
                "Aggressive calling works well once the setup is in front of the bird — weak calling after a fast close usually fails.",
                "Logging roads and ridgetop trails are tactical movement corridors between setups; recommend them for travel, not as stand points.",
            ),
            caution_adjustments=(
                "Do NOT recommend run-and-gun as primary in flat, open country where movement is visible from 300 yards.",
                "Do NOT assume every gobbler can be closed on — some will hang up or walk away regardless of approach quality.",
            ),
            species_tips_adjustments=(
                "Emphasize terrain-absorbed movement, multiple candidate setups, and aggressive calling only after a good setup is made.",
                "Call out that flat / open country punishes run-and-gun heavily.",
            ),
        ),
    },
    regional_modifiers={
        "east_texas": RegionalModifier(
            region_id="east_texas",
            name="East Texas / Piney Woods",
            behavior_adjustments=(
                "Dense pine/hardwood cover with thick understory — visibility is low; strut zones are bounded to openings, logging roads, clearcut edges, and food plots.",
                "Creek bottoms and hardwood drainages act as travel corridors between roost areas and openings.",
            ),
            tactical_adjustments=(
                "Favor logging roads, clearcut edges, pipeline right-of-ways, and small fields as calling setups.",
                "Quiet approach is critical in humid pine cover — sound carries farther than hunters realize.",
            ),
            caution_adjustments=(
                "Do NOT recommend long open-field setups where visibility is tree-line bound.",
                "Do NOT assume northern April breeding peak — East Texas peaks earlier.",
            ),
            species_tips_adjustments=(
                "Emphasize logging roads and clearcut edges as primary strut/travel corridors.",
                "Call out quiet low-impact access and dense-cover visibility limits.",
            ),
            season_adjustments={
                # Spring season runs early.
                "early_season": {"months": (3,)},
                "peak_breeding": {"months": (3, 4)},
                "late_season": {"months": (5,)},
            },
        ),
        "southeast_us": RegionalModifier(
            region_id="southeast_us",
            name="Southeast US",
            behavior_adjustments=(
                "Pine plantations, hardwood bottoms, food plots, and small clearings shape movement.",
                "Breeding timing shifts earlier than northern April baseline — can begin in March across much of the Deep South.",
            ),
            tactical_adjustments=(
                "Favor food plots, pipeline openings, and hardwood bottoms as strut-zone candidates.",
                "Early-morning setups near roost travel corridors outperform deep-woods calling runs.",
            ),
            caution_adjustments=(
                "Do NOT use a single northern April peak date across the region — variance is wide.",
            ),
            species_tips_adjustments=(
                "Emphasize early-season strut activity and openings/food-plot setups.",
                "Acknowledge regional timing variance explicitly.",
            ),
            season_adjustments={
                "early_season": {"months": (3,)},
                "peak_breeding": {"months": (3, 4)},
                "late_season": {"months": (5,)},
            },
        ),
        "midwest": RegionalModifier(
            region_id="midwest",
            name="Midwest",
            behavior_adjustments=(
                "Field-edge movement, timber fingers, and draws shape daily routes; strut zones often sit on field corners and open ridges.",
                "April peak breeding aligns with the northern calendar default.",
            ),
            tactical_adjustments=(
                "Favor field corners, timber fingers into ag, and logging roads as strut/travel setups.",
                "Use terrain (ridges, draws) to shield approach — ag-field corners are prime but exposed.",
            ),
            caution_adjustments=(
                "Do NOT project Deep-South early-season timing here; Midwest peaks in April.",
            ),
            species_tips_adjustments=(
                "Emphasize field-corner / timber-finger setups and terrain-shielded approach.",
            ),
        ),
        "plains": RegionalModifier(
            region_id="plains",
            name="Great Plains / Rio Grande Range",
            behavior_adjustments=(
                "Open country with scattered timber — movement concentrates near creek bottoms, shelterbelts, cottonwoods, and stock-tank cover.",
                "Rio Grande turkeys in western parts of the region use larger daily ranges than eastern birds.",
            ),
            tactical_adjustments=(
                "Favor creek bottoms, shelterbelts, and stock-tank cover for ambush setups.",
                "Use terrain (ditches, draws, fencelines) to cover long approach distances.",
            ),
            caution_adjustments=(
                "Do NOT project eastern-timber calling tactics onto open Plains country.",
            ),
            species_tips_adjustments=(
                "Emphasize creek/shelterbelt setups and long-approach cover discipline.",
            ),
            season_adjustments={
                "peak_breeding": {"months": (4, 5)},
            },
        ),
        "mountain_west": RegionalModifier(
            region_id="mountain_west",
            name="Mountain West / Merriam's Country",
            behavior_adjustments=(
                "Elevation and terrain shape movement — birds drop elevation in mornings to feed, climb to roost by evening.",
                "Mountain turkeys (Merriam's) respond to terrain funnels and meadows more than field edges.",
            ),
            tactical_adjustments=(
                "Favor meadow/park edges, ridge saddles, and logging-road transitions between roost ridges and feeding benches.",
                "Thermal winds (downslope AM, upslope PM) affect both calling sound and scent.",
            ),
            caution_adjustments=(
                "Do NOT project flat-land field-edge tactics onto mountain terrain.",
                "Do NOT assume April peak; breeding often peaks in May at elevation.",
            ),
            species_tips_adjustments=(
                "Emphasize meadow edges, ridge saddles, and thermal wind management.",
            ),
            season_adjustments={
                "early_season": {"months": (4,)},
                "peak_breeding": {"months": (5,)},
                "late_season": {"months": (5, 6)},
            },
        ),
    },
)
