"""Raven Scout — Hunt-style modifier resolution for prompt packs.

Canonical, user-chosen hunting method. Keyed to a small, stable set
of ids so freeform display text never leaks into the prompt pipeline:

    archery           Bow / crossbow — short effective shot range, cover-line sensitive.
    rifle             Centerfire / muzzleloader — extended effective shot range, glassing-friendly.
    blind             Ground blind / enclosed stand — high concealment, low mobility.
    saddle            Mobile tree-saddle — high mobility, narrow shooting window, cover-line entry.
    public_land       Public / heavily-pressured property — pressure-sensitive, quiet access dominant.
    spot_and_stalk    Active glassing / stalking — terrain-covering, no fixed stand.

Resolution is deliberately conservative: unknown / empty input
returns None and the prompt emits a neutral "unspecified" notice.
Selection is by canonical id only — normalize user input upstream.
"""

from __future__ import annotations

from typing import Mapping, Optional

from .pack import HuntStyleModifier, SpeciesPromptPack

# ---------- canonical labels ----------

CANONICAL_HUNT_STYLES: Mapping[str, str] = {
    "archery":         "Archery",
    "rifle":           "Rifle",
    "shotgun":         "Shotgun",
    "blind":           "Ground Blind",
    "saddle":          "Tree Saddle",
    "public_land":     "Public Land",
    "spot_and_stalk":  "Spot-and-Stalk",
}


def get_hunt_style_label(style_id: Optional[str]) -> Optional[str]:
    if not style_id:
        return None
    return CANONICAL_HUNT_STYLES.get(style_id)


# ---------- freeform input normalization ----------

# Normalized-alias token -> canonical style id. Keys are the
# lowercase / whitespace-collapsed / punctuation-stripped form of
# common user inputs. This is the ONLY layer allowed to accept
# freeform text; everything downstream of `normalize_hunt_style`
# operates on canonical ids only.
_ALIAS_MAP: Mapping[str, str] = {
    # Archery
    "archery": "archery",
    "bow": "archery",
    "bow hunting": "archery",
    "bowhunting": "archery",
    "compound": "archery",
    "compound bow": "archery",
    "recurve": "archery",
    "traditional": "archery",
    "crossbow": "archery",

    # Rifle (centerfire / muzzleloader — long, precise rounds)
    "rifle": "rifle",
    "gun": "rifle",
    "firearm": "rifle",
    "centerfire": "rifle",
    "muzzleloader": "rifle",
    "muzzle loader": "rifle",
    "black powder": "rifle",
    "blackpowder": "rifle",

    # Shotgun (its own canonical id — short-to-mid range, dense-cover
    # capable, slug or shot). Behaviorally distinct from rifle: tighter
    # effective range, more cover-tolerant, often the only legal firearm
    # in shotgun-only seasons / counties.
    "shotgun": "shotgun",
    "shot gun": "shotgun",
    "slug gun": "shotgun",
    "slug": "shotgun",
    "scattergun": "shotgun",
    "smoothbore": "shotgun",

    # Blind
    "blind": "blind",
    "ground blind": "blind",
    "ground-blind": "blind",
    "box blind": "blind",
    "pop up blind": "blind",
    "popup blind": "blind",
    "tower blind": "blind",
    "elevated blind": "blind",

    # Saddle
    "saddle": "saddle",
    "tree saddle": "saddle",
    "saddle hunting": "saddle",
    "saddle hunter": "saddle",
    "mobile saddle": "saddle",

    # Public land
    "public": "public_land",
    "public land": "public_land",
    "public-land": "public_land",
    "publicland": "public_land",
    "public ground": "public_land",
    "public property": "public_land",
    "state land": "public_land",
    "national forest": "public_land",
    "blm": "public_land",
    "wma": "public_land",

    # Spot and stalk
    "spot and stalk": "spot_and_stalk",
    "spot & stalk": "spot_and_stalk",
    "spot n stalk": "spot_and_stalk",
    "stalk": "spot_and_stalk",
    "stalking": "spot_and_stalk",
    "still hunt": "spot_and_stalk",
    "still hunting": "spot_and_stalk",
    "glassing": "spot_and_stalk",

    # Canonical pass-through (from admin / API inputs)
    "archery_": "archery",
    "rifle_": "rifle",
    "shotgun_": "shotgun",
    "blind_": "blind",
    "saddle_": "saddle",
    "public_land": "public_land",
    "spot_and_stalk": "spot_and_stalk",
}


def _norm(s: str) -> str:
    if not s:
        return ""
    s = s.strip().lower()
    s = s.replace("-", " ").replace("_", " ").replace("'", "").replace(".", "")
    return " ".join(s.split())


def normalize_hunt_style(style_input: Optional[str]) -> Optional[str]:
    """Return a canonical hunt-style id for freeform input, or None.

    Accepts canonical ids, display labels, and common aliases. Any
    unrecognized input returns None so callers can fall back to the
    neutral 'unspecified' notice in the prompt.
    """
    if not style_input or not isinstance(style_input, str):
        return None
    key = _norm(style_input)
    if not key:
        return None
    if key in _ALIAS_MAP:
        return _ALIAS_MAP[key]
    # Also try the pure canonical id form (underscores intact).
    us = key.replace(" ", "_")
    if us in CANONICAL_HUNT_STYLES:
        return us
    return None


# ---------- resolver ----------


def resolve_hunt_style_modifier(
    species_pack: SpeciesPromptPack,
    style_id: Optional[str],
) -> Optional[HuntStyleModifier]:
    """Return the species' hunt-style modifier for `style_id`, or None.

    `style_id` MUST be a canonical id (see `CANONICAL_HUNT_STYLES`).
    Freeform text must be normalized via `normalize_hunt_style`
    before reaching this function. Unknown canonical ids return
    None so the prompt emits a neutral 'unspecified' notice.
    """
    if not species_pack or not species_pack.hunt_style_modifiers:
        return None
    if not style_id or style_id not in CANONICAL_HUNT_STYLES:
        return None
    return species_pack.hunt_style_modifiers.get(style_id)
