"""Tests for the deepened prompt packs — regional + hunt-style modifiers
for elk / bear / moose / antelope / coyote (species_expansion_v1 delta).

Run with:
    cd /app/backend && python -m pytest tests/test_species_expansion_modifiers.py -q
"""

import pytest

from prompt_builder import assemble_system_prompt


DUMMY_CONDITIONS = {
    "hunt_date": "2026-04-20",
    "time_window": "morning",
    "wind_direction": "NW",
    "temperature": "42F",
    "precipitation": None,
    "property_type": "public",
    "region": "Ozarks",
}


# Expected registered hunt styles per species (mirrors the packs under
# /app/backend/species_prompts/{species}.py at the time of this test).
EXPECTED_HUNT_STYLES = {
    "elk":       {"archery", "rifle", "spot_and_stalk", "public_land"},
    "bear":      {"archery", "rifle", "spot_and_stalk"},
    "moose":     {"archery", "rifle", "spot_and_stalk"},
    "antelope":  {"archery", "rifle", "blind", "spot_and_stalk"},
    "coyote":    {"archery", "rifle", "public_land"},
}

EXPECTED_REGIONS = {
    "elk":       {"mountain_west", "plains"},
    "bear":      {"mountain_west", "southeast_us", "midwest"},
    "moose":     {"mountain_west", "midwest"},
    "antelope":  {"plains", "mountain_west"},
    "coyote":    {"plains", "southeast_us", "mountain_west"},
}


# Distinguishing per-(species, style) phrase — must appear in the
# assembled system prompt when that modifier renders. Phrases are
# chosen from each modifier's tactical_adjustments field and are short
# enough to be unambiguous while long enough to avoid accidental hits.
STYLE_PHRASES = {
    ("elk", "archery"):         "caller 30-60 yards behind the shooter",
    ("elk", "rifle"):           "glassing-knob setups",
    ("elk", "spot_and_stalk"):  "two-phase approach",
    ("elk", "public_land"):     "2-5 mile hikes from roads",
    ("bear", "archery"):        "pre-cleared 25-35 yard lane",
    ("bear", "rifle"):          "across-drainage knob positions",
    ("bear", "spot_and_stalk"): "heads-down feeding interval",
    ("moose", "archery"):       "Cow-call and rake setups",
    ("moose", "rifle"):         "Ridge-edge benches above pond systems",
    ("moose", "spot_and_stalk"): "shoreline cover, cut banks",
    ("antelope", "archery"):    "Water-hole ambush from pit blind",
    ("antelope", "rifle"):      "rested prone position with verified range",
    ("antelope", "blind"):      "stock tanks, windmill outflows",
    ("antelope", "spot_and_stalk"): "belly crawl over the last 100-200 yards",
    ("coyote", "archery"):      "electronic caller + decoy in an opening",
    ("coyote", "rifle"):        "rested bipod / pack, sight downwind",
    ("coyote", "public_land"):  "less-accessed pockets",
}

# Expected display-name fragment per (species, style) — matched against
# the assembled prompt's HUNT STYLE CONTEXT header line. Each pack
# stores a `name` like "Rifle (Elk)", "Archery (Black Bear)", etc.
STYLE_NAME_FRAGMENTS = {
    ("elk", "archery"):         "Archery (Elk)",
    ("elk", "rifle"):           "Rifle (Elk)",
    ("elk", "spot_and_stalk"):  "Spot-and-Stalk (Elk)",
    ("elk", "public_land"):     "Public Land (Elk)",
    ("bear", "archery"):        "Archery (Black Bear)",
    ("bear", "rifle"):          "Rifle (Black Bear)",
    ("bear", "spot_and_stalk"): "Spot-and-Stalk (Black Bear)",
    ("moose", "archery"):       "Archery (Moose)",
    ("moose", "rifle"):         "Rifle (Moose)",
    ("moose", "spot_and_stalk"): "Spot-and-Stalk (Moose)",
    ("antelope", "archery"):    "Archery (Pronghorn)",
    ("antelope", "rifle"):      "Rifle (Pronghorn)",
    ("antelope", "blind"):      "Ground Blind / Pit Blind (Pronghorn)",
    ("antelope", "spot_and_stalk"): "Spot-and-Stalk (Pronghorn)",
    ("coyote", "archery"):      "Archery (Coyote)",
    ("coyote", "rifle"):        "Rifle (Coyote)",
    ("coyote", "public_land"):  "Public Land (Coyote)",
}


