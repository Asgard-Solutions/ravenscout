"""Tests for the canonical overlay taxonomy.

Guarantees:
  * Single source of truth — `overlay_taxonomy.OVERLAY_TYPES` is the
    authoritative list of overlay slug + label + color + icon.
  * Prompt wiring — the prompt builder embeds the OVERLAY TAXONOMY
    directive table including every type id and every canonical hex.
  * Validator wiring — `schema_validator.normalize_v2_response`
    stamps every overlay's `color` with the canonical hex regardless
    of what the LLM returned.
  * v1 compat — `convert_v2_to_v1` carries the canonical color
    through to the legacy shape so legacy clients also stay in sync.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from overlay_taxonomy import (
    OVERLAY_TYPE_IDS,
    OVERLAY_TYPES,
    OverlayType,
    get_overlay_type,
    overlay_color_for,
    render_overlay_type_directives_for_prompt,
    render_overlay_type_table_for_prompt,
)


# ----------------------------------------------------------------------
# Taxonomy invariants
# ----------------------------------------------------------------------


def test_taxonomy_has_eight_required_overlay_types():
    expected = {"stand", "corridor", "access_route", "avoid",
                "bedding", "food", "water", "trail"}
    assert set(OVERLAY_TYPE_IDS) == expected


@pytest.mark.parametrize("ovt", OVERLAY_TYPES, ids=lambda t: t.type_id)
def test_every_overlay_type_has_canonical_hex(ovt: OverlayType):
    # 6-char hex, starting with #.
    assert ovt.color.startswith("#"), ovt
    assert len(ovt.color) == 7, ovt
    int(ovt.color[1:], 16)            # raises if not hex


def test_overlay_color_for_returns_canonical_hex():
    assert overlay_color_for("stand") == "#2E7D32"
    assert overlay_color_for("corridor") == "#F57C00"
    assert overlay_color_for("access_route") == "#42A5F5"
    assert overlay_color_for("avoid") == "#C62828"


def test_overlay_color_for_unknown_type_returns_none():
    assert overlay_color_for("not_a_type") is None
    assert overlay_color_for("") is None
    assert overlay_color_for(None) is None        # type: ignore[arg-type]


# ----------------------------------------------------------------------
# Prompt wiring
# ----------------------------------------------------------------------


def test_prompt_directives_contain_every_type_and_hex():
    block = render_overlay_type_directives_for_prompt()
    for t in OVERLAY_TYPES:
        assert t.type_id in block, f"prompt missing type id {t.type_id}"
        assert t.color in block, f"prompt missing canonical hex {t.color} for {t.type_id}"
        assert t.label in block, f"prompt missing label {t.label!r}"


def test_prompt_table_renders_markdown_pipes():
    table = render_overlay_type_table_for_prompt()
    assert table.startswith("| type_id | label | geometry | color (hex) | description |")
    # one row per type + 2 header rows
    assert len(table.splitlines()) == len(OVERLAY_TYPES) + 2


def test_assemble_system_prompt_embeds_overlay_taxonomy():
    """The full assembled prompt must include the canonical overlay
    taxonomy block. This is the wiring that tells the LLM which
    overlay types are valid and which hex colour to echo for each."""
    from prompt_builder import assemble_system_prompt
    prompt = assemble_system_prompt(
        animal="deer",
        conditions={"hunt_date": "2026-11-15", "time_window": "morning"},
        image_count=1,
        tier="pro",
    )
    assert "OVERLAY TAXONOMY" in prompt
    # Every canonical hex must appear in the prompt.
    for t in OVERLAY_TYPES:
        assert t.color in prompt, f"prompt missing {t.color} for {t.type_id}"
    # Permitted slug list must appear as a pipe list.
    assert "stand|corridor|access_route|avoid|bedding|food|water|trail" in prompt


# ----------------------------------------------------------------------
# Validator wiring — color stamping is the contract that keeps the
# legend and the rendered overlay in lock-step.
# ----------------------------------------------------------------------


def test_validator_stamps_canonical_color_when_missing():
    from schema_validator import normalize_v2_response
    # LLM returned an overlay with no color field at all.
    raw = {
        "schema_version": "v2",
        "summary": "test",
        "evidence_strength": "moderate",
        "observations": [],
        "overlays": [{
            "id": "ov_1", "type": "stand", "label": "L", "reason": "R",
            "x_percent": 50, "y_percent": 50, "radius_percent": 4,
            "confidence": 0.7, "based_on": [],
        }],
        "top_setups": [],
        "wind_notes": [],
        "best_time": "",
        "key_assumptions": [],
        "species_tips": [],
    }
    norm, _errors = normalize_v2_response(raw)
    assert norm["overlays"][0]["color"] == "#2E7D32"


def test_validator_overwrites_wrong_color_with_canonical():
    from schema_validator import normalize_v2_response
    raw = {
        "schema_version": "v2",
        "summary": "test",
        "evidence_strength": "moderate",
        "observations": [],
        "overlays": [{
            "id": "ov_1", "type": "corridor", "label": "L", "reason": "R",
            "color": "rebeccapurple",                # invalid colour
            "x_percent": 50, "y_percent": 50, "radius_percent": 4,
            "confidence": 0.7, "based_on": [],
        }],
        "top_setups": [],
        "wind_notes": [],
        "best_time": "",
        "key_assumptions": [],
        "species_tips": [],
    }
    norm, _ = normalize_v2_response(raw)
    assert norm["overlays"][0]["color"] == "#F57C00"


def test_validator_stamps_color_for_all_eight_types():
    from schema_validator import normalize_v2_response
    raw = {
        "schema_version": "v2",
        "summary": "test",
        "evidence_strength": "moderate",
        "observations": [],
        "overlays": [
            {"id": f"ov_{i}", "type": t, "label": "L", "reason": "R",
             "x_percent": 50, "y_percent": 50, "radius_percent": 4,
             "confidence": 0.7, "based_on": []}
            for i, t in enumerate(OVERLAY_TYPE_IDS)
        ],
        "top_setups": [],
        "wind_notes": [],
        "best_time": "",
        "key_assumptions": [],
        "species_tips": [],
    }
    norm, _ = normalize_v2_response(raw)
    assert len(norm["overlays"]) == len(OVERLAY_TYPE_IDS)
    for ov in norm["overlays"]:
        assert ov["color"] == overlay_color_for(ov["type"])


# ----------------------------------------------------------------------
# v1 compat
# ----------------------------------------------------------------------


def test_v1_conversion_carries_canonical_color():
    from schema_validator import convert_v2_to_v1
    v2 = {
        "overlays": [{
            "id": "ov_1", "type": "avoid", "label": "Posted",
            "reason": "boundary", "x_percent": 50, "y_percent": 50,
            "radius_percent": 6, "confidence": 0.5, "based_on": [],
        }],
        "summary": "x", "wind_notes": [], "best_time": "",
        "key_assumptions": [], "species_tips": [], "top_setups": [],
    }
    v1 = convert_v2_to_v1(v2)
    assert v1["overlays"][0]["color"] == "#C62828"
