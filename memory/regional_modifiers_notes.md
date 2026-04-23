# Raven Scout — Region-Aware Modifier System

Status: **Implemented** (v3.1+). Extends the species prompt packs and
seasonal modifiers with GPS-driven regional overlays that can also
shift seasonal phase boundaries.

## Why

Northern-hemisphere US calendars were over-firing for southern hunts
(e.g. a South Texas hunt on Dec 15 resolved to `post_rut` when it
should be `rut`). Regional modifiers fix this and also inject
tactical framing appropriate to the ecology the hunt is in.

## Architecture

Prompt pipeline:

```
base
→ species pack
→ regional modifier          ← NEW: resolved from GPS / override
→ seasonal modifier          ← region-aware (phase boundaries can shift)
→ hunt conditions
→ image / tier context
→ shared v2 schema
→ constraints
→ user prompt
```

The shared JSON output contract is **unchanged**.

## New data shape

```python
@dataclass(frozen=True)
class RegionalModifier:
    region_id: str
    name: str
    trigger_rules: Mapping[str, Any]          # metadata only
    behavior_adjustments: tuple[str, ...]
    tactical_adjustments: tuple[str, ...]
    caution_adjustments: tuple[str, ...]
    species_tips_adjustments: tuple[str, ...]
    season_adjustments: Mapping[str, Mapping[str, Any]]
    confidence_note: str
```

`SpeciesPromptPack.regional_modifiers` is now a
`dict[region_id → RegionalModifier]` (previously a placeholder tuple).

## Canonical region ids

| id | Label | Coverage (broad) |
|---|---|---|
| `south_texas` | South Texas (Brush Country) | lat 26-29.6, lon -100 to -97 |
| `east_texas` | East Texas / Piney Woods | lat 29-33.8, lon -96.5 to -94 |
| `southeast_us` | Southeast US | lat 24-37.5, lon -94 to -75 |
| `mountain_west` | Mountain West | lat 31-49.5, lon -125 to -104 |
| `plains` | Great Plains | lat 32-49.5, lon -104 to -98 |
| `midwest` | Midwest / Corn Belt | lat 37-49.5, lon -98 to -80 |
| `generic_default` | (fallback) | anything else |

Priority-ordered first-match wins. Bounding boxes are intentionally
broad — this is a tactical-nuance layer, not a county classifier.

## GPS resolution (`species_prompts.regions`)

- `resolve_region_from_coordinates(lat, lon) → region_id`
  In-box match, else `generic_default`. Handles None / NaN / bad
  types gracefully.

- `normalize_region_override(text) → region_id | None`
  Freeform aliases for manual override: `"East Texas"`, `"east tx"`,
  `"ETX"`, `"Piney Woods"`, `"Brush Country"`, `"RGV"`, `"Hill Country"`,
  `"Rocky Mountains"`, `"Rockies"`, `"Corn Belt"`, `"Great Plains"`,
  plus all canonical ids. Unknown strings → None.

- `resolve_effective_region(gps_lat, gps_lon, map_centroid, manual_override)`
  → `RegionResolution(region_id, region_label, source, latitude, longitude)`
  Precedence: **manual override > GPS > map centroid > default**.
  The returned object has `.as_dict()` for persistence:
  ```json
  {
    "resolvedRegionId": "south_texas",
    "resolvedRegionLabel": "South Texas",
    "regionResolutionSource": "gps",
    "latitude": 28.5,
    "longitude": -98.5
  }
  ```

## Species coverage

| Pack | Regions implemented |
|---|---|
| Whitetail | all 6 (south_texas, east_texas, southeast_us, midwest, plains, mountain_west) |
| Turkey | 5 (east_texas, southeast_us, midwest, plains, mountain_west) — no south_texas override; base pack + plains covers Rio Grande |
| Hog | 4 (south_texas, east_texas, southeast_us, plains) — no midwest / mountain_west (sparse huntable populations) |

When a species has no modifier for the resolved region, the prompt
emits `REGIONAL CONTEXT: generic (region_id=<resolved>, source=<source>)`
with a "don't invent regional specifics" note. Region is still
recorded so the LLM knows it was detected but not overlaid.

## Region-aware seasonal shifts

A `RegionalModifier.season_adjustments` map lets a region override
individual fields of a seasonal phase's `trigger_rules`. Example —
South Texas whitetail shifts:

```python
season_adjustments={
    "rut":          {"months": (12, 1)},
    "pre_rut":      {"months": (11,)},
    "post_rut":     {"months": (2,)},
    "early_season": {"months": (9, 10)},
    "late_season":  {"months": (3,)},
}
```

The seasonal selector (`resolve_seasonal_modifier`) accepts an
optional `regional_modifier` parameter and applies these overrides
**without mutating the pack** (`dataclasses.replace`).

