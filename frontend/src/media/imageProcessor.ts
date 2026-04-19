// Raven Scout — Tier-aware image compression + thumbnail generation.
//
// Uses expo-image-manipulator to resize + re-encode JPEGs BEFORE they
// hit the MediaStore. Keeps device disk usage bounded and cuts the
// base64 memory footprint during analysis.
//
// Profiles:
//   Pro        → 2048 max dim, JPEG quality 0.85
//   Core/Trial → 1280 max dim, JPEG quality 0.70
//
// Thumbnails: a separate 160×160 JPEG quality 0.50 derived from the
// primary, intended for history cards.

import * as ImageManipulator from 'expo-image-manipulator';
import {
  PROFILE_PRO,
  PROFILE_CORE,
  PROFILE_THUMBNAIL,
  profileForTier,
  type CompressProfile,
} from './imageProfiles';

export {
  PROFILE_PRO,
  PROFILE_CORE,
  PROFILE_THUMBNAIL,
  profileForTier,
  type CompressProfile,
};

export interface CompressedImage {
  /** Always a data URI ready for MediaStore ingestion. */
  dataUri: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
}

function approxBase64Bytes(b64: string): number {
  const comma = b64.indexOf(',');
  const payload = comma >= 0 ? b64.slice(comma + 1) : b64;
  const padding = (payload.match(/=+$/) || [''])[0].length;
  return Math.floor((payload.length * 3) / 4) - padding;
}

/**
 * Compress a base64/data-URI image using the given profile. Returns a
 * new data URI ready to be stored via MediaStore.
 *
 * If expo-image-manipulator fails for any reason, returns the input
 * untouched so ingestion still proceeds (we'd rather over-store than
 * fail the hunt).
 */
export async function compressImage(
  input: string,
  profile: CompressProfile,
): Promise<CompressedImage> {
  const mime = 'image/jpeg';
  try {
    const result = await ImageManipulator.manipulateAsync(
      input,
      [{ resize: { width: profile.maxDim } }],
      {
        compress: profile.quality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    const b64 = result.base64 || '';
    const dataUri = b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`;
    return {
      dataUri,
      width: result.width,
      height: result.height,
      bytes: approxBase64Bytes(b64),
      mime,
    };
  } catch {
    return {
      dataUri: input,
      width: 0,
      height: 0,
      bytes: approxBase64Bytes(input),
      mime,
    };
  }
}

/**
 * Generate a small square-ish thumbnail from an input image. Used by
 * the history screen to avoid loading the full asset.
 */
export async function buildThumbnail(input: string): Promise<CompressedImage> {
  return compressImage(input, PROFILE_THUMBNAIL);
}
