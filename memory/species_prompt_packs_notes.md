# Raven Scout — Species Prompt Packs

Status: **Implemented**. Replaces the old single generic species
behavior block in `prompt_builder.build_species_rules` with a
modular, targeted species prompt registry.

## Where things live

```
backend/
├── prompt_builder.py         # shared pipeline (unchanged contract)
└── species_prompts/
    ├── __init__.py           # public API
    ├── pack.py               # SpeciesPromptPack dataclass + render
    ├── registry.py           # alias resolver + GENERIC_FALLBACK_PACK
    ├── whitetail.py          # WHITETAIL_PACK
    ├── turkey.py             # TURKEY_PACK
    └── hog.py                # HOG_PACK
```

No species-specific strings live outside `species_prompts/`.

## Shared vs species-specific

| Layer | Source | Species-specific? |
|---|---|---|
| Base system prompt (`Raven Scout …`) | `prompt_builder.build_base_system_prompt` | No |
| **Species block** | `species_prompts/*` via registry | **Yes** |
| Hunt conditions (`HUNT CONDITIONS`) | `build_hunt_conditions_block` | No |
| Image context (tier/image-count aware) | `build_image_context_block` | No |
| JSON output schema (v2) | `build_output_schema_block` | **No — still shared** |
| Strict constraints | `build_output_constraints` | No |
| User prompt | `build_user_prompt` | No |

The output JSON contract is intact. Species packs shape reasoning
and wording only.

## Pack shape

```python
@dataclass(frozen=True)
class SpeciesPromptPack:
    canonical_id: str
    display_name: str
    aliases: tuple[str, ...]
    behavior_rules: tuple[str, ...]
    tactical_guidance: tuple[str, ...]
    movement_assumptions: tuple[str, ...]
    caution_rules: tuple[str, ...]          # "do not over-assume"
    species_tips_guidance: tuple[str, ...]  # for species_tips[]
    seasonal_modifiers: tuple[str, ...] = () # reserved
    regional_modifiers: tuple[str, ...] = () # reserved
    hunt_style_modifiers: tuple[str, ...] = () # reserved
    is_fallback: bool = False
```

Each heading is a stable substring tests can assert against
(`SPECIES TIPS GUIDANCE`, `CAUTION RULES (do not over-assume)`,
`TACTICAL GUIDANCE`, etc.).

## Canonical species resolution

`species_prompts.resolve_species_pack(str) -> SpeciesPromptPack`.

Normalization is lowercase + whitespace-collapse + `-`/`_`/`'` to
space, plus a naive plural strip (`"hogs"` → `"hog"`). Matches
`canonical_id`, `display_name`, and every alias.

Supported canonical inputs today:

| Pack | Canonical id | Example aliases |
|---|---|---|
| Whitetail Deer | `whitetail` | `deer`, `Whitetail`, `Whitetail Deer`, `white-tailed deer`, `white tailed deer`, `whitetailed deer` |
| Wild Turkey | `turkey` | `turkey`, `wild turkey`, `eastern turkey`, `rio grande turkey`, `merriam['s] turkey`, `osceola turkey`, `gobbler` |
| Wild Hog | `hog` | `hog`, `hogs`, `pig`, `pigs`, `wild hog`, `feral hog`, `feral hogs`, `feral swine`, `wild boar`, `boar` |

### Unsupported species behavior

`resolve_species_pack("elk")` returns `GENERIC_FALLBACK_PACK`:

- `is_fallback = True`, `fallback_reason = UNKNOWN_SPECIES`
- Renders a `FALLBACK NOTICE` instructing the LLM to use conservative
  generic reasoning AND lower overall confidence
- Requires that `confidence_summary.main_limitations` include an
  `unsupported species` note
- Does NOT raise. The backend's separate `SPECIES_DATA` allow-list
  in `server.py` guards which species the client can actually submit;
  the fallback exists so that if that guard is ever loosened, the
  prompt layer degrades gracefully instead of 500-ing.

We chose graceful fallback over a prompt-layer hard error because it
decouples allow-list policy from prompt-assembly correctness. To
switch to hard-error semantics, call `is_supported_species(animal)`
in the API handler and return a 422 before invoking the builder.

## Adding a new species

