"""Enhanced species prompt rollout configuration.

Centralized, allowlist-based control plane for the optional enhanced
prompt framework that lives under `species_prompts.enhanced/`. The
goal is a SAFE, granular Pro-tier rollout where:

  * a single env-driven kill switch instantly disables the entire
    feature (`ENHANCED_ROLLOUT_KILL_SWITCH=off`),
  * per-tier module enablement is declarative,
  * unsupported species / regions transparently fall back to the
    legacy prompt path with no behavioral change,
  * the helper NEVER raises on bad inputs — it always returns a
    legacy-safe decision.

Public surface:
  * `EnhancedRolloutConfig` — dataclass holding the whole control plane
  * `DEFAULT_CONFIG` — the production rollout posture (Pro-only full
    stack, Core behaviour-only, whitetail-only, midwest_agricultural-only)
  * `RolloutDecision` — the structured outcome of an evaluation
  * `evaluate_enhanced_rollout(...)` — full decision (preferred for
    callers that also want analytics metadata)
  * `resolve_enhanced_prompt_flags(...)` — returns the dict of kwargs
    you can splat into `assemble_system_prompt(**kwargs)`. Provided
    for callers that don't need the audit metadata.

To disable the rollout instantly in production set the env var:

    ENHANCED_ROLLOUT_KILL_SWITCH=off

Any value other than the literal strings ``on`` / ``true`` / ``1`` /
``yes`` is treated as OFF. The default if the variable is unset is
ON (i.e. the in-code config decides).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, FrozenSet, Mapping, Optional, Tuple


# ----------------------------------------------------------------------
# Constants — keep small and explicit. Add new ones here, never inline.
# ----------------------------------------------------------------------

ENHANCED_MODULE_BEHAVIOR = "behavior"
ENHANCED_MODULE_ACCESS = "access"
ENHANCED_MODULE_REGIONAL = "regional"
ENHANCED_MODULES: Tuple[str, ...] = (
    ENHANCED_MODULE_BEHAVIOR,
    ENHANCED_MODULE_ACCESS,
    ENHANCED_MODULE_REGIONAL,
)

# Reasons surfaced in `RolloutDecision.reason` and structured logs.
# Keep values stable — downstream dashboards / alerting will key on them.
REASON_OK = "ok"
REASON_KILL_SWITCH = "kill_switch_off"
REASON_GLOBAL_DISABLED = "global_disabled"
REASON_TIER_NOT_ELIGIBLE = "tier_not_eligible"
REASON_TIER_HAS_NO_MODULES = "tier_has_no_modules"
REASON_SPECIES_NOT_ALLOWLISTED = "species_not_allowlisted"
REASON_REGION_NOT_ALLOWLISTED = "region_not_allowlisted"
REASON_BAD_INPUT = "bad_input"


# ----------------------------------------------------------------------
# Config dataclasses
# ----------------------------------------------------------------------

@dataclass(frozen=True)
class EnhancedRolloutConfig:
    """Declarative rollout configuration.

    All sets are stored as `frozenset` so the dataclass stays hashable
    and immutable. Use the `with_overrides()` factory below for tests.

    Attributes:
        global_enabled:
            Master in-code flag. If False, the rollout is disabled even
            when the env kill switch is "on".
        allowed_tiers:
            Subscription tiers that are eligible for any enhanced
            module. Tiers absent from this set are forced to legacy.
        modules_per_tier:
            For each eligible tier, the set of enhanced modules that
            tier is allowed to use. Subsets of `ENHANCED_MODULES`.
        species_allowlist:
            Allowlist keyed by `prompt_pack_id` (e.g. "whitetail",
            "turkey"). Use `{"*"}` to allow all species.
        region_allowlist:
            Allowlist keyed by canonical region id from
            `species_prompts.regions` (e.g. "midwest_agricultural").
            Use `{"*"}` to allow all regions; an empty set ALSO
            allows all regions for callers that don't supply a
            region_id (legacy behavior preserved).
    """

    global_enabled: bool = True
    allowed_tiers: FrozenSet[str] = frozenset({"core", "pro"})
    modules_per_tier: Mapping[str, FrozenSet[str]] = field(
        default_factory=lambda: {
            "free": frozenset(),
            "trial": frozenset(),
            "core": frozenset({ENHANCED_MODULE_BEHAVIOR}),
            "pro": frozenset(ENHANCED_MODULES),
        }
    )
    species_allowlist: FrozenSet[str] = frozenset({"whitetail"})
    region_allowlist: FrozenSet[str] = frozenset({"midwest_agricultural"})

    # ------------------------------------------------------------------
    def modules_for_tier(self, tier: str) -> FrozenSet[str]:
        return frozenset(self.modules_per_tier.get((tier or "").strip().lower(), frozenset()))

    def species_allowed(self, prompt_pack_id: Optional[str]) -> bool:
        if not prompt_pack_id:
            return False
        if "*" in self.species_allowlist:
            return True
        return prompt_pack_id.strip().lower() in self.species_allowlist

    def region_allowed(self, region_id: Optional[str]) -> bool:
        # Empty allowlist defensively means "no enhanced regional";
        # callers with no region_id also short-circuit here.
        if not self.region_allowlist:
            return False
        if "*" in self.region_allowlist:
            return True
        if not region_id:
            return False
        return region_id.strip().lower() in self.region_allowlist


# Production posture per the spec.
DEFAULT_CONFIG = EnhancedRolloutConfig()


# ----------------------------------------------------------------------
# Decision result
# ----------------------------------------------------------------------

@dataclass(frozen=True)
class RolloutDecision:
    """Structured outcome of evaluating the rollout for one request.

    Attributes:
        enabled:
            True if AT LEAST ONE enhanced module is enabled.
        modules:
            Tuple of module identifiers that are active for this
            request (subset of `ENHANCED_MODULES`).
        reason:
            One of the `REASON_*` constants. When `enabled=False`,
            this explains why we fell back; when `enabled=True`,
            this is `REASON_OK`.
        kwargs:
            Dict you can splat directly into
            `assemble_system_prompt(**kwargs)`. Contains the
            `use_enhanced_*` flags plus any `enhanced_*` context
            kwargs (region id, species pack id, etc.) the prompt
            builder consumes.
        tier_evaluated / species_evaluated / region_evaluated:
            The normalized inputs we made the decision on. Useful for
            logging / dashboards. NEVER includes raw user data.
    """

    enabled: bool
    modules: Tuple[str, ...]
    reason: str
    kwargs: Dict[str, Any]
    tier_evaluated: str
    species_evaluated: str
    region_evaluated: Optional[str]
    species_pack_id: Optional[str] = None

    def to_log_dict(self) -> Dict[str, Any]:
        """Produce the structured-log payload for analytics. Never
        contains image data, tokens, coordinates, or raw prompts."""
        return {
            "enhanced_rollout_evaluated": True,
            "enhanced_enabled": self.enabled,
            "enhanced_modules_enabled": list(self.modules),
            "user_subscription_tier": self.tier_evaluated,
            "species": self.species_evaluated,
            "species_pack_id": self.species_pack_id,
            "region_id": self.region_evaluated,
            "fallback_reason": None if self.enabled else self.reason,
            "ok_reason": self.reason if self.enabled else None,
        }

    def to_response_meta(self) -> Dict[str, Any]:
        """Produce the safe response metadata (subset of log dict)."""
        return {
            "enhanced_analysis_enabled": self.enabled,
            "enhanced_modules_used": list(self.modules),
            "enhanced_rollout_reason": self.reason,
        }


# ----------------------------------------------------------------------
# Internal helpers
# ----------------------------------------------------------------------

_LEGACY_KWARGS: Dict[str, Any] = {
    "use_enhanced_behavior": False,
    "use_enhanced_access": False,
    "use_enhanced_regional": False,
}


def _legacy_decision(
    *,
    reason: str,
    tier: str,
    species: str,
    region: Optional[str],
    species_pack_id: Optional[str] = None,
) -> RolloutDecision:
    return RolloutDecision(
        enabled=False,
        modules=(),
        reason=reason,
        kwargs=dict(_LEGACY_KWARGS),
        tier_evaluated=tier,
        species_evaluated=species,
        region_evaluated=region,
        species_pack_id=species_pack_id,
    )


def _kill_switch_active() -> bool:
    """Return True when the env kill switch is set to a falsy value.

    The switch is *opt-out* by default. Only the strings
    ``off`` / ``false`` / ``0`` / ``no`` (case-insensitive) actively
    disable the rollout. An unset variable is treated as ON.
    """
    raw = os.environ.get("ENHANCED_ROLLOUT_KILL_SWITCH")
    if raw is None:
        return False
    return raw.strip().lower() in ("off", "false", "0", "no", "disabled")


def _resolve_pack_id(species_id: Optional[str]) -> Optional[str]:
    """Map a request `species_id` (e.g. "deer") to its `prompt_pack_id`
    (e.g. "whitetail"). Tolerates missing species_registry imports —
    falls back to the species_id itself so callers that pass pack ids
    directly continue to work.
    """
    if not species_id:
        return None
    species_id = species_id.strip().lower()
    try:
        from species_registry import get_species_by_id  # local import — avoid hard dep on import order
        cfg = get_species_by_id(species_id)
        if cfg is not None and getattr(cfg, "prompt_pack_id", None):
            return cfg.prompt_pack_id.strip().lower()
    except Exception:  # noqa: BLE001
        pass
    return species_id


# Bridge between the legacy region taxonomy used by the GPS resolver
# (`species_prompts.regions`) and the enhanced regional registry keys
# (`species_prompts.enhanced.regional_modifiers`). The legacy resolver
# returns coarse buckets like `"midwest"`; the enhanced overlays are
# more specific (e.g. `"midwest_agricultural"`). Mapping here lets the
# allowlist stay in enhanced-id space without forcing every caller
# to translate.
_LEGACY_TO_ENHANCED_REGION: Dict[str, str] = {
    "midwest": "midwest_agricultural",
    "mountain_west": "colorado_high_country",
    "south_texas": "south_texas",
    "pacific_northwest": "pacific_northwest",
    # Identity passes (lets callers feed enhanced ids directly).
    "midwest_agricultural": "midwest_agricultural",
    "colorado_high_country": "colorado_high_country",
}


def _normalize_region_id(region_id: Optional[str]) -> Optional[str]:
    """Translate a legacy GPS-resolver region id to its enhanced-registry
    counterpart. Returns the input unchanged if no mapping is registered
    so callers using new enhanced ids work transparently."""
    if not region_id:
        return None
    rid = region_id.strip().lower()
    if not rid:
        return None
    return _LEGACY_TO_ENHANCED_REGION.get(rid, rid)


# ----------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------

def evaluate_enhanced_rollout(
    user_subscription_tier: Optional[str],
    species: Optional[str],
    region_id: Optional[str],
    hunt_context: Optional[Mapping[str, Any]] = None,
    *,
    config: EnhancedRolloutConfig = DEFAULT_CONFIG,
) -> RolloutDecision:
    """Evaluate the rollout for one request and return a structured
    `RolloutDecision`. Always safe — never raises. If anything goes
    wrong while reading inputs, returns a legacy-safe decision with
    `reason=REASON_BAD_INPUT`.

    `hunt_context` may include keys that the prompt builder consumes
    when enhanced modules are enabled, such as
    `pressure_level` (`PressureLevel` or string), `terrain`
    (`TerrainType` or string), `terrain_features` (list of dicts),
    and `behavior_pattern_types` (tuple/list of strings). All are
    optional — sensible defaults flow through.
    """
    try:
        tier_norm = (user_subscription_tier or "").strip().lower() or "unknown"
        species_norm = (species or "").strip().lower() or "unknown"
        # Translate the legacy GPS-resolver region id (e.g. "midwest")
        # into its enhanced-registry counterpart (e.g.
        # "midwest_agricultural") BEFORE the allowlist check, so callers
        # don't have to know which taxonomy they're in.
        region_norm = _normalize_region_id(region_id)
        species_pack_id = _resolve_pack_id(species_norm) if species_norm != "unknown" else None
    except Exception:  # noqa: BLE001
        return _legacy_decision(
            reason=REASON_BAD_INPUT,
            tier="unknown",
            species="unknown",
            region=None,
        )

    if _kill_switch_active():
        return _legacy_decision(
            reason=REASON_KILL_SWITCH,
            tier=tier_norm,
            species=species_norm,
            region=region_norm,
            species_pack_id=species_pack_id,
        )

    if not config.global_enabled:
        return _legacy_decision(
            reason=REASON_GLOBAL_DISABLED,
            tier=tier_norm,
            species=species_norm,
            region=region_norm,
            species_pack_id=species_pack_id,
        )

    if tier_norm not in config.allowed_tiers:
        return _legacy_decision(
            reason=REASON_TIER_NOT_ELIGIBLE,
            tier=tier_norm,
            species=species_norm,
            region=region_norm,
            species_pack_id=species_pack_id,
        )

    tier_modules = config.modules_for_tier(tier_norm)
    if not tier_modules:
        return _legacy_decision(
            reason=REASON_TIER_HAS_NO_MODULES,
            tier=tier_norm,
            species=species_norm,
            region=region_norm,
            species_pack_id=species_pack_id,
        )

    if not config.species_allowed(species_pack_id):
        return _legacy_decision(
            reason=REASON_SPECIES_NOT_ALLOWLISTED,
            tier=tier_norm,
            species=species_norm,
            region=region_norm,
            species_pack_id=species_pack_id,
        )

    if not config.region_allowed(region_norm):
        return _legacy_decision(
            reason=REASON_REGION_NOT_ALLOWLISTED,
            tier=tier_norm,
            species=species_norm,
            region=region_norm,
            species_pack_id=species_pack_id,
        )

    # ---- Eligible: assemble flags + context kwargs --------------------
    use_behavior = ENHANCED_MODULE_BEHAVIOR in tier_modules
    use_access = ENHANCED_MODULE_ACCESS in tier_modules
    use_regional = ENHANCED_MODULE_REGIONAL in tier_modules

    kwargs: Dict[str, Any] = {
        "use_enhanced_behavior": use_behavior,
        "use_enhanced_access": use_access,
        "use_enhanced_regional": use_regional,
    }
    if region_norm:
        kwargs["enhanced_region_id"] = region_norm

    hunt_context = hunt_context or {}
    if "pressure_level" in hunt_context:
        kwargs["enhanced_pressure_level"] = hunt_context["pressure_level"]
    if "terrain" in hunt_context:
        kwargs["enhanced_terrain"] = hunt_context["terrain"]
    if "terrain_features" in hunt_context:
        kwargs["enhanced_terrain_features"] = list(hunt_context["terrain_features"] or [])
    if "behavior_pattern_types" in hunt_context:
        kwargs["enhanced_behavior_pattern_types"] = tuple(
            hunt_context["behavior_pattern_types"] or ()
        )

    # Tell the prompt builder which species pack to use for the
    # enhanced behavior registry lookup. This is critical because the
    # request `animal` (e.g. "deer") differs from the pack id
    # (e.g. "whitetail") that the registry is keyed on.
    if species_pack_id:
        kwargs["enhanced_species_id"] = species_pack_id

    modules = tuple(m for m in ENHANCED_MODULES if m in tier_modules)
    return RolloutDecision(
        enabled=True,
        modules=modules,
        reason=REASON_OK,
        kwargs=kwargs,
        tier_evaluated=tier_norm,
        species_evaluated=species_norm,
        region_evaluated=region_norm,
        species_pack_id=species_pack_id,
    )


def resolve_enhanced_prompt_flags(
    user_subscription_tier: Optional[str],
    species: Optional[str],
    region_id: Optional[str],
    hunt_context: Optional[Mapping[str, Any]] = None,
    *,
    config: EnhancedRolloutConfig = DEFAULT_CONFIG,
) -> Dict[str, Any]:
    """Return only the kwargs dict for `assemble_system_prompt(**kwargs)`.

    Convenience wrapper around `evaluate_enhanced_rollout` for callers
    that don't care about the analytics metadata.
    """
    return evaluate_enhanced_rollout(
        user_subscription_tier=user_subscription_tier,
        species=species,
        region_id=region_id,
        hunt_context=hunt_context,
        config=config,
    ).kwargs
