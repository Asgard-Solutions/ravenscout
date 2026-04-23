"""Raven Scout — Species Prompt Packs.

Modular, species-specific prompt fragments that plug into the shared
prompt pipeline (`prompt_builder.py`). Each species pack contains:

    - canonical_id       -> stable internal identifier
    - display_name       -> shown to the LLM
    - aliases            -> strings the resolver accepts for this pack
    - behavior_rules     -> core biology/ethology rules
    - tactical_guidance  -> species-targeted setup/approach tactics
    - movement_assumptions
    - caution_rules      -> "do not over-assume" guidance
    - species_tips_guidance -> guidance the LLM uses when populating
                             the shared `species_tips` output array
    - seasonal_modifiers -> Dict[phase_id, SeasonalModifier]

Adding a new species:
    1. Create `species_prompts/<name>.py` with one `SpeciesPromptPack`
       constant.
    2. Register it in `registry.py::_PACKS`.
    3. Done — the shared output schema is unchanged.

Adding a new seasonal phase to an existing species:
    1. Declare a `SeasonalModifier` in that species' module.
    2. Add it to the species pack's `seasonal_modifiers` dict,
       ordered most-specific first (selector returns first match).

The registry is the single source of truth for species content; no
species-specific strings live in other modules.
"""

from .pack import (
    OverlayFallbackReason,
    SeasonalModifier,
    SpeciesPromptPack,
    render_no_seasonal_context_note,
    render_seasonal_modifier_block,
    render_species_prompt_block,
)
from .registry import (
    GENERIC_FALLBACK_PACK,
    get_all_canonical_species,
    is_supported_species,
    resolve_species_pack,
)
from .seasons import resolve_seasonal_modifier

__all__ = [
    "SpeciesPromptPack",
    "SeasonalModifier",
    "OverlayFallbackReason",
    "resolve_species_pack",
    "resolve_seasonal_modifier",
    "get_all_canonical_species",
    "is_supported_species",
    "GENERIC_FALLBACK_PACK",
    "render_species_prompt_block",
    "render_seasonal_modifier_block",
    "render_no_seasonal_context_note",
]