Summary of currently applied shifts:

| Species / Region | Shift |
|---|---|
| Whitetail / South Texas | rut → Dec-Jan, pre_rut → Nov, post_rut → Feb, late_season → Mar, early_season → Sep-Oct |
| Whitetail / East Texas | rut → Nov-Dec, post_rut → Jan |
| Whitetail / Southeast US | rut → Nov-Dec, post_rut → Jan |
| Whitetail / Mountain West | early_season → Aug-Sep |
| Turkey / East Texas | peak_breeding → Mar-Apr, late_season → May |
| Turkey / Southeast US | peak_breeding → Mar-Apr, late_season → May |
| Turkey / Plains | peak_breeding → Apr-May |
| Turkey / Mountain West | early_season → Apr, peak_breeding → May, late_season → May-Jun |
| Hog / South Texas | hot_weather → Apr-Oct AND ≥70°F; drought → Jun-Sep AND ≥88°F |

## Prompt builder API

```python
assemble_system_prompt(
    animal, conditions, image_count, tier,
    *,
    gps_coords=(lat, lon),               # primary
    map_centroid=(lat, lon),             # backup
    manual_region_override="East Texas", # wins when set & normalizable
    region_resolution=None,              # or pre-resolve once
)
```

Callers that have already computed `RegionResolution` (e.g. for
persistence) should pass it via `region_resolution=` to avoid
double resolution.

## Server integration

`HuntConditions` now accepts optional `latitude`, `longitude`,
`map_centroid_lat`, `map_centroid_lon`. The existing freeform
`region` field is still honored as a manual override.

`/api/analyze-hunt` response now includes:

```json
"region_resolution": {
  "resolvedRegionId": "south_texas",
  "resolvedRegionLabel": "South Texas",
  "regionResolutionSource": "gps",
  "latitude": 28.5,
  "longitude": -98.5
}
```

Clients should persist this alongside the hunt so the analysis basis
can be reloaded with the same regional lock.

## Example

`animal="deer"`, `gps_coords=(28.5, -98.5)`, `hunt_date="2026-12-15"`:

```
REGIONAL CONTEXT: South Texas (Brush Country) (region_id=south_texas, source=gps)
NOTE: South Texas rut timing varies substantially ranch-to-ranch...
REGIONAL BEHAVIOR ADJUSTMENTS (apply in addition to the base species rules):
  - Sparse, thorny brush (mesquite, huisache, prickly pear) dominates...
REGIONAL TACTICAL ADJUSTMENTS:
  - Bias setups along senderos, sendero intersections, water sources...
REGIONAL CAUTION ADJUSTMENTS (do not over-assume narrow regional specifics):
  - Do NOT apply classic Midwest ag/timber transition logic here...
REGIONAL SPECIES TIPS ADJUSTMENTS ...

SEASONAL TIMING SHIFT (regional): the phase boundaries below have been
adjusted for this region — apply them in the SEASONAL CONTEXT block ...

SEASONAL CONTEXT: Peak Rut (phase_id=rut)
...
```

Without the regional layer this same date would have resolved to
`post_rut`, giving incorrect tactical framing.

## Tests

`cd /app/backend && python -m pytest tests/test_regional_modifiers.py tests/test_seasonal_modifiers.py tests/test_species_prompt_packs.py -q`
→ **220/220 passing** (134 existing + 86 new regional tests).

Coverage: GPS bucket classification (20+ points across all 6
regions + OOB + junk), override alias normalization, effective
region precedence (manual > GPS > map_centroid > default), per-species
modifier inventories, region-aware seasonal shifts (all three species),
cross-species cue isolation (no deer-rut vocabulary in turkey/hog
modifiers, etc.), full prompt assembly including block ordering.

## Adding a new region

1. Add canonical id + label to `CANONICAL_REGIONS` in
   `species_prompts/regions.py`.
2. Add a bounding-box entry to `_BOXES` in priority order.
3. Add alias tokens to `_ALIAS_MAP` for manual overrides.
4. For each species that needs content, declare a `RegionalModifier`
   in the species module and insert into `regional_modifiers`.
5. Tests: bucket classification point(s), per-species modifier
   presence, any season_adjustments you introduced.

## Known limitations

- Bounding boxes are US-only and broad.
- No sub-state precision (e.g. Panhandle FL vs South FL both resolve
  to `southeast_us`).
- Region is coarse — confidence notes explicitly flag this so the
  LLM calibrates.
- No fall turkey phases yet.

## Next steps (recommended)

**Hunt-style modifiers** — archery vs rifle vs blind vs public-land
vs spot-and-stalk. Placeholder tuple already exists on the pack;
same pattern as regional: add a dict of modifiers on the pack, a
resolver, and a renderer.