# Distinguishing per-(species, region) phrase and per-(species, region)
# display name fragment.
REGION_PHRASES = {
    ("elk", "mountain_west"):       "aspen",
    ("elk", "plains"):              "coulee",
    ("bear", "mountain_west"):      "avalanche chute",
    ("bear", "southeast_us"):       "pocosin",
    ("bear", "midwest"):            "Upper Midwest",
    ("moose", "mountain_west"):     "Shiras",
    ("moose", "midwest"):           "Minnesota",
    ("antelope", "plains"):         "Wyoming",
    ("antelope", "mountain_west"):  "sagebrush",
    ("coyote", "plains"):           "shelterbelt",
    ("coyote", "southeast_us"):     "pine plantation",
    ("coyote", "mountain_west"):    "juniper",
}

REGION_NAME_FRAGMENTS = {
    ("elk", "mountain_west"):       "Mountain West (Rocky Mountain Elk)",
    ("elk", "plains"):               "Great Plains (Prairie & Breaks Elk)",
    ("bear", "mountain_west"):       "Mountain West Black Bear",
    ("bear", "southeast_us"):        "Southeastern Black Bear",
    ("bear", "midwest"):             "Upper Midwest / Great Lakes Black Bear",
    ("moose", "mountain_west"):      "Mountain West (Shiras Moose)",
    ("moose", "midwest"):            "Upper Midwest / Great Lakes Moose",
    ("antelope", "plains"):          "Great Plains (High-Density Pronghorn)",
    ("antelope", "mountain_west"):   "Intermountain West / Sagebrush Pronghorn",
    ("coyote", "plains"):            "Great Plains / Open-Country Coyote",
    ("coyote", "southeast_us"):      "Southeastern Coyote",
    ("coyote", "mountain_west"):     "Mountain West Coyote",
}


# A whitetail-specific phrase used to detect cross-contamination — the
# whitetail tactical_guidance list includes "hinge-cut gaps" which no
# other species pack references.
WHITETAIL_CONTAMINATION_PHRASE = "hinge-cut"


# ============================================================
# 1. HUNT-STYLE MODIFIER RENDERING
# ============================================================

class TestHuntStyleModifierRendering:
    """For each species and each registered style, assert the
    hunt-style modifier's name + a distinguishing tactical phrase
    appear in the assembled system prompt."""

    @pytest.mark.parametrize(
        "species,style",
        [
            (sp, st)
            for sp, styles in EXPECTED_HUNT_STYLES.items()
            for st in styles
        ],
    )
    def test_hunt_style_block_rendered(self, species, style):
        prompt = assemble_system_prompt(
            species,
            DUMMY_CONDITIONS,
            image_count=1,
            tier="pro",
            hunt_style=style,
        )

        # Header / name fragment present
        name_frag = STYLE_NAME_FRAGMENTS[(species, style)]
        assert name_frag in prompt, (
            f"[{species}+{style}] expected hunt-style name "
            f"{name_frag!r} in assembled prompt"
        )

        # HUNT STYLE CONTEXT header is present AND references the
        # canonical id.
        assert "HUNT STYLE CONTEXT:" in prompt
        assert f"style_id={style}" in prompt

        # Distinguishing tactical phrase present
        phrase = STYLE_PHRASES[(species, style)]
        assert phrase in prompt, (
            f"[{species}+{style}] expected distinguishing phrase "
            f"{phrase!r} in assembled prompt"
        )

        # Unspecified notice MUST NOT appear when a real style
        # resolved.
        assert "HUNT STYLE CONTEXT: unspecified" not in prompt

    @pytest.mark.parametrize("species", list(EXPECTED_HUNT_STYLES.keys()))
    def test_no_whitetail_cross_contamination(self, species):
        """elk+rifle / bear+archery / etc. must not drag in whitetail-
        specific tactical language like 'hinge-cut gaps'."""
        # Pick any one style that's valid for this species.
        style = sorted(EXPECTED_HUNT_STYLES[species])[0]
        prompt = assemble_system_prompt(
            species,
            DUMMY_CONDITIONS,
            image_count=1,
            tier="pro",
            hunt_style=style,
        )
        assert WHITETAIL_CONTAMINATION_PHRASE not in prompt, (
            f"[{species}+{style}] leaked whitetail-specific phrase "
            f"{WHITETAIL_CONTAMINATION_PHRASE!r}"
        )


