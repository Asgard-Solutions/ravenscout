"""Tests for the species prompt pack system + shared prompt pipeline.

Run with:  cd /app/backend && python -m pytest tests/test_species_prompt_packs.py -v
"""

import pytest

from prompt_builder import (
    assemble_system_prompt,
    build_species_prompt_pack_block,
    build_species_rules,
)
from species_prompts import (
    GENERIC_FALLBACK_PACK,
    get_all_canonical_species,
    resolve_species_pack,
)
from species_prompts.hog import HOG_PACK
from species_prompts.pack import render_species_prompt_block
from species_prompts.registry import is_supported_species
from species_prompts.turkey import TURKEY_PACK
from species_prompts.whitetail import WHITETAIL_PACK

DUMMY_CONDITIONS = {
    "hunt_date": "2026-04-20",
    "time_window": "morning",
    "wind_direction": "NW",
    "temperature": "42F",
    "precipitation": None,
    "property_type": "public",
    "region": "Ozarks",
}


# ============================================================
# Canonical resolution
# ============================================================

class TestSpeciesResolution:
    @pytest.mark.parametrize("name", [
        "deer", "Deer", "whitetail", "Whitetail",
        "whitetail deer", "Whitetail Deer",
        "white-tailed deer", "White-Tailed Deer",
        "whitetailed deer", "white tailed deer",
        "  whitetail  ",
    ])
    def test_whitetail_aliases_resolve(self, name):
        assert resolve_species_pack(name) is WHITETAIL_PACK

    @pytest.mark.parametrize("name", [
        "turkey", "Turkey",
        "wild turkey", "Wild Turkey",
        "eastern turkey", "rio grande turkey",
        "merriam turkey", "merriams turkey", "merriam's turkey",
        "osceola turkey", "gobbler",
    ])
    def test_turkey_aliases_resolve(self, name):
        assert resolve_species_pack(name) is TURKEY_PACK

    @pytest.mark.parametrize("name", [
        "hog", "Hog", "hogs", "Hogs",
        "pig", "pigs",
        "wild hog", "feral hog", "feral hogs",
        "feral swine", "wild boar", "boar",
    ])
    def test_hog_aliases_resolve(self, name):
        assert resolve_species_pack(name) is HOG_PACK

    @pytest.mark.parametrize("name", [
        None, "", "   ",
        # Still-unsupported species — these should continue to fall
        # back to the generic pack even after the expansion.
        "squirrel", "whitetail_bobcat", "bobcat", "mountain lion",
    ])
    def test_unsupported_species_falls_back(self, name):
        pack = resolve_species_pack(name)
        assert pack is GENERIC_FALLBACK_PACK
        assert pack.is_fallback is True
        assert pack.fallback_reason is not None

    def test_is_supported_species(self):
        # Original three species.
        assert is_supported_species("deer") is True
        assert is_supported_species("turkey") is True
        assert is_supported_species("hog") is True
        # Expansion species (elk / bear / moose / antelope / coyote).
        assert is_supported_species("elk") is True
        assert is_supported_species("bear") is True
        assert is_supported_species("moose") is True
        assert is_supported_species("antelope") is True
        assert is_supported_species("pronghorn") is True  # alias
        assert is_supported_species("coyote") is True
        # Still-unsupported + null-ish inputs.
        assert is_supported_species("squirrel") is False
        assert is_supported_species(None) is False

    def test_inventory_shape(self):
        items = get_all_canonical_species()
        canon = {i["canonical_id"] for i in items}
        assert canon == {
            "whitetail", "turkey", "hog",
            "elk", "bear", "moose", "antelope", "coyote",
        }
        # Display names and alias lists exist for every entry.
        for item in items:
            assert item["display_name"]
            assert isinstance(item["aliases"], list) and item["aliases"]


# ============================================================
# Pack content — each species must carry unique tactical language
# ============================================================

