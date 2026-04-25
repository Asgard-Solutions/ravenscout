"""Tests for hunt-style modifier normalization + resolution +
prompt pipeline integration.

Run with:
    cd /app/backend && python -m pytest tests/test_hunt_style_modifiers.py -v
"""

import pytest

from prompt_builder import assemble_system_prompt
from species_prompts import (
    CANONICAL_HUNT_STYLES,
    GENERIC_FALLBACK_PACK,
    get_hunt_style_label,
    normalize_hunt_style,
    render_hunt_style_modifier_block,
    render_no_hunt_style_context_note,
    resolve_hunt_style_modifier,
    resolve_species_pack,
)


# ============================================================
# Canonical inventory
# ============================================================

CANONICAL_IDS = ("archery", "rifle", "blind", "saddle", "public_land", "spot_and_stalk")


class TestCanonicalInventory:
    def test_exactly_six_styles_exist(self):
        assert len(CANONICAL_HUNT_STYLES) == 6

    def test_all_expected_ids_present(self):
        for sid in CANONICAL_IDS:
            assert sid in CANONICAL_HUNT_STYLES

    def test_every_id_has_non_empty_label(self):
        for sid, label in CANONICAL_HUNT_STYLES.items():
            assert isinstance(label, str) and label.strip()

    def test_get_hunt_style_label_roundtrip(self):
        for sid, label in CANONICAL_HUNT_STYLES.items():
            assert get_hunt_style_label(sid) == label
        assert get_hunt_style_label(None) is None
        assert get_hunt_style_label("") is None
        assert get_hunt_style_label("not_a_style") is None


# ============================================================
# Freeform input normalization
# ============================================================

class TestNormalizeHuntStyle:
    @pytest.mark.parametrize("raw,expected", [
        # Canonical pass-through
        ("archery", "archery"),
        ("rifle", "rifle"),
        ("blind", "blind"),
        ("saddle", "saddle"),
        ("public_land", "public_land"),
        ("spot_and_stalk", "spot_and_stalk"),
        # Casing / punctuation normalization
        ("ARCHERY", "archery"),
        ("Archery", "archery"),
        ("public-land", "public_land"),
        ("Spot-and-Stalk", "spot_and_stalk"),
        ("PUBLIC LAND", "public_land"),
        # Common aliases
        ("bow", "archery"),
        ("bow hunting", "archery"),
        ("compound bow", "archery"),
        ("crossbow", "archery"),
        ("traditional", "archery"),
        ("shotgun", "rifle"),
        ("muzzleloader", "rifle"),
        ("black powder", "rifle"),
        ("blackpowder", "rifle"),
        ("ground blind", "blind"),
        ("box blind", "blind"),
        ("tower blind", "blind"),
        ("tree saddle", "saddle"),
        ("saddle hunter", "saddle"),
        ("state land", "public_land"),
        ("national forest", "public_land"),
        ("WMA", "public_land"),
        ("BLM", "public_land"),
        ("spot & stalk", "spot_and_stalk"),
        ("stalk", "spot_and_stalk"),
        ("still hunt", "spot_and_stalk"),
        ("glassing", "spot_and_stalk"),
    ])
    def test_known_aliases(self, raw, expected):
        assert normalize_hunt_style(raw) == expected

    @pytest.mark.parametrize("raw", [
        None, "", "   ", "totally bogus", "deer", "whitetail", "not a style",
        123, [], {}, True,
    ])
    def test_unknown_or_bad_input(self, raw):
        assert normalize_hunt_style(raw) is None


# ============================================================
# Per-species modifier coverage
# ============================================================

SUPPORTED_SPECIES = ("deer", "turkey", "hog")


class TestSpeciesCoverage:
    @pytest.mark.parametrize("species", SUPPORTED_SPECIES)
    @pytest.mark.parametrize("style_id", CANONICAL_IDS)
    def test_every_style_defined_on_every_species(self, species, style_id):
        pack = resolve_species_pack(species)
        mod = resolve_hunt_style_modifier(pack, style_id)
        assert mod is not None, f"{species} missing {style_id}"
        assert mod.style_id == style_id
        # At least one adjustment list should be populated — an empty
        # modifier would render as a pile of '(none)' bullets and
        # add no value.
        assert any([
            mod.behavior_adjustments,
            mod.tactical_adjustments,
            mod.caution_adjustments,
            mod.species_tips_adjustments,
        ]), f"{species}/{style_id} has all-empty adjustment lists"

    def test_fallback_species_has_no_style_modifiers(self):
        # GENERIC_FALLBACK_PACK intentionally has no style modifiers
        # so the prompt degrades to the neutral 'unspecified' notice.
        for sid in CANONICAL_IDS:
            assert resolve_hunt_style_modifier(GENERIC_FALLBACK_PACK, sid) is None