# ============================================================
# 2. REGIONAL MODIFIER RENDERING
# ============================================================

class TestRegionalModifierRendering:
    """For each species and each registered region, assert the
    regional modifier's name (or a REGIONAL CONTEXT header referencing
    the region id) + a distinguishing regional phrase appear."""

    @pytest.mark.parametrize(
        "species,region",
        [
            (sp, rg)
            for sp, regs in EXPECTED_REGIONS.items()
            for rg in regs
        ],
    )
    def test_regional_block_rendered(self, species, region):
        prompt = assemble_system_prompt(
            species,
            DUMMY_CONDITIONS,
            image_count=1,
            tier="pro",
            manual_region_override=region,
        )

        # Either the name fragment is present OR the REGIONAL CONTEXT
        # header references the canonical region_id (both will be
        # present when a real modifier resolves, but we accept either
        # as the spec says).
        name_frag = REGION_NAME_FRAGMENTS[(species, region)]
        header_hit = f"REGIONAL CONTEXT: " in prompt and f"region_id={region}" in prompt
        name_hit = name_frag in prompt
        assert name_hit or header_hit, (
            f"[{species}+{region}] expected regional name "
            f"{name_frag!r} OR REGIONAL CONTEXT header with "
            f"region_id={region} in assembled prompt"
        )
        # In practice BOTH should be present for the 5 expanded species
        # (this is a stricter cross-check that catches regressions).
        assert name_hit, (
            f"[{species}+{region}] expected name fragment {name_frag!r}"
        )

        # Distinguishing regional phrase present.
        phrase = REGION_PHRASES[(species, region)]
        assert phrase in prompt, (
            f"[{species}+{region}] expected distinguishing regional "
            f"phrase {phrase!r} in assembled prompt"
        )

        # The 'generic' regional fallback notice MUST NOT appear.
        assert "REGIONAL CONTEXT: generic" not in prompt


# ============================================================
# 3. COMBINED STYLE + REGION
# ============================================================

class TestCombinedStyleAndRegion:
    """Render with BOTH hunt_style AND region_id set. Both modifier
    headers and both distinguishing phrases must appear."""

    @pytest.mark.parametrize(
        "species,style,region",
        [
            ("elk", "archery", "mountain_west"),
            ("antelope", "blind", "plains"),
            ("coyote", "rifle", "southeast_us"),
        ],
    )
    def test_combined(self, species, style, region):
        prompt = assemble_system_prompt(
            species,
            DUMMY_CONDITIONS,
            image_count=1,
            tier="pro",
            hunt_style=style,
            manual_region_override=region,
        )

        # Both names present
        assert STYLE_NAME_FRAGMENTS[(species, style)] in prompt, (
            f"[{species}+{style}+{region}] missing hunt-style name"
        )
        assert REGION_NAME_FRAGMENTS[(species, region)] in prompt, (
            f"[{species}+{style}+{region}] missing regional name"
        )

        # Both distinguishing phrases present
        assert STYLE_PHRASES[(species, style)] in prompt, (
            f"[{species}+{style}+{region}] missing hunt-style phrase"
        )
        assert REGION_PHRASES[(species, region)] in prompt, (
            f"[{species}+{style}+{region}] missing regional phrase"
        )

        # Both blocks rendered (neither fallback).
        assert "HUNT STYLE CONTEXT: unspecified" not in prompt
        assert "REGIONAL CONTEXT: generic" not in prompt

        # Stable order: species -> regional -> seasonal -> hunt-style
        species_idx = prompt.find("SPECIES:")
        regional_idx = prompt.find("REGIONAL CONTEXT:")
        seasonal_idx = prompt.find("SEASONAL CONTEXT:")
        huntstyle_idx = prompt.find("HUNT STYLE CONTEXT:")
        conditions_idx = prompt.find("HUNT CONDITIONS:")
        assert -1 < species_idx < regional_idx < seasonal_idx < huntstyle_idx < conditions_idx, (
            f"Block order violated: species={species_idx} "
            f"regional={regional_idx} seasonal={seasonal_idx} "
            f"huntstyle={huntstyle_idx} conditions={conditions_idx}"
        )


