"""Species prompt pack — data class and block rendering."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Tuple


class OverlayFallbackReason(str, Enum):
    """Why an unsupported species resolved to the generic fallback.

    Surfaces to the LLM so it can lower confidence appropriately.
    """
    UNKNOWN_SPECIES = "unknown_species"


@dataclass(frozen=True)
class SpeciesPromptPack:
    """Structured, inspectable prompt fragments for one species.

    Each field carries one layer of species-specific guidance and is
    injected into the shared prompt under a clearly labeled heading.
    Content is intentionally stored as simple string tuples (not
    nested templates) so that pack diffs read cleanly in code review.
    """

    canonical_id: str
    display_name: str
    aliases: Tuple[str, ...]

    # Core biology / behavior.
    behavior_rules: Tuple[str, ...]
    # Tactics rooted in the above biology.
    tactical_guidance: Tuple[str, ...]
    # Working assumptions about movement / activity windows.
    movement_assumptions: Tuple[str, ...]
    # "Do not over-assume" guardrails for this species.
    caution_rules: Tuple[str, ...]
    # Hints for what to populate in the shared `species_tips` output.
    species_tips_guidance: Tuple[str, ...]

    # Reserved for future expansion — intentionally empty tuples so
    # a new modifier layer can be added without reshaping the pack.
    seasonal_modifiers: Tuple[str, ...] = field(default_factory=tuple)
    regional_modifiers: Tuple[str, ...] = field(default_factory=tuple)
    hunt_style_modifiers: Tuple[str, ...] = field(default_factory=tuple)

    # Optional flag used by the generic fallback pack.
    is_fallback: bool = False
    fallback_reason: OverlayFallbackReason | None = None


# -------------------------- Block rendering --------------------------


def _bullets(items: Tuple[str, ...]) -> str:
    return "\n".join(f"  - {line}" for line in items) if items else "  - (none)"


def render_species_prompt_block(pack: SpeciesPromptPack) -> str:
    """Render a SpeciesPromptPack into the system-prompt fragment.

    The heading layout is deliberate and stable — it lets tests
    assert block presence without coupling to exact copy.
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

    if pack.seasonal_modifiers:
        lines.append("SEASONAL MODIFIERS:")
        lines.append(_bullets(pack.seasonal_modifiers))
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
