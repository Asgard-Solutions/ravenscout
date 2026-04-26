"""
Locks in the shotgun-as-its-own-canonical-id contract on the backend.
Mirrors the frontend test in __tests__/huntStyles.flow.test.ts.

Without this regression guard, a future refactor of `_ALIAS_MAP`
could silently fold "shotgun" back into "rifle" (the original
behavior) and erase the species-pack distinction we just shipped.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from species_prompts.hunt_styles import (
    CANONICAL_HUNT_STYLES,
    normalize_hunt_style,
    resolve_hunt_style_modifier,
)
from species_prompts.whitetail import WHITETAIL_PACK
from species_prompts.turkey import TURKEY_PACK


# ----- canonical normalization --------------------------------------------


def test_shotgun_is_canonical():
    assert "shotgun" in CANONICAL_HUNT_STYLES
    assert CANONICAL_HUNT_STYLES["shotgun"] == "Shotgun"


def test_shotgun_aliases_resolve_to_shotgun():
    cases = [
        "shotgun",
        "Shotgun",
        "SHOTGUN",
        "shot gun",
        "slug gun",
        "slug",
        "scattergun",
        "smoothbore",
        "shotgun_",
    ]
    for v in cases:
        assert normalize_hunt_style(v) == "shotgun", (
            f"expected '{v}' -> shotgun, got {normalize_hunt_style(v)!r}"
        )


def test_rifle_aliases_stay_on_rifle():
    cases = ["rifle", "Rifle", "centerfire", "muzzleloader", "blackpowder", "black powder"]
    for v in cases:
        assert normalize_hunt_style(v) == "rifle", (
            f"expected '{v}' -> rifle, got {normalize_hunt_style(v)!r}"
        )


def test_archery_unaffected():
    cases = ["archery", "bow", "crossbow", "compound bow"]
    for v in cases:
        assert normalize_hunt_style(v) == "archery", (
            f"expected '{v}' -> archery, got {normalize_hunt_style(v)!r}"
        )


# ----- species-pack modifiers ---------------------------------------------


def test_whitetail_has_distinct_shotgun_modifier():
    rifle = resolve_hunt_style_modifier(WHITETAIL_PACK, "rifle")
    shotgun = resolve_hunt_style_modifier(WHITETAIL_PACK, "shotgun")
    assert rifle is not None
    assert shotgun is not None
    # Distinct objects with distinct names — proves the prompt pipeline
    # actually emits shotgun-specific behavior, not rifle-flavored text.
    assert rifle is not shotgun
    assert rifle.style_id == "rifle"
    assert shotgun.style_id == "shotgun"
    assert "Shotgun" in shotgun.name
    # The behavior text should mention slug ballistics or pattern range
    # so we know the content was actually swapped, not just the label.
    body = " ".join([
        *(shotgun.behavior_adjustments or ()),
        *(shotgun.tactical_adjustments or ()),
    ]).lower()
    assert any(t in body for t in ("slug", "buckshot", "pattern", "100 yard", "125 yard")), (
        "Whitetail shotgun modifier text doesn't reference slug / buckshot / pattern range — "
        "it might be a copy of the rifle modifier."
    )


def test_turkey_has_distinct_shotgun_modifier():
    shotgun = resolve_hunt_style_modifier(TURKEY_PACK, "shotgun")
    rifle = resolve_hunt_style_modifier(TURKEY_PACK, "rifle")
    assert shotgun is not None, "Turkey is shotgun-default — must have a shotgun modifier"
    assert rifle is not None, "Turkey rifle modifier still exists for legal-rifle states"
    assert shotgun is not rifle
    assert shotgun.style_id == "shotgun"
    assert rifle.style_id == "rifle"
    # Turkey shotgun modifier must mention pattern range and the
    # shotgun-only-by-default legal framing.
    body = " ".join([
        *(shotgun.behavior_adjustments or ()),
        *(shotgun.tactical_adjustments or ()),
        *(shotgun.species_tips_adjustments or ()),
    ]).lower()
    assert "pattern" in body or "tss" in body
    assert any(t in body for t in ("30-45", "40-45", "default")), (
        "Turkey shotgun modifier missing the canonical 30-45 yard / shotgun-default framing."
    )


def test_unknown_species_pack_returns_none_for_shotgun():
    """Species packs without a shotgun modifier should fall back gracefully
    rather than crash. This proves the resolver is forward-compatible."""
    # Try a species without a shotgun modifier (e.g. elk / antelope packs
    # that haven't been re-authored yet). The resolver returns None and
    # the prompt builder emits the neutral "unspecified" notice.
    from species_prompts.elk import ELK_PACK
    out = resolve_hunt_style_modifier(ELK_PACK, "shotgun")
    # Either None (no modifier) or a real one — both are acceptable.
    # Just must not throw.
    assert out is None or out.style_id == "shotgun"
