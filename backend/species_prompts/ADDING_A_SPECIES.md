# Adding a Species to Raven Scout

The species system is **configuration-driven** — adding a new animal
(e.g. waterfowl, dove, quail, or a regional variant) requires changes
in three places only. No existing callsites need to be touched.

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  /app/backend/species_registry.py                           │
│                                                             │
│  Single source of truth — id, name, category, min_tier,     │
│  icon, terminology, form_fields, prompt_pack_id, enabled.   │
│                                                             │
│  Consumed by:                                               │
│    • GET /api/species            (UI catalog + tier locks)  │
│    • analyze-hunt tier gating    (server-side enforcement)  │
│    • legacy SPECIES_DATA shim    (AI analysis pipeline)     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  /app/backend/species_prompts/<species>.py                  │
│                                                             │
│  The prompt pack: behavior_rules, tactical_guidance,        │
│  movement_assumptions, caution_rules, species_tips_guidance │
│  + optional seasonal_modifiers / regional_modifiers /       │
│  hunt_style_modifiers. Each is an additive prompt fragment. │
│                                                             │
│  Registered in:                                             │
│    /app/backend/species_prompts/registry.py  (_PACKS tuple) │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  /app/frontend/src/constants/species.tsx                    │
│                                                             │
│  Typed TypeScript mirror of the backend registry, fetched   │
│  live via GET /api/species at app start. UI reads from this │
│  via useSpeciesCatalog().                                   │
└─────────────────────────────────────────────────────────────┘
```

## Add a new species — step by step

### 1. Write the prompt pack

Create `/app/backend/species_prompts/<species>.py`:

```python
from .pack import SeasonalModifier, SpeciesPromptPack

# Optional: seasonal modifiers (rut, pre-rut, hot weather, winter, etc.)
_<SPECIES>_RUT = SeasonalModifier(
    phase_id="rut",
    name="Rut",
    trigger_rules={"months": (10, 11), "logic": "either"},
    behavior_adjustments=("...",),
    tactical_adjustments=("...",),
    caution_adjustments=("...",),
    species_tips_adjustments=("...",),
)

<SPECIES>_PACK = SpeciesPromptPack(
    canonical_id="<species>",
    display_name="<Display Name>",
    aliases=("<species>", "<species>s", "<alt name>"),
    behavior_rules=("...",),
    tactical_guidance=("...",),
    movement_assumptions=("...",),
    caution_rules=("...",),
    species_tips_guidance=("...",),
    seasonal_modifiers={"rut": _<SPECIES>_RUT},
)
```

Rules of thumb:
- **Aliases** drive the registry's `resolve_species_pack()` — include plural forms, regional names, and gendered sub-terms (`bull elk`, `cow elk`).
- **Everything is additive.** Modifiers LAYER on top of the base pack — they do not replace.
- Be conservative. The pack renders into the LLM prompt verbatim; imprecise instructions degrade the output.

### 2. Register the pack

Edit `/app/backend/species_prompts/registry.py`:

```python
from .<species> import <SPECIES>_PACK

_PACKS: Tuple[SpeciesPromptPack, ...] = (
    WHITETAIL_PACK, TURKEY_PACK, HOG_PACK,
    ELK_PACK, BEAR_PACK, MOOSE_PACK,
    ANTELOPE_PACK, COYOTE_PACK,
    <SPECIES>_PACK,        # ← add here
)
```

### 3. Register the species in the central registry

Edit `/app/backend/species_registry.py` — append to `SPECIES_REGISTRY`:

```python
SpeciesConfig(
    id="<species>",
    name="<Display Name>",
    short_description="One-line hook shown on the selection card.",
    category=CATEGORY_BIG_GAME,   # or CATEGORY_PREDATOR / CATEGORY_BIRD
    min_tier="core",              # "trial" / "core" / "pro"
    icon="paw",                   # Ionicons glyph name
    prompt_pack_id="<species>",   # matches pack canonical_id
    terminology=Terminology(male="...", female="...", young="...", group="..."),
    form_fields=SpeciesFormFields(
        group_size=False, calling_activity=False, ...  # opt-in per field
    ),
    enabled=True,                 # set False to hide in UI during staging
),
```

That's it on the backend — restart the server and `/api/species`
immediately serves the new entry with the correct lock flag per user
tier.

### 4. (Optional) Mirror in the offline frontend fallback

`/app/frontend/src/constants/species.tsx` — `LOCAL_FALLBACK_SPECIES`
is the cold-start-offline list. Only add the new species here if it's
in the trial tier (so offline users see it). Paid-tier species are
not needed in the fallback because they'll always be locked offline.

### 5. Testing

```bash
# Backend:
cd /app/backend && python -m pytest tests/ -k species

# API smoke:
curl -s "$EXPO_PUBLIC_BACKEND_URL/api/species" | jq '.species | map(.id)'

# Tier gating — as a trial user:
curl -s "$EXPO_PUBLIC_BACKEND_URL/api/species" \
    -H "Authorization: Bearer test_session_rs_trial" \
    | jq '.species[] | {id, min_tier, locked}'

# Prompt pack resolution:
python -c "
from species_prompts import resolve_species_pack, is_supported_species
p = resolve_species_pack('<species>')
print(p.canonical_id, p.display_name, p.is_fallback)
assert is_supported_species('<species>')
"
```

## Enabling a pre-staged species later

Future species (`waterfowl`, `dove`, `quail`) are already registered
with `enabled=False` and no prompt-pack file yet. To enable:

1. Create the prompt pack (step 1 above).
2. Add to `_PACKS` tuple (step 2).
3. Flip the registry entry `enabled=False` → `True`.

The UI will pick up the new species at the next `/api/species` fetch.

## Terminology resolution

Backend:
```python
from species_registry import get_species_term
sex_label = get_species_term("elk", "male")   # -> "bull"
```

Frontend:
```tsx
const catalog = useSpeciesCatalog();
const maleTerm = catalog.getTerm("elk", "male");  // -> "bull"
```

Missing terminology falls back to the generic default (`male` /
`female` / `young` / `group`).

## Form fields

`SpeciesFormFields` is a bag of boolean flags. The hunt form today
ignores these (stubbed architecture), but they're wired end-to-end
through the API so future form sections can branch on them without
touching the registry:

```python
cfg = get_species_by_id("coyote")
if cfg.form_fields.calling_activity:
    # render "calling activity" field
    ...
```

## Compatibility notes

- Legacy `SPECIES_DATA` dict in `server.py` is now a shim over
  `species_registry.legacy_species_data()`. Any code still reading
  from it (`SPECIES_DATA["deer"]["behavior_rules"]`, etc.) continues
  to work verbatim.
- Existing hunt records with `animal="deer" | "turkey" | "hog"`
  continue to resolve identically — the same prompt packs and the
  same prompt structures.
- Trial users attempting to POST `/api/analyze-hunt` with a
  paid-tier species get a `403 Forbidden` with a readable message
  (the UI lock is not trusted server-side).
