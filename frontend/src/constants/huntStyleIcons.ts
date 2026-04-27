/**
 * Per-hunt-style custom icon image overrides for the New Hunt setup
 * screen (Step 1 Weapon, Step 2 Method).
 *
 * Mirrors the species-icon override pattern in `speciesIcons.ts`:
 * each style (`archery` / `rifle` / `shotgun` / `blind` / `saddle` /
 * `spot_and_stalk`) ships a gold (active) and white (inactive) PNG.
 * The setup screen checks this map first; styles without an entry
 * fall back to their Ionicons glyph.
 *
 * Add a new style by:
 *   1. Dropping a transparent PNG pair under
 *      `/app/frontend/assets/icons/species/`.
 *   2. Adding a `<hunt_style_id>: { active, inactive }` entry below.
 */

import type { ImageSourcePropType } from 'react-native';

export interface HuntStyleIconImagePair {
  active: ImageSourcePropType;
  inactive: ImageSourcePropType;
}

export const HUNT_STYLE_ICON_IMAGES: Record<string, HuntStyleIconImagePair> = {
  // Weapons (Step 1)
  archery: {
    active: require('../../assets/icons/species/archery-gold.png'),
    inactive: require('../../assets/icons/species/archery-white.png'),
  },
  rifle: {
    active: require('../../assets/icons/species/rifle-gold.png'),
    inactive: require('../../assets/icons/species/rifle-white.png'),
  },
  shotgun: {
    active: require('../../assets/icons/species/shotgun-gold.png'),
    inactive: require('../../assets/icons/species/shotgun-white.png'),
  },

  // Methods (Step 2)
  blind: {
    active: require('../../assets/icons/species/blind-gold.png'),
    inactive: require('../../assets/icons/species/blind-white.png'),
  },
  saddle: {
    active: require('../../assets/icons/species/saddle-gold.png'),
    inactive: require('../../assets/icons/species/saddle-white.png'),
  },
  // Canonical hunt-style id is `spot_and_stalk`; the brand asset
  // shortens that to `stalk-*`.
  spot_and_stalk: {
    active: require('../../assets/icons/species/stalk-gold.png'),
    inactive: require('../../assets/icons/species/stalk-white.png'),
  },
};

export function getHuntStyleIconImage(styleId: string | null | undefined): HuntStyleIconImagePair | null {
  if (!styleId) return null;
  return HUNT_STYLE_ICON_IMAGES[styleId] || null;
}
