"""Species prompt pack — data classes and block rendering.

This module defines two data classes:

    - SpeciesPromptPack:    one species worth of base prompt content.
    - SeasonalModifier:     an *additive* overlay applied on top of a
                            species pack when the hunt conditions
                            match the modifier's trigger rules.

Seasonal modifiers never replace the species pack — they append a
separate SEASONAL CONTEXT block to the system prompt after the species
block. When no modifier can be confidently selected (missing data,
out-of-season date, unsupported species), a conservative neutral
notice is emitted instead.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Mapping, Optional, Tuple


class OverlayFallbackReason(str, Enum):
    """Why an unsupported species resolved to the generic fallback.

    Surfaces to the LLM so it can lower confidence appropriately.
    """
    UNKNOWN_SPECIES = "unknown_species"


# -------------------------------------------------------------------
# SeasonalModifier
# -------------------------------------------------------------------


@dataclass(frozen=True)
class SeasonalModifier:
    """Additive overlay on top of a species pack.

    Fields are intentionally parallel to `SpeciesPromptPack` so the
    LLM receives familiar headings, and each list is purely *additional*
    guidance — the base pack's rules still apply.

    `trigger_rules` is metadata consumed by `seasons.resolve_seasonal_modifier`.
    Recognized keys (all optional):

        months:          tuple[int, ...]          -> calendar months 1..12
        min_temp_f:      int | float | None       -> inclusive lower bound
        max_temp_f:      int | float | None       -> inclusive upper bound
        regions_hint:    tuple[str, ...]          -> advisory regional tags

    The selector is intentionally conservative — when inputs are
    ambiguous it returns None rather than guessing.
    """

    phase_id: str
    name: str
    trigger_rules: Mapping[str, Any] = field(default_factory=dict)

    behavior_adjustments: Tuple[str, ...] = ()
    tactical_adjustments: Tuple[str, ...] = ()
    caution_adjustments: Tuple[str, ...] = ()
    species_tips_adjustments: Tuple[str, ...] = ()

    # A short sentence the LLM will see in the block header that
    # explicitly motivates reduced confidence if the phase is inferred.
    confidence_note: str = (
        "Season inference is coarse. If hunt conditions don't clearly "
        "support this phase, lower overall confidence."
    )


# -------------------------------------------------------------------
# RegionalModifier
# -------------------------------------------------------------------


@dataclass(frozen=True)
class RegionalModifier:
    """Additive overlay keyed to a broad hunting region.

    Fields parallel `SpeciesPromptPack` so the LLM receives familiar
    headings. Everything is *additive* — the base species and seasonal
    guidance still apply.

    `season_adjustments` is an OPTIONAL override map consumed by
    `seasons.resolve_seasonal_modifier`. Keys are seasonal phase_ids;
    values are dicts that override individual fields of that phase's
    `trigger_rules` (e.g. shifting the `months` tuple or
    `min_temp_f`/`max_temp_f` thresholds for a region).

    Example (South Texas whitetail rut shifts later):
        season_adjustments = {"rut": {"months": (12, 1)}}

    `trigger_rules` is metadata — currently informational only
    (selection is by canonical region id, not by trigger matching).
    """

    region_id: str
    name: str
    trigger_rules: Mapping[str, Any] = field(default_factory=dict)

    behavior_adjustments: Tuple[str, ...] = ()
    tactical_adjustments: Tuple[str, ...] = ()
    caution_adjustments: Tuple[str, ...] = ()
    species_tips_adjustments: Tuple[str, ...] = ()

    # Phase-id -> partial trigger_rule overrides for the seasonal
    # selector. Unknown phase_ids are ignored.
    season_adjustments: Mapping[str, Mapping[str, Any]] = field(default_factory=dict)

    confidence_note: str = (
        "Region inference is broad. Local variation can be substantial; "
        "lower confidence for claims that rely on narrow regional specifics."
    )


# -------------------------------------------------------------------
# SpeciesPromptPack
# -------------------------------------------------------------------


@dataclass(frozen=True)
class SpeciesPromptPack:
    """Structured, inspectable prompt fragments for one species."""

    canonical_id: str
    display_name: str
    aliases: Tuple[str, ...]

    behavior_rules: Tuple[str, ...]
    tactical_guidance: Tuple[str, ...]
    movement_assumptions: Tuple[str, ...]
    caution_rules: Tuple[str, ...]
    species_tips_guidance: Tuple[str, ...]

    # Seasonal modifiers are a NAMED MAP — keyed by `phase_id`. The
    # selector picks (at most) one at prompt build time based on
    # HuntConditions.
    seasonal_modifiers: Dict[str, "SeasonalModifier"] = field(default_factory=dict)

    # Regional modifiers keyed by canonical region id (see
    # species_prompts.regions). Resolved from hunt GPS first, then
    # optional manual override. A regional modifier can also shift
    # seasonal phase boundaries via its `season_adjustments` map.
    regional_modifiers: Dict[str, "RegionalModifier"] = field(default_factory=dict)

    # Placeholder kept as string tuple for future expansion layer.
    hunt_style_modifiers: Tuple[str, ...] = field(default_factory=tuple)

    is_fallback: bool = False
    fallback_reason: OverlayFallbackReason | None = None


# -------------------------------------------------------------------
# Rendering
# -------------------------------------------------------------------


def _bullets(items: Tuple[str, ...]) -> str:
    return "\n".join(f"  - {line}" for line in items) if items else "  - (none)"


def render_species_prompt_block(pack: SpeciesPromptPack) -> str:
    """Render a SpeciesPromptPack into the base species prompt fragment.

    Seasonal modifiers are NOT rendered here — they're resolved
    dynamically and appended as a separate block after the species
    pack. See `render_seasonal_modifier_block` and
    `render_no_seasonal_context_note`.
    """
    lines = [
        "",
        f"SPECIES: {pack.display_name}",
        "BEHAVIOR RULES:",
        _bullets(pack.behavior_rules),
        "TACTICAL GUIDANCE:",
        _bullets(pack.tactical_guidance),
        "MOVEMENT ASSUMPTIONS:",
        _bullets(pack.movement_assumptions),
        "CAUTION RULES (do not over-assume):",
        _bullets(pack.caution_rules),
        "SPECIES TIPS GUIDANCE (use these themes when populating the species_tips[] output):",
        _bullets(pack.species_tips_guidance),
    ]

    if pack.hunt_style_modifiers:
        lines.append("HUNT STYLE MODIFIERS:")
        lines.append(_bullets(pack.hunt_style_modifiers))

    if pack.is_fallback:
        lines.append("")
        lines.append(
            "FALLBACK NOTICE: The requested species is not a first-class "
            "supported pack in this deployment. Use conservative, "
            "generic tactical reasoning and LOWER overall confidence. "
            "Populate confidence_summary.main_limitations with an "
            "'unsupported species' note."
        )

    return "\n".join(lines)


def render_seasonal_modifier_block(modifier: SeasonalModifier) -> str:
    """Render a resolved seasonal modifier as an additive prompt block.

    Always trailing the base species block in the final prompt.
    Adjustments are framed as *additions* to the species pack, not
    replacements — the LLM must continue to honor the base species
    rules.
    """
    lines = [
        "",
        f"SEASONAL CONTEXT: {modifier.name} (phase_id={modifier.phase_id})",
        f"NOTE: {modifier.confidence_note}",
        "",
        "SEASONAL BEHAVIOR ADJUSTMENTS (apply in addition to the base species rules):",
        _bullets(modifier.behavior_adjustments),
        "SEASONAL TACTICAL ADJUSTMENTS:",
        _bullets(modifier.tactical_adjustments),
        "SEASONAL CAUTION ADJUSTMENTS (do not over-assume phase specifics):",
        _bullets(modifier.caution_adjustments),
        "SEASONAL SPECIES TIPS ADJUSTMENTS (layer these on top of base species_tips guidance):",
        _bullets(modifier.species_tips_adjustments),
    ]
    return "\n".join(lines)


def render_no_seasonal_context_note() -> str:
    """Emitted when no seasonal modifier can be selected.

    Keeps the prompt shape consistent (one block always exists where
    seasonal content would go), and explicitly tells the LLM NOT to
    assume a phase.
    """
    return (
        "\nSEASONAL CONTEXT: unavailable\n"
        "NOTE: Insufficient data to confidently infer a seasonal phase "
        "(rut, peak breeding, drought, etc.). Do NOT assume a phase. "
        "Lower confidence for recommendations that would depend on one."
    )


def render_regional_modifier_block(
    modifier: RegionalModifier,
    region_id: str,
    region_label: str,
    source: str,
) -> str:
    """Render a resolved regional modifier as an additive prompt block.

    Sits between the species pack and the seasonal modifier in the
    assembled prompt. Adjustments are framed as *additions* to the
    species pack — the base species rules still apply.

    `source` is the value of `regionResolutionSource`
    (``"gps"`` / ``"map_centroid"`` / ``"manual_override"`` / ``"default"``)
    — included so the LLM knows whether the region was confidently
    detected vs. defaulted to.
    """
    lines = [
        "",
        f"REGIONAL CONTEXT: {modifier.name} (region_id={region_id}, source={source})",
        f"NOTE: {modifier.confidence_note}",
        "",
        "REGIONAL BEHAVIOR ADJUSTMENTS (apply in addition to the base species rules):",
        _bullets(modifier.behavior_adjustments),
        "REGIONAL TACTICAL ADJUSTMENTS:",
        _bullets(modifier.tactical_adjustments),
        "REGIONAL CAUTION ADJUSTMENTS (do not over-assume narrow regional specifics):",
        _bullets(modifier.caution_adjustments),
        "REGIONAL SPECIES TIPS ADJUSTMENTS (layer these on top of base species_tips guidance):",
        _bullets(modifier.species_tips_adjustments),
    ]
    if modifier.season_adjustments:
        lines.append("")
        lines.append(
            "SEASONAL TIMING SHIFT (regional): the phase boundaries "
            "below have been adjusted for this region — apply them in "
            "the SEASONAL CONTEXT block that follows."
        )
    # Region label is kept for display/debug but not asserted in the prompt.
    _ = region_label
    return "\n".join(lines)


def render_no_regional_context_note(
    region_id: str,
    region_label: str,
    source: str,
) -> str:
    """Emitted when no regional modifier is available for this pack.

    The prompt still records the detected region + source so the LLM
    can calibrate its own confidence, but no tactical adjustments are
    injected. Keeps the prompt shape stable regardless of resolution.
    """
    _ = region_label
    return (
        f"\nREGIONAL CONTEXT: generic (region_id={region_id}, source={source})\n"
        "NOTE: No species-specific regional modifier is applied. Fall "
        "back to the base species pack's tactical reasoning. Do NOT "
        "invent regional specifics; lower confidence for claims that "
        "would depend on local geography."
    )
