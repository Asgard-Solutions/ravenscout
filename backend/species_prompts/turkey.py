"""Wild Turkey prompt pack."""

from .pack import RegionalModifier, SeasonalModifier, SpeciesPromptPack

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