# ============================================================
# Resolver behavior
# ============================================================

class TestResolver:
    def test_unknown_style_returns_none(self):
        pack = resolve_species_pack("deer")
        assert resolve_hunt_style_modifier(pack, "not_a_style") is None

    def test_none_style_returns_none(self):
        pack = resolve_species_pack("deer")
        assert resolve_hunt_style_modifier(pack, None) is None

    def test_empty_string_returns_none(self):
        pack = resolve_species_pack("deer")
        assert resolve_hunt_style_modifier(pack, "") is None

    def test_non_canonical_passthrough_rejected(self):
        # The resolver should NOT accept aliases; those must be
        # normalized upstream. This enforces canonical-only
        # contract on the pack boundary.
        pack = resolve_species_pack("deer")
        assert resolve_hunt_style_modifier(pack, "bow") is None
        assert resolve_hunt_style_modifier(pack, "Archery") is None


# ============================================================
# Prompt pipeline integration
# ============================================================

class TestPromptPipeline:
    def test_hunt_style_block_included_when_selected(self):
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-11-12", "temperature": "32F"},
            image_count=1,
            tier="pro",
            gps_coords=(41.6, -93.6),  # Iowa -> midwest
            hunt_style="archery",
        )
        assert "HUNT STYLE CONTEXT: Archery (Whitetail)" in prompt
        assert "style_id=archery" in prompt
        assert "source=user_selected" in prompt
        assert "HUNT STYLE BEHAVIOR ADJUSTMENTS" in prompt
        assert "HUNT STYLE TACTICAL ADJUSTMENTS" in prompt
        assert "HUNT STYLE CAUTION ADJUSTMENTS" in prompt
        assert "HUNT STYLE SPECIES TIPS ADJUSTMENTS" in prompt

    def test_unspecified_block_when_style_missing(self):
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-11-12"},
            image_count=1,
            tier="pro",
        )
        assert "HUNT STYLE CONTEXT: unspecified" in prompt
        # Explicitly tells the LLM not to assume a method.
        assert "method-neutral" in prompt.lower() or "do not assume" in prompt.lower()

    def test_unspecified_block_when_style_unrecognized(self):
        # Freeform garbage should fall through to the neutral notice,
        # not silently render an empty block.
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-11-12"},
            image_count=1,
            tier="pro",
            hunt_style="banana",
        )
        assert "HUNT STYLE CONTEXT: unspecified" in prompt
        assert "HUNT STYLE CONTEXT: Archery" not in prompt

    def test_hunt_style_can_come_from_conditions_dict(self):
        # Mirrors the server path: conditions.model_dump() carries
        # hunt_style; the builder should pick it up when the kwarg
        # is omitted.
        prompt = assemble_system_prompt(
            "turkey",
            conditions={"hunt_date": "2026-04-15", "hunt_style": "Tree Saddle"},
            image_count=1,
            tier="pro",
        )
        assert "HUNT STYLE CONTEXT: Tree Saddle (Turkey)" in prompt
        assert "style_id=saddle" in prompt

    def test_explicit_kwarg_beats_conditions_dict(self):
        prompt = assemble_system_prompt(
            "turkey",
            conditions={"hunt_date": "2026-04-15", "hunt_style": "rifle"},
            image_count=1,
            tier="pro",
            hunt_style="archery",
        )
        assert "style_id=archery" in prompt
        assert "style_id=rifle" not in prompt

    def test_block_ordering_stable(self):
        # species -> regional -> seasonal -> hunt-style -> conditions
        prompt = assemble_system_prompt(
            "deer",
            conditions={"hunt_date": "2026-11-12", "temperature": "32F"},
            image_count=1,
            tier="pro",
            gps_coords=(41.6, -93.6),
            hunt_style="rifle",
        )
        s_idx = prompt.index("SPECIES: Whitetail Deer")
        r_idx = prompt.index("REGIONAL CONTEXT")
        season_idx = prompt.index("SEASONAL CONTEXT")
        hs_idx = prompt.index("HUNT STYLE CONTEXT")
        hc_idx = prompt.index("HUNT CONDITIONS")
        assert s_idx < r_idx < season_idx < hs_idx < hc_idx

    def test_fallback_species_emits_unspecified_block(self):
        # Unsupported species has no style modifiers, so even with
        # a valid hunt_style the block should render as unspecified.
        prompt = assemble_system_prompt(
            "squirrel",
            conditions={"hunt_date": "2026-10-12"},
            image_count=1,
            tier="pro",
            hunt_style="rifle",
        )
        assert "FALLBACK NOTICE" in prompt
        assert "HUNT STYLE CONTEXT: unspecified" in prompt


