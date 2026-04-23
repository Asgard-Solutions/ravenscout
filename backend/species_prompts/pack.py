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

    # Placeholders kept as string tuples for future expansion layers.
    regional_modifiers: Tuple[str, ...] = field(default_factory=tuple)
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

    if pack.regional_modifiers:
        lines.append("REGIONAL MODIFIERS:")
        lines.append(_bullets(pack.regional_modifiers))
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
