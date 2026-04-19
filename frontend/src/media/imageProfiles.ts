// Raven Scout — Tier-aware image-compression profiles (PURE).
//
// Separated from imageProcessor.ts so it can be unit-tested in Node
// without pulling in `expo-image-manipulator`.

import type { Tier } from './storageStrategy';

export interface CompressProfile {
  maxDim: number;
  quality: number;
}

export const PROFILE_PRO: CompressProfile = { maxDim: 2048, quality: 0.85 };
export const PROFILE_CORE: CompressProfile = { maxDim: 1280, quality: 0.70 };
export const PROFILE_THUMBNAIL: CompressProfile = { maxDim: 160, quality: 0.50 };

export function profileForTier(tier: Tier | null | undefined): CompressProfile {
  return (tier || '').toLowerCase() === 'pro' ? PROFILE_PRO : PROFILE_CORE;
}