1. Create `species_prompts/<name>.py` that exports one `<NAME>_PACK`
   `SpeciesPromptPack` constant — fill in behavior, tactics,
   movement assumptions, cautions, and tips guidance.
2. Add the pack to `_PACKS` in `species_prompts/registry.py`.
3. Add the species id / aliases you want the resolver to accept.
4. If you want it accepted by the API, add it to `SPECIES_DATA` in
   `server.py` (or adapt the allow-list to the registry).
5. Add alias-resolution tests to `tests/test_species_prompt_packs.py`.

No changes to `prompt_builder.py`, schema, or the response contract
are needed.

## Future extension points

All three modifier tuples are already in the pack shape:

- `seasonal_modifiers` → e.g. "rut", "early-season", "post-rut"
- `regional_modifiers` → e.g. "southeast pine plantation",
  "midwest ag", "mountain west"
- `hunt_style_modifiers` → e.g. "archery", "rifle", "blind",
  "public land pressured", "spot-and-stalk"

When you implement them, `render_species_prompt_block` already
emits their headings conditionally. The logical next step is a
`build_modifiers_block(pack, context)` that selects which modifier
tuples apply based on hunt conditions (e.g. date → season, region
string → regional, hunt-style metadata → style).

## Tests

`cd /app/backend && python -m pytest tests/test_species_prompt_packs.py -v`
→ **75/75 passing**. Covers:

- Alias resolution for every first-class pack (whitetail / turkey / hog)
- Unsupported species → fallback pack
- Pack inventory / introspection shape
- Per-species tactical language present AND not drifting into other species' cue vocabulary
- Every pack carries "do not over-assume" + species_tips guidance
- Assembled system prompt contains all shared v2 schema keys across every species × tier
- Multi-image block triggers only on image_count > 1
- `species_tips` output constraint cross-references pack guidance
- Legacy `species_data` kwarg still accepted (and ignored) for backwards compatibility

## Files changed

- `backend/prompt_builder.py` — `build_species_rules` and `assemble_system_prompt` now use the registry; added `build_species_prompt_pack_block`; extended output constraints with a species_tips pointer.
- `backend/species_prompts/__init__.py` — NEW package.
- `backend/species_prompts/pack.py` — NEW dataclass + renderer.
- `backend/species_prompts/registry.py` — NEW resolver + fallback.
- `backend/species_prompts/{whitetail,turkey,hog}.py` — NEW first-class packs.
- `backend/tests/test_species_prompt_packs.py` — NEW, 75 tests.
- `backend/server.py` — unchanged (still calls `assemble_system_prompt`
  with the legacy `species_data=SPECIES_DATA` kwarg, which is now
  accepted and ignored).

## Seasonal Modifiers — Implemented (v3.1+)

Seasonal modifiers are an **additive overlay** on top of a species
pack. They shape reasoning for a specific calendar window or
temperature regime without replacing the base species rules.

### Structure

```python
@dataclass(frozen=True)
class SeasonalModifier:
    phase_id: str                   # stable key, e.g. "rut", "hot_weather"
    name: str                       # LLM-facing label, e.g. "Peak Rut"
    trigger_rules: dict             # see below
    behavior_adjustments: tuple[str, ...]
    tactical_adjustments: tuple[str, ...]
    caution_adjustments: tuple[str, ...]
    species_tips_adjustments: tuple[str, ...]
    confidence_note: str            # nudges the LLM toward lower confidence
```

`SpeciesPromptPack.seasonal_modifiers` is now a `dict[phase_id -> SeasonalModifier]`.

### Trigger rules

Consumed by `species_prompts.seasons.resolve_seasonal_modifier`:

| Key | Type | Meaning |
|---|---|---|
| `months` | tuple[int, ...] | Calendar months (1..12) |
| `min_temp_f` | number | Inclusive lower temp bound (F) |
| `max_temp_f` | number | Inclusive upper temp bound (F) |
| `logic` | `month`/`temp`/`either`/`both` | how month + temp combine (default `month`) |

Selector order: `seasonal_modifiers.values()` in declaration order,
first match wins. Pack authors should list specific windows first.

When neither `hunt_date` nor `temperature` can be parsed from
conditions, the selector returns `None` — a conservative "don't
guess" design.