# ============================================================
# 4. FALLBACK — UNKNOWN STYLE OR REGION
# ============================================================

class TestFallbackGraceful:
    """Unknown style and/or unknown region (per species) must NOT
    raise and must render a graceful prompt — either a neutral
    'unspecified'/'generic' notice or simply omit the corresponding
    block."""

    def test_elk_unknown_style_saddle(self):
        # Elk pack registers archery / rifle / spot_and_stalk /
        # public_land but NOT saddle.
        prompt = assemble_system_prompt(
            "elk",
            DUMMY_CONDITIONS,
            image_count=1,
            tier="pro",
            hunt_style="saddle",
        )
        assert isinstance(prompt, str) and len(prompt) > 500
        # Accept either (a) the neutral "unspecified" note, OR (b) the
        # block is absent entirely. In the current builder,
        # hunt_style_mod is None when the species has no matching
        # style — the builder therefore emits the "unspecified" note.
        assert ("HUNT STYLE CONTEXT: unspecified" in prompt
                or "HUNT STYLE CONTEXT:" not in prompt)
        # Make sure none of the other species' saddle content leaked
        # in (whitetail is the only pack with a saddle modifier).
        assert "Saddle (Whitetail)" not in prompt

    def test_elk_unknown_region_south_texas(self):
        # Elk registers mountain_west + plains only.
        prompt = assemble_system_prompt(
            "elk",
            DUMMY_CONDITIONS,
            image_count=1,
            tier="pro",
            manual_region_override="south_texas",
        )
        assert isinstance(prompt, str) and len(prompt) > 500
        # Graceful fallback — generic regional notice, no whitetail
        # south_texas content leakage.
        assert "REGIONAL CONTEXT: generic" in prompt
        assert "region_id=south_texas" in prompt
        assert "South Texas (Brush Country)" not in prompt

    def test_coyote_unknown_style_and_region(self):
        # Coyote registers rifle / archery / public_land only and
        # plains / southeast_us / mountain_west only. Both values
        # below are unknown to the coyote pack.
        prompt = assemble_system_prompt(
            "coyote",
            DUMMY_CONDITIONS,
            image_count=1,
            tier="pro",
            hunt_style="saddle",
            manual_region_override="east_texas",
        )
        assert isinstance(prompt, str) and len(prompt) > 500
        # Fallback notices (not crashes).
        assert "HUNT STYLE CONTEXT: unspecified" in prompt
        assert "REGIONAL CONTEXT: generic" in prompt
        assert "region_id=east_texas" in prompt
        # No cross-contamination from other packs.
        assert "Saddle (Whitetail)" not in prompt
        assert "East Texas / Piney Woods" not in prompt  # whitetail's

    def test_no_exception_on_unknown_combo_for_every_species(self):
        """Belt-and-braces: call the builder with garbage style+region
        across all 5 expanded species, assert nothing raises."""
        for sp in EXPECTED_HUNT_STYLES.keys():
            prompt = assemble_system_prompt(
                sp,
                DUMMY_CONDITIONS,
                image_count=1,
                tier="pro",
                hunt_style="banana_boat_method",
                manual_region_override="narnia",
            )
            assert isinstance(prompt, str) and len(prompt) > 500
