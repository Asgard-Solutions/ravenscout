// Raven Scout — Tier-aware image compression + thumbnail generation.

import * as ImageManipulator from 'expo-image-manipulator';
import {
  PROFILE_PRO,
  PROFILE_CORE,
  PROFILE_THUMBNAIL,
  profileForTier,
  type CompressProfile,
} from './imageProfiles';
import { shouldSkipCompression, probeImage } from './imageProbe';

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
  /**
   * True when actual recompression occurred. False when we returned
   * the input unchanged (already within profile, or compression failed).
   */
  compressed: boolean;
  /** True when compression failed and we kept the original. */
  failed: boolean;
}

function approxBase64Bytes(b64: string): number {
  const comma = b64.indexOf(',');
  const payload = comma >= 0 ? b64.slice(comma + 1) : b64;
  const padding = (payload.match(/=+$/) || [''])[0].length;
  return Math.floor((payload.length * 3) / 4) - padding;
}

function ensureDataUri(b64OrDataUri: string, mime: string): string {
  return b64OrDataUri.startsWith('data:') ? b64OrDataUri : `data:${mime};base64,${b64OrDataUri}`;
}

/**
 * Compress a base64/data-URI image using the given profile.
 *
 * Skip-recompression guardrail: if the input is already a JPEG within
 * the profile's max-dim and reasonable byte budget, we return the
 * input untouched. This avoids double-compression artifacts and saves
 * processing time.
 *
 * RESIZE CONTRACT: `maxDim` applies to the LONGER dimension. A very
 * tall portrait (e.g. 2048×4437) decodes to ~36MB of bitmap memory
 * when rendered on low-end devices and will crash mobile Chrome tabs.
 * We always pass BOTH width and height to ImageManipulator so the
 * manipulator picks the correct scaling axis and the shorter
 * dimension scales proportionally.
 */
export async function compressImage(
  input: string,
  profile: CompressProfile,
): Promise<CompressedImage> {
  const mime = 'image/jpeg';

  // 1) Cheap header probe → maybe skip work entirely. We only skip
  // when BOTH axes are within maxDim; otherwise a portrait
  // screenshot could sneak through (width OK, height blown).
  const skip = shouldSkipCompression(input, { maxDim: profile.maxDim });
  const bothAxesOk =
    skip.probe &&
    skip.probe.width <= profile.maxDim &&
    skip.probe.height <= profile.maxDim;
  if (skip.skip && bothAxesOk) {
    const dataUri = ensureDataUri(input, mime);
    return {
      dataUri,
      width: skip.probe!.width,
      height: skip.probe!.height,
      bytes: skip.probe!.bytes,
      mime,
      compressed: false,
      failed: false,
    };
  }

  // 2) Otherwise: full compression pass. Pass both axes as caps so
  // the manipulator fits-inside the box rather than stretching one
  // dimension.
  try {
    const result = await ImageManipulator.manipulateAsync(
      input,
      [{ resize: { width: profile.maxDim, height: profile.maxDim } }],
      {
        compress: profile.quality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    const b64 = result.base64 || '';
    const dataUri = ensureDataUri(b64, mime);
    return {
      dataUri,
      width: result.width,
      height: result.height,
      bytes: approxBase64Bytes(b64),
      mime,
      compressed: true,
      failed: false,
    };
  } catch {
    // Compression failed → fall back to the original input. Caller can
    // inspect `failed` to decide whether to skip dependent work
    // (e.g. thumbnail generation).
    const probe = probeImage(input);
    return {
      dataUri: input.startsWith('data:') ? input : ensureDataUri(input, mime),
      width: probe?.width || 0,
      height: probe?.height || 0,
      bytes: probe?.bytes || approxBase64Bytes(input),
      mime,
      compressed: false,
      failed: true,
    };
  }
}

/**
 * Generate a small thumbnail. Returns `failed: true` when the input
 * could not be processed — callers should treat this as "no thumbnail
 * for this asset" and leave `thumbnailRef` undefined rather than
 * pointing at a degraded copy.
 */
export async function buildThumbnail(input: string): Promise<CompressedImage> {
  const result = await compressImage(input, PROFILE_THUMBNAIL);
  // Even on the "skip" path, a 160px asset wouldn't normally be skipped
  // (most inputs are larger), so `compressed=false` here strongly
  // implies a failure.
  return result;
}