class TestSpeciesPackContent:
    def test_whitetail_has_funnel_saddle_language(self):
        text = render_species_prompt_block(WHITETAIL_PACK).lower()
        assert "funnel" in text
        assert "saddle" in text
        assert "bedding" in text
        assert "wind" in text

    def test_turkey_has_roost_strut_language(self):
        text = render_species_prompt_block(TURKEY_PACK).lower()
        assert "roost" in text
        assert "strut" in text
        assert "fly-down" in text or "fly down" in text
        # Turkey pack explicitly warns AGAINST deer-style funnel logic.
        assert "funnel" in text  # yes — it appears in caution_rules

    def test_hog_has_water_cover_food_language(self):
        text = render_species_prompt_block(HOG_PACK).lower()
        assert "water" in text
        assert "wallow" in text
        assert "cover" in text
        assert "sounder" in text

    def test_packs_are_distinguishable(self):
        """A prompt for one species must not accidentally contain the
        other species' hot-cue tactical framing."""
        deer = render_species_prompt_block(WHITETAIL_PACK).lower()
        turkey = render_species_prompt_block(TURKEY_PACK).lower()
        hog = render_species_prompt_block(HOG_PACK).lower()

        # Deer pack doesn't recommend turkey-specific tactics.
        assert "fly-down" not in deer
        assert "strut" not in deer
        assert "gobbler" not in deer
        # Deer pack doesn't recommend hog-specific tactics.
        assert "sounder" not in deer
        assert "wallow" not in deer

        # Turkey pack doesn't adopt hog-specific tactics.
        assert "sounder" not in turkey
        assert "wallow" not in turkey

        # Hog pack doesn't drift into turkey-specific tactics.
        assert "fly-down" not in hog
        assert "strut" not in hog

    def test_every_pack_has_do_not_over_assume_guidance(self):
        for pack in (WHITETAIL_PACK, TURKEY_PACK, HOG_PACK):
            text = render_species_prompt_block(pack).lower()
            assert "caution rules (do not over-assume):" in text
            # Guardrail language.
            assert "do not" in text

    def test_every_pack_has_species_tips_guidance(self):
        for pack in (WHITETAIL_PACK, TURKEY_PACK, HOG_PACK):
            text = render_species_prompt_block(pack)
            assert "SPECIES TIPS GUIDANCE" in text
            # Heading is followed by at least one bullet.
            idx = text.index("SPECIES TIPS GUIDANCE")
            after = text[idx:]
            assert "  - " in after


# ============================================================
# Fallback behavior content
# ============================================================

class TestFallbackPack:
    def test_fallback_renders_unsupported_notice(self):
        text = render_species_prompt_block(GENERIC_FALLBACK_PACK)
        assert "FALLBACK NOTICE" in text
        assert "LOWER overall confidence" in text
        assert "unsupported species" in text.lower()

    def test_fallback_is_cautious_and_generic(self):
        text = render_species_prompt_block(GENERIC_FALLBACK_PACK).lower()
        # It must NOT claim species-specific tactics.
        for kw in ("strut", "roost", "sounder", "wallow"):
            assert kw not in text


# ============================================================
# Full prompt assembly — shared pipeline still intact
# ============================================================

