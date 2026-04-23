"""Raven Scout — Species Prompt Packs."""

from .pack import (
    OverlayFallbackReason,
    RegionalModifier,
    SeasonalModifier,
    SpeciesPromptPack,
    render_no_regional_context_note,
    render_no_seasonal_context_note,
    render_regional_modifier_block,
    render_seasonal_modifier_block,
    render_species_prompt_block,
)
from .regions import (
    CANONICAL_REGIONS,
    GENERIC_DEFAULT,
    RegionResolution,
    get_region_label,
    normalize_region_override,
    resolve_effective_region,
    resolve_region_from_coordinates,
)
from .registry import (
    GENERIC_FALLBACK_PACK,
    get_all_canonical_species,
    is_supported_species,
    resolve_species_pack,
)
from .seasons import resolve_seasonal_modifier


def resolve_regional_modifier(
    species_pack: SpeciesPromptPack,
    region_id: str,
):
    """Return the species' regional modifier for `region_id`, or None."""
    if not species_pack or not species_pack.regional_modifiers:
        return None
    return species_pack.regional_modifiers.get(region_id)


__all__ = [
    "SpeciesPromptPack",
    "SeasonalModifier",
    "RegionalModifier",
    "OverlayFallbackReason",
    "RegionResolution",
    "CANONICAL_REGIONS",
    "GENERIC_DEFAULT",
    "resolve_species_pack",
    "resolve_seasonal_modifier",
    "resolve_regional_modifier",
    "resolve_effective_region",
    "resolve_region_from_coordinates",
    "normalize_region_override",
    "get_region_label",
    "get_all_canonical_species",
    "is_supported_species",
    "GENERIC_FALLBACK_PACK",
    "render_species_prompt_block",
    "render_seasonal_modifier_block",
    "render_no_seasonal_context_note",
    "render_regional_modifier_block",
    "render_no_regional_context_note",
]
