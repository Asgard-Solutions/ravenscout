"""Raven Scout Species Registry — single source of truth.

Every species-aware feature (tier gating, prompt pack resolution,
terminology, category grouping, UI card rendering, future hunt-form
field config) reads from this module.

To add a new species:
    1. Create a prompt pack in ``species_prompts/<name>.py`` exporting
       a ``SpeciesPromptPack`` with a matching ``canonical_id``.
    2. Register it in ``species_prompts/registry.py`` ``_PACKS`` tuple.
    3. Add a ``SpeciesConfig`` entry below with tier / category / icon
       / terminology / optional field flags.
    4. Set ``enabled=True`` to expose it in the UI.

See ``species_prompts/ADDING_A_SPECIES.md`` for the full playbook.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------
# Categories — used for UI grouping and future filtering.
# ---------------------------------------------------------------------

CATEGORY_BIG_GAME = "big_game"
CATEGORY_PREDATOR = "predator"
CATEGORY_BIRD = "bird"

CATEGORY_LABELS: Dict[str, str] = {
    CATEGORY_BIG_GAME: "Big Game",
    CATEGORY_PREDATOR: "Predator",
    CATEGORY_BIRD: "Bird / Wingshooting",
}

# Stable display order of categories — controls the grouping in the
# species selection UI.
CATEGORY_ORDER: Tuple[str, ...] = (CATEGORY_BIG_GAME, CATEGORY_PREDATOR, CATEGORY_BIRD)


# ---------------------------------------------------------------------
# Tier gating
# ---------------------------------------------------------------------
# The tier-tree is TRIAL < CORE < PRO. Anything at or above
# ``min_tier`` is unlocked. Trial users only get the three "classic"
# species; everything else nudges them toward upgrading.

TIER_ORDER: Tuple[str, ...] = ("trial", "core", "pro")


def _tier_rank(tier: str) -> int:
    try:
        return TIER_ORDER.index(tier.lower())
    except ValueError:
        return 0  # unknown -> lowest privileges


# ---------------------------------------------------------------------
# Terminology — species-appropriate vocabulary for male / female / young
# / group terms. Each field is optional; falling back is handled by
# ``get_species_term``.
# ---------------------------------------------------------------------


@dataclass(frozen=True)
class Terminology:
    male: str = "male"
    female: str = "female"
    young: str = "young"
    group: str = "group"


# ---------------------------------------------------------------------
# Optional hunt-form field flags — stubbed for later wiring.
# Each species can opt into (or out of) specific capture fields without
# the form having to branch on species IDs.
# ---------------------------------------------------------------------


@dataclass(frozen=True)
class SpeciesFormFields:
    """Which species-specific capture fields the hunt form should show.

    Keep these as ADDITIVE hints — the form renders base fields
    always and layers these on when ``True``. Nothing here gates
    existing fields.
    """
    group_size: bool = False
    vocalization_activity: bool = False
    calling_activity: bool = False
    aggression_indicators: bool = False
    travel_pattern: bool = False
    sign_observed: bool = False
    season_phase_hint: bool = False


# ---------------------------------------------------------------------
# Species config
# ---------------------------------------------------------------------


@dataclass(frozen=True)
class SpeciesConfig:
    """One species worth of configuration.

    Only the prompt-pack reference is tightly coupled to another
    module (``species_prompts``). Everything else is self-contained
    so the frontend can consume the same shape verbatim.
    """

    id: str                            # stable canonical id (matches prompt-pack canonical_id)
    name: str                          # human display name
    short_description: str             # one-line UI card subtitle
    category: str                      # one of CATEGORY_*
    min_tier: str                      # "trial" / "core" / "pro"
    icon: str                          # Ionicons glyph name used by the frontend
    prompt_pack_id: str                # canonical_id of the associated prompt pack
    terminology: Terminology = field(default_factory=Terminology)
    form_fields: SpeciesFormFields = field(default_factory=SpeciesFormFields)
    enabled: bool = True               # toggle to hide from every surface


# ---------------------------------------------------------------------
# The registry.
# ---------------------------------------------------------------------
# Order here controls the default display order WITHIN each category.

SPECIES_REGISTRY: Tuple[SpeciesConfig, ...] = (
    # ---- Big Game ------------------------------------------------------
    SpeciesConfig(
        id="deer",
        name="Whitetail Deer",
        short_description="Bedding-to-feeding transitions. Funnels, saddles & edges.",
        category=CATEGORY_BIG_GAME,
        min_tier="trial",
        icon="leaf",
        prompt_pack_id="whitetail",
        terminology=Terminology(male="buck", female="doe", young="fawn", group="group"),
        form_fields=SpeciesFormFields(sign_observed=True, season_phase_hint=True),
    ),
    SpeciesConfig(
        id="elk",
        name="Elk",
        short_description="Thermals, timber benches & drainage-scale travel.",
        category=CATEGORY_BIG_GAME,
        min_tier="core",
        icon="trail-sign",
        prompt_pack_id="elk",
        terminology=Terminology(male="bull", female="cow", young="calf", group="herd"),
        form_fields=SpeciesFormFields(
            calling_activity=True, vocalization_activity=True,
            travel_pattern=True, sign_observed=True, season_phase_hint=True,
        ),
    ),
    SpeciesConfig(
        id="bear",
        name="Black Bear",
        short_description="Food-phase driven. Concentrated mast, berry & ag targets.",
        category=CATEGORY_BIG_GAME,
        min_tier="core",
        icon="paw",
        prompt_pack_id="bear",
        terminology=Terminology(male="boar", female="sow", young="cub", group="solitary"),
        form_fields=SpeciesFormFields(sign_observed=True, season_phase_hint=True),
    ),
    SpeciesConfig(
        id="moose",
        name="Moose",
        short_description="Pond & willow-bottom dependent. Slow, tight, water-centric.",
        category=CATEGORY_BIG_GAME,
        min_tier="core",
        icon="water",
        prompt_pack_id="moose",
        terminology=Terminology(male="bull", female="cow", young="calf", group="solitary"),
        form_fields=SpeciesFormFields(
            calling_activity=True, vocalization_activity=True, sign_observed=True, season_phase_hint=True,
        ),
    ),
    SpeciesConfig(
        id="antelope",
        name="Pronghorn Antelope",
        short_description="Open-country eyesight. Water holes & fence-crossing funnels.",
        category=CATEGORY_BIG_GAME,
        min_tier="core",
        icon="speedometer",
        prompt_pack_id="antelope",
        terminology=Terminology(male="buck", female="doe", young="fawn", group="herd"),
        form_fields=SpeciesFormFields(
            group_size=True, travel_pattern=True, sign_observed=True, season_phase_hint=True,
        ),
    ),
    SpeciesConfig(
        id="hog",
        name="Wild Hog",
        short_description="Water, thick cover & trails. Dusk/dawn ambush.",
        category=CATEGORY_BIG_GAME,
        min_tier="trial",
        icon="nutrition",
        prompt_pack_id="hog",
        terminology=Terminology(male="boar", female="sow", young="piglet", group="sounder"),
        form_fields=SpeciesFormFields(
            group_size=True, sign_observed=True, season_phase_hint=True,
        ),
    ),
    # ---- Predator ------------------------------------------------------
    SpeciesConfig(
        id="coyote",
        name="Coyote",
        short_description="Pair-bonded predator. Calling, downwind intercepts & wind discipline.",
        category=CATEGORY_PREDATOR,
        min_tier="core",
        icon="radio",
        prompt_pack_id="coyote",
        # Coyotes don't have a widely-used gendered hunting vocabulary —
        # leave terminology neutral unless / until we localize per-region.
        terminology=Terminology(male="male", female="female", young="pup", group="pair"),
        form_fields=SpeciesFormFields(
            calling_activity=True, vocalization_activity=True,
            aggression_indicators=True, travel_pattern=True, sign_observed=True,
            season_phase_hint=True,
        ),
    ),
    # ---- Bird / Wingshooting ------------------------------------------
    SpeciesConfig(
        id="turkey",
        name="Wild Turkey",
        short_description="Roost-to-strut zones. Morning open-ground setups.",
        category=CATEGORY_BIRD,
        min_tier="trial",
        icon="sunny",
        prompt_pack_id="turkey",
        terminology=Terminology(male="tom", female="hen", young="poult", group="flock"),
        form_fields=SpeciesFormFields(
            calling_activity=True, vocalization_activity=True, sign_observed=True, season_phase_hint=True,
        ),
    ),
    # ---- Future bird species (architecture-ready, UI-hidden) ----------
    SpeciesConfig(
        id="waterfowl",
        name="Waterfowl",
        short_description="(Coming soon.)",
        category=CATEGORY_BIRD,
        min_tier="pro",
        icon="boat",
        prompt_pack_id="waterfowl",  # pack file created when enabling
        terminology=Terminology(male="drake", female="hen", young="duckling", group="flock"),
        enabled=False,
    ),
    SpeciesConfig(
        id="dove",
        name="Dove",
        short_description="(Coming soon.)",
        category=CATEGORY_BIRD,
        min_tier="pro",
        icon="send",
        prompt_pack_id="dove",
        terminology=Terminology(young="chick", group="flight"),
        enabled=False,
    ),
    SpeciesConfig(
        id="quail",
        name="Quail",
        short_description="(Coming soon.)",
        category=CATEGORY_BIRD,
        min_tier="pro",
        icon="flower",
        prompt_pack_id="quail",
        terminology=Terminology(group="covey"),
        enabled=False,
    ),
)


# Precomputed index for O(1) lookup.
_SPECIES_BY_ID: Dict[str, SpeciesConfig] = {s.id: s for s in SPECIES_REGISTRY}


# ---------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------


def get_species_by_id(species_id: Optional[str]) -> Optional[SpeciesConfig]:
    """Exact-match lookup, None if unknown or disabled-in-registry."""
    if not species_id:
        return None
    return _SPECIES_BY_ID.get(species_id.strip().lower())


def list_species(
    *,
    include_disabled: bool = False,
    user_tier: Optional[str] = None,
    only_unlocked: bool = False,
) -> List[SpeciesConfig]:
    """List species for an API response or the UI.

    Args:
        include_disabled:  Include species with ``enabled=False`` (future
                           species marked "coming soon"). Default False
                           because most callers are the UI.
        user_tier:         Trial / core / pro. Annotates locked vs.
                           unlocked via ``only_unlocked`` OR is simply
                           ignored if both filter flags are False.
        only_unlocked:     If True and ``user_tier`` is set, filter OUT
                           species the user can't currently use.
    """
    out: List[SpeciesConfig] = []
    user_rank = _tier_rank(user_tier) if user_tier else None
    for s in SPECIES_REGISTRY:
        if not include_disabled and not s.enabled:
            continue
        if only_unlocked and user_rank is not None:
            if _tier_rank(s.min_tier) > user_rank:
                continue
        out.append(s)
    return out


def is_species_unlocked(species_id: str, user_tier: str) -> bool:
    """True if the species is enabled AND the user's tier meets
    ``min_tier``. Disabled species are always False."""
    s = get_species_by_id(species_id)
    if not s or not s.enabled:
        return False
    return _tier_rank(user_tier) >= _tier_rank(s.min_tier)


def get_species_term(species_id: str, which: str) -> str:
    """Resolve a species-specific term ("male" / "female" / "young" /
    "group"). Always returns a usable string — falls back to the generic
    ``Terminology`` default if the species isn't registered.
    """
    default = Terminology()
    s = get_species_by_id(species_id)
    term_obj = s.terminology if s else default
    return getattr(term_obj, which, None) or getattr(default, which, which)


def get_categories() -> List[Dict[str, str]]:
    """Return an ordered list of categories used for UI grouping."""
    return [{"id": cid, "label": CATEGORY_LABELS[cid]} for cid in CATEGORY_ORDER]


def to_api_dict(s: SpeciesConfig, *, locked: bool = False) -> Dict[str, object]:
    """Serialize a SpeciesConfig for the frontend. Include a `locked`
    flag so the UI can render the upgrade CTA without recomputing."""
    return {
        "id": s.id,
        "name": s.name,
        "description": s.short_description,
        "category": s.category,
        "category_label": CATEGORY_LABELS.get(s.category, s.category),
        "min_tier": s.min_tier,
        "icon": s.icon,
        "enabled": s.enabled,
        "locked": locked,
        "terminology": {
            "male": s.terminology.male,
            "female": s.terminology.female,
            "young": s.terminology.young,
            "group": s.terminology.group,
        },
        "form_fields": {
            "group_size": s.form_fields.group_size,
            "vocalization_activity": s.form_fields.vocalization_activity,
            "calling_activity": s.form_fields.calling_activity,
            "aggression_indicators": s.form_fields.aggression_indicators,
            "travel_pattern": s.form_fields.travel_pattern,
            "sign_observed": s.form_fields.sign_observed,
            "season_phase_hint": s.form_fields.season_phase_hint,
        },
    }


# ---------------------------------------------------------------------
# Compatibility layer for the legacy ``SPECIES_DATA`` dict in server.py
# ---------------------------------------------------------------------
# The AI analysis path historically read ``SPECIES_DATA[animal]`` to
# get {name, icon, description, behavior_rules}. Rather than refactor
# every caller, we expose a dict-like adapter that derives the same
# shape from the registry + prompt packs. ``behavior_rules`` is pulled
# straight from the species' prompt pack so it's always in sync.


def legacy_species_data() -> Dict[str, Dict[str, object]]:
    """Shim: returns a SPECIES_DATA-shaped dict for legacy callers.

    Only includes species that have a resolvable prompt pack; disabled
    species with no pack fall back to whatever the prompt registry
    returns (generic fallback), which is safe.
    """
    # Imported lazily to avoid a circular import at module load.
    from species_prompts import resolve_species_pack

    result: Dict[str, Dict[str, object]] = {}
    for s in SPECIES_REGISTRY:
        if not s.enabled:
            continue
        pack = resolve_species_pack(s.prompt_pack_id)
        result[s.id] = {
            "name": s.name,
            "icon": s.icon,
            "description": s.short_description,
            "behavior_rules": list(pack.behavior_rules),
            "min_tier": s.min_tier,
            "category": s.category,
        }
    return result
