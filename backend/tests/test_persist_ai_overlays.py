"""Unit tests for persist_ai_overlays helpers (Task 11 follow-up).

These cover only the pure-function bits of the AI-overlay persistence
helper — the legacy-type → AnalysisOverlayItemType mapping and the
confidence string→float conversion. The DB-touching async pathway is
already covered by the live integration test in
tests/test_e2e_geo_overlay_pipeline.py.
"""
from __future__ import annotations

import pytest

from persist_ai_overlays import (
    _CONFIDENCE_MAP,
    _TYPE_MAP,
    _percent_to_pixel,
    _to_confidence_float,
)
from models import ANALYSIS_OVERLAY_ITEM_TYPES


# =====================================================================
# Type mapping coverage
# =====================================================================


def test_type_map_targets_are_all_valid_analysis_types():
    """Every legacy id in _TYPE_MAP must point at a real
    AnalysisOverlayItemType — otherwise the create payload would
    422 inside the normalizer.
    """
    for legacy_id, new_id in _TYPE_MAP.items():
        assert new_id in ANALYSIS_OVERLAY_ITEM_TYPES, (
            f"_TYPE_MAP['{legacy_id}'] -> '{new_id}' is not a valid "
            "AnalysisOverlayItemType"
        )


def test_type_map_covers_every_legacy_overlay_type():
    """The 8 legacy AI overlay types must all map to something."""
    legacy_ids = {
        "stand", "corridor", "access_route", "avoid",
        "bedding", "food", "water", "trail",
    }
    missing = legacy_ids - set(_TYPE_MAP.keys())
    assert not missing, f"Missing legacy ids in _TYPE_MAP: {missing}"


@pytest.mark.parametrize(
    "legacy,new",
    [
        ("stand", "stand"),
        ("corridor", "travel_corridor"),
        ("access_route", "access_point"),
        ("avoid", "avoid_area"),
        ("bedding", "bedding"),
        ("food", "feeder"),
        ("water", "water"),
        ("trail", "route"),
    ],
)
def test_type_map_specific_pairs(legacy, new):
    assert _TYPE_MAP[legacy] == new


# =====================================================================
# Confidence conversion
# =====================================================================


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("high", 0.9),
        ("HIGH", 0.9),
        (" High ", 0.9),
        ("medium", 0.6),
        ("med", 0.6),
        ("moderate", 0.6),
        ("low", 0.3),
    ],
)
def test_confidence_string_to_float(raw, expected):
    assert _to_confidence_float(raw) == expected


def test_confidence_unknown_string_is_none():
    assert _to_confidence_float("definitely-bogus") is None


def test_confidence_numeric_in_range_passes_through():
    assert _to_confidence_float(0.42) == 0.42
    assert _to_confidence_float(1.0) == 1.0
    assert _to_confidence_float(0) == 0


def test_confidence_percentage_clamped_to_unit():
    """If someone sends 0..100, accept it as a percentage."""
    v = _to_confidence_float(85)
    assert v is not None and abs(v - 0.85) < 1e-9


def test_confidence_negative_or_huge_returns_none():
    assert _to_confidence_float(-1) is None
    assert _to_confidence_float(101) is None


def test_confidence_none_passes_through():
    assert _to_confidence_float(None) is None


# =====================================================================
# Percent to pixel
# =====================================================================


@pytest.mark.parametrize(
    "percent,dim,expected",
    [
        (0, 1000, 0),
        (50, 1000, 500),
        (100, 1000, 1000),
        (25.5, 800, 204),
    ],
)
def test_percent_to_pixel_canonical(percent, dim, expected):
    out = _percent_to_pixel(percent, dim)
    assert out is not None and abs(out - expected) < 1e-9


def test_percent_to_pixel_zero_dim_returns_none():
    assert _percent_to_pixel(50, 0) is None
    assert _percent_to_pixel(50, -1) is None


def test_percent_to_pixel_none_inputs():
    assert _percent_to_pixel(None, 1000) is None
    assert _percent_to_pixel(50, None) is None


def test_percent_to_pixel_garbage_inputs():
    assert _percent_to_pixel("xx", 1000) is None
    assert _percent_to_pixel(50, "xx") is None