# ============================================================
# Cross-style / cross-species isolation sanity
# ============================================================

class TestStyleIsolation:
    """Sanity guards so per-style content stays per-style."""

    @pytest.mark.parametrize("species", SUPPORTED_SPECIES)
    def test_archery_emphasizes_close_range(self, species):
        pack = resolve_species_pack(species)
        mod = resolve_hunt_style_modifier(pack, "archery")
        blob = " ".join(
            mod.behavior_adjustments
            + mod.tactical_adjustments
            + mod.caution_adjustments
            + mod.species_tips_adjustments
        ).lower()
        # Archery content must talk about close range / short yards.
        assert "yards" in blob or "range" in blob

    @pytest.mark.parametrize("species", SUPPORTED_SPECIES)
    def test_public_land_talks_about_pressure(self, species):
        pack = resolve_species_pack(species)
        mod = resolve_hunt_style_modifier(pack, "public_land")
        blob = " ".join(
            mod.behavior_adjustments
            + mod.tactical_adjustments
            + mod.caution_adjustments
            + mod.species_tips_adjustments
        ).lower()
        assert "pressure" in blob

    @pytest.mark.parametrize("species", SUPPORTED_SPECIES)
    def test_saddle_talks_about_mobility(self, species):
        pack = resolve_species_pack(species)
        mod = resolve_hunt_style_modifier(pack, "saddle")
        blob = " ".join(
            mod.behavior_adjustments
            + mod.tactical_adjustments
            + mod.caution_adjustments
            + mod.species_tips_adjustments
        ).lower()
        assert "mobil" in blob or "move" in blob or "reset" in blob

    @pytest.mark.parametrize("species", SUPPORTED_SPECIES)
    def test_spot_and_stalk_talks_about_glassing_or_approach(self, species):
        pack = resolve_species_pack(species)
        mod = resolve_hunt_style_modifier(pack, "spot_and_stalk")
        blob = " ".join(
            mod.behavior_adjustments
            + mod.tactical_adjustments
            + mod.caution_adjustments
            + mod.species_tips_adjustments
        ).lower()
        assert (
            "glass" in blob or "stalk" in blob or "approach" in blob
        )


# ============================================================
# Block rendering sanity
# ============================================================

class TestBlockRendering:
    def test_full_block_contains_all_headings(self):
        pack = resolve_species_pack("hog")
        mod = resolve_hunt_style_modifier(pack, "blind")
        assert mod is not None
        text = render_hunt_style_modifier_block(mod, style_id="blind", source="user_selected")
        assert "HUNT STYLE CONTEXT: Ground Blind (Hog)" in text
        assert "style_id=blind" in text
        assert "source=user_selected" in text
        assert "HUNT STYLE BEHAVIOR ADJUSTMENTS" in text
        assert "HUNT STYLE TACTICAL ADJUSTMENTS" in text
        assert "HUNT STYLE CAUTION ADJUSTMENTS" in text
        assert "HUNT STYLE SPECIES TIPS ADJUSTMENTS" in text

    def test_no_style_note_is_neutral_and_method_free(self):
        text = render_no_hunt_style_context_note()
        assert "HUNT STYLE CONTEXT: unspecified" in text
        lowered = text.lower()
        # Explicitly tells the LLM not to assume any particular method.
        for method in ("archery", "rifle", "blind", "saddle", "spot-and-stalk"):
            assert method in lowered
        assert "do not assume" in lowered