class TestAssembleSystemPrompt:

    # ----- Shared blocks --------------------------------------------------

    @pytest.mark.parametrize("species", ["deer", "turkey", "hog"])
    @pytest.mark.parametrize("tier", ["trial", "core", "pro"])
    def test_contains_shared_blocks(self, species, tier):
        prompt = assemble_system_prompt(
            animal=species,
            conditions=DUMMY_CONDITIONS,
            image_count=1,
            tier=tier,
        )
        # Base identity
        assert "Raven Scout" in prompt
        # JSON-only rule
        assert "valid JSON only" in prompt
        assert "No markdown" in prompt
        # Hunt conditions block
        assert "HUNT CONDITIONS" in prompt
        assert "Wind Direction: NW" in prompt
        # Image context
        assert "IMAGE CONTEXT" in prompt
        # Output schema (all required keys)
        for key in (
            "analysis_context",
            "map_observations",
            "overlays",
            "summary",
            "top_setups",
            "wind_notes",
            "best_time",
            "key_assumptions",
            "species_tips",
            "confidence_summary",
        ):
            assert key in prompt, f"shared schema key '{key}' missing for {species}/{tier}"
        # Strict constraints
        assert "STRICT CONSTRAINTS" in prompt
        assert "x_percent and y_percent must be between 5 and 95" in prompt
        # Schema v2 label
        assert "v2" in prompt

    # ----- Species-specific text per species ------------------------------

    def test_includes_whitetail_specific_text(self):
        prompt = assemble_system_prompt("deer", DUMMY_CONDITIONS, 1, "pro")
        assert "SPECIES: Whitetail Deer" in prompt
        assert "funnel" in prompt.lower()
        assert "saddle" in prompt.lower()
        # Must NOT accidentally carry turkey/hog cues
        assert "strut" not in prompt.lower()
        assert "wallow" not in prompt.lower()

    def test_includes_turkey_specific_text(self):
        prompt = assemble_system_prompt("turkey", DUMMY_CONDITIONS, 1, "core")
        assert "SPECIES: Wild Turkey" in prompt
        assert "roost" in prompt.lower()
        assert "strut" in prompt.lower()
        # No hog-specific drift
        assert "sounder" not in prompt.lower()

    def test_includes_hog_specific_text(self):
        prompt = assemble_system_prompt("hog", DUMMY_CONDITIONS, 1, "trial")
        assert "SPECIES: Wild Hog" in prompt
        assert "sounder" in prompt.lower()
        assert "wallow" in prompt.lower()
        # No turkey-specific drift
        assert "strut" not in prompt.lower()

    def test_includes_elk_specific_text(self):
        # Elk was moved from fallback to a first-class pack as part of
        # the species expansion — verify its pack is now wired in.
        prompt = assemble_system_prompt("elk", DUMMY_CONDITIONS, 1, "pro")
        assert "SPECIES: Elk" in prompt
        # Elk-specific tactical language.
        assert "thermal" in prompt.lower()
        # No whitetail-specific drift.
        assert "SPECIES: Whitetail Deer" not in prompt

    def test_unsupported_species_uses_fallback_in_assembled_prompt(self):
        # A truly-unsupported species should still fall through to the
        # generic pack and render the FALLBACK NOTICE.
        prompt = assemble_system_prompt("squirrel", DUMMY_CONDITIONS, 1, "pro")
        assert "SPECIES: Unspecified Game Species" in prompt
        assert "FALLBACK NOTICE" in prompt
        # Shared blocks still present
        assert "analysis_context" in prompt
        assert "STRICT CONSTRAINTS" in prompt

    # ----- Image / tier aware behavior ------------------------------------

    def test_single_image_block_for_any_tier(self):
        for tier in ("trial", "core", "pro"):
            prompt = assemble_system_prompt("deer", DUMMY_CONDITIONS, 1, tier)
            assert "You have been provided 1 image" in prompt
            assert "MULTI-IMAGE ANALYSIS" not in prompt

    def test_multi_image_block_only_triggers_for_pro(self):
        # Pro with multiple images → multi-image block.
        prompt = assemble_system_prompt("deer", DUMMY_CONDITIONS, 3, "pro")
        assert "MULTI-IMAGE ANALYSIS" in prompt
        assert "PRIMARY map" in prompt

    # ----- Species-tips hook in constraints -------------------------------

    @pytest.mark.parametrize("species", ["deer", "turkey", "hog"])
    def test_species_tips_constraint_points_back_to_pack(self, species):
        prompt = assemble_system_prompt(species, DUMMY_CONDITIONS, 1, "pro")
        assert "species_tips MUST follow the SPECIES TIPS GUIDANCE" in prompt

    # ----- Legacy species_data kwarg backwards compat ---------------------

    def test_legacy_species_data_kwarg_is_accepted_and_ignored(self):
        prompt_a = assemble_system_prompt("deer", DUMMY_CONDITIONS, 1, "pro")
        prompt_b = assemble_system_prompt(
            "deer", DUMMY_CONDITIONS, 1, "pro",
            species_data={"deer": {"name": "LEGACY", "behavior_rules": ["ignored"]}},
        )
        assert prompt_a == prompt_b  # legacy arg does NOT override pack

    # ----- build_species_rules alias ------------------------------------

    @pytest.mark.parametrize("species", ["deer", "turkey", "hog"])
    def test_build_species_rules_delegates_to_pack(self, species):
        got = build_species_rules(species)
        expected = build_species_prompt_pack_block(resolve_species_pack(species))
        assert got == expected
