"""Species prompt registry — single source of truth for pack resolution.

Resolution strategy:
    1. Normalize the incoming string (lowercase, collapse whitespace,
       strip common suffixes).
    2. Match against each pack's canonical_id.
    3. Match against each pack's declared aliases.
    4. Fall back to GENERIC_FALLBACK_PACK, which signals the LLM to
       use conservative generic reasoning and lower confidence.

The generic fallback is preferred over raising at the prompt layer
because the backend already validates allowed species separately
(see `SPECIES_DATA` in `server.py`). That keeps the prompt builder
safe to call with any string without taking down a request.
"""

from typing import Dict, List, Optional, Tuple

from .hog import HOG_PACK
from .pack import OverlayFallbackReason, SpeciesPromptPack
from .turkey import TURKEY_PACK
from .whitetail import WHITETAIL_PACK

# First-class packs, ordered — stable order helps with test assertions.
_PACKS: Tuple[SpeciesPromptPack, ...] = (
    WHITETAIL_PACK,
    TURKEY_PACK,
    HOG_PACK,
)


GENERIC_FALLBACK_PACK = SpeciesPromptPack(
    canonical_id="_generic_fallback",
    display_name="Unspecified Game Species",
    aliases=(),
    behavior_rules=(
        "Assume a cautious generic game-mammal / game-bird frame: movement concentrates along terrain and cover transitions, near food, water, and security cover.",
        "Do not assert species-specific behaviors you cannot ground in the imagery.",
    ),
    tactical_guidance=(
        "Favor setups on natural travel corridors (edges, saddles, crossings) with realistic approach routes.",
        "Set downwind of expected travel when wind is known; otherwise flag wind as an assumption.",
        "Keep recommendations conservative; avoid deer-specific, turkey-specific, or hog-specific tactical framing.",
    ),
    movement_assumptions=(
        "Assume dawn and dusk transitions as generic activity windows absent species information.",
        "Treat mid-day activity as low probability without direct supporting evidence.",
    ),
    caution_rules=(
        "Do NOT guess species-specific behavior, sign, or seasonal modifiers.",
        "Lower overall confidence when species is unknown or unsupported.",
        "Populate confidence_summary.main_limitations with an explicit 'unsupported species' note.",
    ),
    species_tips_guidance=(
        "Keep species_tips generic and terrain-driven.",
        "Do not invent species-specific biology that you cannot attribute.",
    ),
    is_fallback=True,
    fallback_reason=OverlayFallbackReason.UNKNOWN_SPECIES,
)


# ------------------------- Normalization -------------------------

_STRIP_SUFFIXES = ("s",)  # crude singularize ("hogs" -> "hog")


def _norm(s: str) -> str:
    if not s:
        return ""
    s = s.strip().lower()
    # Collapse internal whitespace and normalize some punctuation.
    s = " ".join(s.replace("-", " ").replace("_", " ").replace("'", "").split())
    return s


def _build_alias_index() -> Dict[str, SpeciesPromptPack]:
    """Precompute normalized-alias → pack lookup. Constant-time resolve."""
    idx: Dict[str, SpeciesPromptPack] = {}
    for pack in _PACKS:
        for key in (pack.canonical_id, pack.display_name, *pack.aliases):
            nk = _norm(key)
            if nk and nk not in idx:
                idx[nk] = pack
    return idx


_ALIAS_INDEX: Dict[str, SpeciesPromptPack] = _build_alias_index()


# ------------------------- Public API -------------------------

def resolve_species_pack(species: Optional[str]) -> SpeciesPromptPack:
    """Return the pack for a species string, or the generic fallback.

    Never raises. Always returns a usable `SpeciesPromptPack`.
    """
    if species is None:
        return GENERIC_FALLBACK_PACK
    key = _norm(species)
    if not key:
        return GENERIC_FALLBACK_PACK

    # Exact/alias hit.
    pack = _ALIAS_INDEX.get(key)
    if pack:
        return pack

    # Fallback: try naive singularize ("hogs" -> "hog").
    for suf in _STRIP_SUFFIXES:
        if key.endswith(suf) and len(key) > len(suf) + 1:
            pack = _ALIAS_INDEX.get(key[: -len(suf)])
            if pack:
                return pack

    return GENERIC_FALLBACK_PACK


def get_all_canonical_species() -> List[Dict[str, str]]:
    """Inventory of first-class species packs for introspection / APIs."""
    return [
        {
            "canonical_id": p.canonical_id,
            "display_name": p.display_name,
            "aliases": list(p.aliases),
        }
        for p in _PACKS
    ]


def is_supported_species(species: Optional[str]) -> bool:
    """True when the input resolves to a first-class pack (not the fallback)."""
    return resolve_species_pack(species).is_fallback is False