### Supported phases

| Species | Phases |
|---|---|
| Whitetail Deer | `early_season` (Sep), `pre_rut` (Oct), `rut` (Nov), `post_rut` (Dec), `late_season` (Jan-Feb) |
| Wild Turkey | `early_season` (Mar), `peak_breeding` (Apr), `late_season` (May) |
| Wild Hog | `drought_conditions` (Jul-Sep AND temp ≥ 90F), `hot_weather` (May-Sep OR temp ≥ 75F), `cold_weather` (Dec-Feb OR temp ≤ 40F) |

Calendars are Northern-Hemisphere US baselines. Out-of-season dates
or ambiguous conditions return None → the prompt emits a neutral
"SEASONAL CONTEXT: unavailable — do not assume a phase" note.

### Prompt pipeline (updated)

```
base
→ species pack           (species_prompts registry)
→ seasonal modifier      ← NEW: first-match from species pack's dict
   or "unavailable" note  (when selector returns None)
→ hunt conditions
→ image/tier context
→ output schema (unchanged v2)
→ constraints
→ user prompt
```

### Example rendered seasonal block

See `tests/test_seasonal_modifiers.py::TestSeasonalPromptIntegration`
for end-to-end assertions. Quick sample for `("deer", 2026-11-12)`:

```
SEASONAL CONTEXT: Peak Rut (phase_id=rut)
NOTE: Peak-rut timing varies by region and latitude by up to two weeks.
If location is unknown, treat phase as coarse and lower confidence for
rut-dependent recommendations.

SEASONAL BEHAVIOR ADJUSTMENTS (apply in addition to the base species rules):
  - Mature bucks are cruising for estrus does and move more during daylight...
  - Wind discipline relaxes — bucks will cross open ground or travel downwind...
  - Travel through funnels between doe bedding areas increases sharply.
  ...

SEASONAL TACTICAL ADJUSTMENTS:
  - Favor all-day stand sits on funnels between known / likely doe-bedding areas.
  - Mid-day setups become viable — do not dismiss 10:00-14:00 windows.
  ...

SEASONAL CAUTION ADJUSTMENTS (do not over-assume phase specifics):
  - Do NOT claim a specific rut phase sub-stage (seeking, chasing, lockdown)...
  ...

SEASONAL SPECIES TIPS ADJUSTMENTS (layer these on top of base species_tips guidance):
  - Emphasize mid-day stand sits and funnel / pinch-point setups.
  ...
```

### Adding a new seasonal phase

1. Declare a `SeasonalModifier` in the species' module.
2. Insert into that pack's `seasonal_modifiers` dict, ordered
   most-specific first (selector returns first match).
3. Add tests for:
   - month / temperature selection cases that should fire
   - cases that should NOT fire (out-of-season, missing inputs)
   - cross-species isolation (no cue leakage)

### Known limitations

- Calendars are coarse US-NH baselines — they will over-fire for
  southern rut dates and under-fire for northern rut dates.
- Drought inference is intentionally weak: requires a high summer
  temperature AND a summer month. Do not treat it as a verified
  drought claim — it's a water-ambush bias with lower confidence.
- No regional calendar layer yet. Next layer to add is
  `regional_modifiers` so southern turkey peak breeding fires
  earlier than April.
- No hunt-style layer yet (bow vs rifle, public vs private, blind
  vs spot-and-stalk). Placeholders exist on the pack.

### Files added / changed for seasonal support

- `backend/species_prompts/pack.py` — `SeasonalModifier`, dict-valued
  `seasonal_modifiers`, `render_seasonal_modifier_block`,
  `render_no_seasonal_context_note`.
- `backend/species_prompts/seasons.py` — NEW selector +
  date/temperature parsers.
- `backend/species_prompts/whitetail.py` / `turkey.py` / `hog.py` —
  populated `seasonal_modifiers` dicts.
- `backend/species_prompts/__init__.py` — exports updated.
- `backend/species_prompts/registry.py` — re-exports
  `resolve_seasonal_modifier`.
- `backend/prompt_builder.py` — inserts seasonal block between
  species pack and hunt conditions.
- `backend/tests/test_seasonal_modifiers.py` — NEW, 59 tests.

