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

## Next steps (recommended)

1. **Seasonal modifiers** first — rut phase for whitetails and
   breeding season for turkeys give the biggest tactical lift.
2. Tune content through an LLM-output review cycle on real analyses
   for each species before adding more species.
3. Optional: `regional_modifiers` sourced from a simple state/region
   map, driven by the existing `region` field in `HuntConditions`.
