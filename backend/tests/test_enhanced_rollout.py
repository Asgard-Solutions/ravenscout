"""Tests for the enhanced species prompt rollout layer.

Covers the spec's eight required cases plus a handful of edge cases:
  * Free / unknown / empty tier → all enhanced flags false
  * Kill switch off → all enhanced flags false (regardless of inputs)
  * Pro + whitetail (via deer→whitetail mapping) + midwest_agricultural
    → all enhanced flags true, all three modules engaged
  * Core + whitetail + midwest_agricultural → behavior only
  * Pro + turkey → species not allowlisted, fallback
  * Pro + whitetail + unsupported region → region not allowlisted, fallback
  * Missing species / region / tier → never throws, returns legacy-safe
  * `resolve_enhanced_prompt_flags` returns the splat-able kwargs dict
  * `RolloutDecision.to_log_dict` and `to_response_meta` return safe shapes
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `import enhanced_rollout` when pytest is invoked from /app.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from enhanced_rollout import (
    DEFAULT_CONFIG,
    EnhancedRolloutConfig,
    REASON_BAD_INPUT,
    REASON_KILL_SWITCH,
    REASON_OK,
    REASON_REGION_NOT_ALLOWLISTED,
    REASON_SPECIES_NOT_ALLOWLISTED,
    REASON_TIER_HAS_NO_MODULES,
    REASON_TIER_NOT_ELIGIBLE,
    RolloutDecision,
    evaluate_enhanced_rollout,
    resolve_enhanced_prompt_flags,
)


# ----------------------------------------------------------------------
# Spec cases
# ----------------------------------------------------------------------


def test_free_tier_returns_all_false():
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="free",
        species="deer",
        region_id="midwest_agricultural",
    )
    assert decision.enabled is False
    assert decision.modules == ()
    # `free` is NOT in DEFAULT_CONFIG.allowed_tiers → reason should be tier_not_eligible.
    assert decision.reason == REASON_TIER_NOT_ELIGIBLE
    assert decision.kwargs["use_enhanced_behavior"] is False
    assert decision.kwargs["use_enhanced_access"] is False
    assert decision.kwargs["use_enhanced_regional"] is False


def test_unknown_tier_returns_all_false():
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="enterprise_premium_plus_max",
        species="deer",
        region_id="midwest_agricultural",
    )
    assert decision.enabled is False
    assert decision.reason == REASON_TIER_NOT_ELIGIBLE
    assert decision.kwargs["use_enhanced_behavior"] is False


def test_empty_tier_returns_all_false():
    decision = evaluate_enhanced_rollout(
        user_subscription_tier=None,
        species="deer",
        region_id="midwest_agricultural",
    )
    assert decision.enabled is False
    assert decision.modules == ()


def test_kill_switch_off_overrides_everything(monkeypatch):
    monkeypatch.setenv("ENHANCED_ROLLOUT_KILL_SWITCH", "off")
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="deer",
        region_id="midwest_agricultural",
    )
    assert decision.enabled is False
    assert decision.reason == REASON_KILL_SWITCH
    assert decision.kwargs["use_enhanced_behavior"] is False


@pytest.mark.parametrize("kill_value", ["false", "0", "no", "DISABLED", "OFF"])
def test_kill_switch_falsy_values_all_disable(monkeypatch, kill_value):
    monkeypatch.setenv("ENHANCED_ROLLOUT_KILL_SWITCH", kill_value)
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="deer",
        region_id="midwest_agricultural",
    )
    assert decision.enabled is False
    assert decision.reason == REASON_KILL_SWITCH


@pytest.mark.parametrize("kill_value", ["on", "true", "1", "yes", ""])
def test_kill_switch_truthy_values_pass_through(monkeypatch, kill_value):
    monkeypatch.setenv("ENHANCED_ROLLOUT_KILL_SWITCH", kill_value)
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="deer",
        region_id="midwest_agricultural",
    )
    assert decision.enabled is True
    assert decision.reason == REASON_OK


def test_pro_whitetail_midwest_enables_all_modules(monkeypatch):
    monkeypatch.delenv("ENHANCED_ROLLOUT_KILL_SWITCH", raising=False)
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="deer",                      # request id
        region_id="midwest_agricultural",
    )
    assert decision.enabled is True
    assert decision.reason == REASON_OK
    assert set(decision.modules) == {"behavior", "access", "regional"}
    assert decision.kwargs["use_enhanced_behavior"] is True
    assert decision.kwargs["use_enhanced_access"] is True
    assert decision.kwargs["use_enhanced_regional"] is True
    assert decision.kwargs["enhanced_region_id"] == "midwest_agricultural"
    # Species mapping: deer → whitetail
    assert decision.kwargs["enhanced_species_id"] == "whitetail"
    assert decision.species_pack_id == "whitetail"


def test_core_whitetail_midwest_enables_behavior_only(monkeypatch):
    monkeypatch.delenv("ENHANCED_ROLLOUT_KILL_SWITCH", raising=False)
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="core",
        species="deer",
        region_id="midwest_agricultural",
    )
    assert decision.enabled is True
    assert decision.modules == ("behavior",)
    assert decision.kwargs["use_enhanced_behavior"] is True
    assert decision.kwargs["use_enhanced_access"] is False
    assert decision.kwargs["use_enhanced_regional"] is False


def test_pro_turkey_falls_back_to_legacy(monkeypatch):
    monkeypatch.delenv("ENHANCED_ROLLOUT_KILL_SWITCH", raising=False)
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="turkey",
        region_id="midwest_agricultural",
    )
    assert decision.enabled is False
    assert decision.reason == REASON_SPECIES_NOT_ALLOWLISTED
    assert decision.kwargs["use_enhanced_behavior"] is False


def test_pro_whitetail_unsupported_region_falls_back(monkeypatch):
    monkeypatch.delenv("ENHANCED_ROLLOUT_KILL_SWITCH", raising=False)
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="deer",
        region_id="south_texas",
    )
    assert decision.enabled is False
    assert decision.reason == REASON_REGION_NOT_ALLOWLISTED
    assert decision.kwargs["use_enhanced_behavior"] is False


def test_pro_whitetail_no_region_falls_back(monkeypatch):
    monkeypatch.delenv("ENHANCED_ROLLOUT_KILL_SWITCH", raising=False)
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="deer",
        region_id=None,
    )
    assert decision.enabled is False
    assert decision.reason == REASON_REGION_NOT_ALLOWLISTED


# ----------------------------------------------------------------------
# Robustness — must NEVER throw
# ----------------------------------------------------------------------


@pytest.mark.parametrize("species", [None, "", "   ", "definitely_not_a_species"])
def test_missing_or_unknown_species_never_throws(species):
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species=species,
        region_id="midwest_agricultural",
    )
    assert isinstance(decision, RolloutDecision)
    assert decision.enabled is False
    assert decision.kwargs["use_enhanced_behavior"] is False


@pytest.mark.parametrize("region", [None, "", "   ", "narnia"])
def test_missing_or_unknown_region_never_throws(region):
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="deer",
        region_id=region,
    )
    assert isinstance(decision, RolloutDecision)
    assert decision.enabled is False
    assert decision.kwargs["use_enhanced_behavior"] is False


def test_resolve_enhanced_prompt_flags_returns_kwargs_dict():
    kwargs = resolve_enhanced_prompt_flags(
        user_subscription_tier="pro",
        species="deer",
        region_id="midwest_agricultural",
    )
    assert isinstance(kwargs, dict)
    assert kwargs["use_enhanced_behavior"] is True
    # Must be valid splat into assemble_system_prompt — sanity-check no
    # forbidden keys leaked into the dict.
    for k in kwargs:
        assert k.startswith("use_enhanced_") or k.startswith("enhanced_"), k


def test_legacy_kwargs_are_byte_safe_for_assemble_system_prompt():
    """When the rollout returns legacy kwargs, splatting them into
    `assemble_system_prompt` must yield the SAME prompt as not passing
    any enhanced kwargs at all (backward compatibility contract).
    """
    from prompt_builder import assemble_system_prompt
    base = assemble_system_prompt(
        animal="deer",
        conditions={"hunt_date": "2026-11-15", "time_window": "morning"},
        image_count=1,
        tier="pro",
    )
    legacy_kwargs = resolve_enhanced_prompt_flags(
        user_subscription_tier="free",       # ineligible → legacy kwargs
        species="deer",
        region_id="midwest_agricultural",
    )
    via_rollout = assemble_system_prompt(
        animal="deer",
        conditions={"hunt_date": "2026-11-15", "time_window": "morning"},
        image_count=1,
        tier="pro",
        **legacy_kwargs,
    )
    assert via_rollout == base


def test_to_log_dict_is_safe_and_complete():
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="deer",
        region_id="midwest_agricultural",
    )
    log = decision.to_log_dict()
    assert log["enhanced_rollout_evaluated"] is True
    assert log["enhanced_enabled"] is True
    assert set(log["enhanced_modules_enabled"]) == {"behavior", "access", "regional"}
    assert log["user_subscription_tier"] == "pro"
    assert log["species"] == "deer"
    assert log["species_pack_id"] == "whitetail"
    assert log["region_id"] == "midwest_agricultural"
    assert log["fallback_reason"] is None
    # No sensitive fields
    forbidden = {"image", "images", "prompt", "token", "session", "latitude", "longitude", "coords"}
    for key in log.keys():
        assert key.lower() not in forbidden


def test_to_response_meta_subset_only():
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="deer",
        region_id="midwest_agricultural",
    )
    meta = decision.to_response_meta()
    assert set(meta.keys()) == {
        "enhanced_analysis_enabled",
        "enhanced_modules_used",
        "enhanced_rollout_reason",
    }


# ----------------------------------------------------------------------
# Custom config knobs
# ----------------------------------------------------------------------


def test_custom_config_can_open_species_allowlist():
    cfg = EnhancedRolloutConfig(
        species_allowlist=frozenset({"*"}),
        region_allowlist=frozenset({"midwest_agricultural"}),
    )
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="turkey",
        region_id="midwest_agricultural",
        config=cfg,
    )
    assert decision.enabled is True
    assert decision.species_pack_id == "turkey"


def test_global_disabled_overrides_otherwise_eligible():
    cfg = EnhancedRolloutConfig(global_enabled=False)
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="pro",
        species="deer",
        region_id="midwest_agricultural",
        config=cfg,
    )
    assert decision.enabled is False
    assert decision.reason == "global_disabled"


def test_tier_with_no_modules_falls_back():
    cfg = EnhancedRolloutConfig(
        modules_per_tier={"core": frozenset(), "pro": frozenset({"behavior"})},
        allowed_tiers=frozenset({"core", "pro"}),
    )
    decision = evaluate_enhanced_rollout(
        user_subscription_tier="core",
        species="deer",
        region_id="midwest_agricultural",
        config=cfg,
    )
    assert decision.enabled is False
    assert decision.reason == REASON_TIER_HAS_NO_MODULES
