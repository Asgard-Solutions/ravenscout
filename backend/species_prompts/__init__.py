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

Future extension fields (seasonal, regional, hunt-style modifiers)
exist as reserved tuples so they can be populated without changing
the pack shape.

Adding a new species:
    1. Create `species_prompts/<name>.py` with one `SpeciesPromptPack`
       constant.
    2. Register it in `registry.py::_PACKS`.
    3. Done — the shared output schema is unchanged.

The registry is the single source of truth for species content; no
species-specific strings live in other modules.
"""

from .pack import OverlayFallbackReason, SpeciesPromptPack
from .registry import (
    GENERIC_FALLBACK_PACK,
    get_all_canonical_species,
    resolve_species_pack,
)

__all__ = [
    "SpeciesPromptPack",
    "OverlayFallbackReason",
    "resolve_species_pack",
    "get_all_canonical_species",
    "GENERIC_FALLBACK_PACK",
]
