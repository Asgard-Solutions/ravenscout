/**
 * Per-species custom icon image overrides for the New Hunt species
 * picker.
 *
 * Most species render their card icon from the `icon` field on
 * `SpeciesConfig` (an Ionicons glyph name). Species that ship a
 * dedicated brand illustration register a pair of PNGs here:
 *
 *   {
 *     active:   require('...gold variant'),   // selected state
 *     inactive: require('...white variant'),  // default state
 *   }
 *
 * The setup screen prefers this image when present and falls back to
 * the Ionicon glyph otherwise. Designers can add new species by:
 *   1. Dropping the two transparent PNGs under
 *      `/app/frontend/assets/icons/species/`.
 *   2. Adding a `<species_id>: { active, inactive }` entry below.
 *
 * Both PNGs should:
 *   * Be square, transparent background, monochrome silhouettes.
 *   * Match the existing 32 px icon footprint inside the
 *     `speciesIconContainer`.
 *   * Use the existing brand gold for the active variant and pure
 *     white for the inactive variant so contrast stays consistent.
 */

import type { ImageSourcePropType } from 'react-native';

export interface SpeciesIconImagePair {
  /** Asset rendered when the species card is the active selection. */
  active: ImageSourcePropType;
  /** Asset rendered for the default (unselected, unlocked) state. */
  inactive: ImageSourcePropType;
}

export const SPECIES_ICON_IMAGES: Record<string, SpeciesIconImagePair> = {
  // Whitetail / mule deer share the same `deer` species id on the
  // backend registry, so the same custom icon applies to both.
  deer: {
    active: require('../../assets/icons/species/deer-gold.png'),
    inactive: require('../../assets/icons/species/deer-white.png'),
  },
};

/** Lookup helper — returns null when the species has no custom image
 *  override and the caller should fall back to the Ionicon glyph. */
export function getSpeciesIconImage(speciesId: string | null | undefined): SpeciesIconImagePair | null {
  if (!speciesId) return null;
  return SPECIES_ICON_IMAGES[speciesId] || null;
}
