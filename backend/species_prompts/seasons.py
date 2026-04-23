"""Seasonal modifier selection for species prompt packs.

Keeps all season-inference logic in one place. The selector is
intentionally conservative: when data is missing or ambiguous, it
returns None so the prompt emits a neutral "unavailable" notice
instead of guessing.

Inputs consumed from the shared `conditions` dict:
    - hunt_date         e.g. "2026-11-12"  (YYYY-MM-DD preferred)
    - temperature       e.g. 42, "42F", "42 °F", "-3 C", "24 c"
    - region            free-form string (advisory)
    - time_window       "morning"/"evening"/... (supporting signal only)

All reasoning is calibrated to Northern Hemisphere US hunting seasons.
Extending to the Southern Hemisphere or a regional calendar is a
future concern (see `memory/species_prompt_packs_notes.md`).
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Mapping, Optional

from .pack import SeasonalModifier, SpeciesPromptPack


# ----------------------------- input parsing -----------------------------

_DATE_PATTERNS = (
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%m/%d/%Y",
    "%m-%d-%Y",
)


def _parse_hunt_date(value: Any) -> Optional[date]:
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    for pat in _DATE_PATTERNS:
        try:
            return datetime.strptime(s, pat).date()
        except ValueError:
            continue
    return None


_TEMP_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s*([cCfF])?")


def _parse_temperature_f(value: Any) -> Optional[float]:
    """Return temperature in Fahrenheit or None.

    Accepts integers, floats, and strings like "42", "42F", "42 °F",
    "3 C", "-2c". Ambiguous / unparseable inputs → None.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    m = _TEMP_RE.search(value)
    if not m:
        return None
    try:
        n = float(m.group(1))
    except ValueError:
        return None
    unit = (m.group(2) or "").upper()
    if unit == "C":
        return n * 9.0 / 5.0 + 32.0
    return n  # default F when unit missing or F


# ----------------------------- trigger evaluation -----------------------------


def _month_matches(modifier: SeasonalModifier, month: Optional[int]) -> bool:
    months = modifier.trigger_rules.get("months")
    if not months:
        return False
    return month in months


def _temp_matches(modifier: SeasonalModifier, temp_f: Optional[float]) -> bool:
    tr = modifier.trigger_rules
    lo = tr.get("min_temp_f")
    hi = tr.get("max_temp_f")
    if lo is None and hi is None:
        return False
    if temp_f is None:
        return False
    if lo is not None and temp_f < lo:
        return False
    if hi is not None and temp_f > hi:
        return False
    return True


def _logic_for(modifier: SeasonalModifier) -> str:
    """Return how the trigger should evaluate: 'month', 'temp', 'either', 'both'."""
    return modifier.trigger_rules.get("logic", "month")


def _matches(modifier: SeasonalModifier, month: Optional[int], temp_f: Optional[float]) -> bool:
    logic = _logic_for(modifier)
    m = _month_matches(modifier, month)
    t = _temp_matches(modifier, temp_f)
    if logic == "month":
        return m
    if logic == "temp":
        return t
    if logic == "either":
        return m or t
    if logic == "both":
        return m and t
    return m


# ----------------------------- selector -----------------------------


def resolve_seasonal_modifier(
    species_pack: SpeciesPromptPack,
    conditions: Optional[Mapping[str, Any]] = None,
) -> Optional[SeasonalModifier]:
    """Return the seasonal modifier whose trigger rules match, or None.

    Deterministic tie-breaking: the first declared modifier wins,
    so pack authors should order `seasonal_modifiers` from most
    specific to most general.
    """
    if not species_pack or not species_pack.seasonal_modifiers:
        return None

    conditions = conditions or {}
    month: Optional[int] = None
    d = _parse_hunt_date(conditions.get("hunt_date"))
    if d:
        month = d.month
    temp_f = _parse_temperature_f(conditions.get("temperature"))

    # When neither signal is usable, bail — don't guess.
    if month is None and temp_f is None:
        return None

    for mod in species_pack.seasonal_modifiers.values():
        if _matches(mod, month, temp_f):
            return mod
    return None
