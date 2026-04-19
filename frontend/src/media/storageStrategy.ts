// Raven Scout — Tier-aware storage strategy resolver.
//
// SUPPORTED RUNTIME: native mobile (iOS / Android) only.
//
// Tier mapping:
//   Core / Trial → local-uri  (Expo FileSystem)
//   Pro          → cloud-uri  (stubbed; backed by local FileSystem until
//                  the real cloud upload ships via CloudMediaStore)
//
// Platform input is accepted for API symmetry but intentionally
// ignored — there is only one production runtime.

import type { StorageStrategy } from './types';

export type Tier = 'trial' | 'core' | 'pro' | string;

export interface StrategyInput {
  tier: Tier | null | undefined;
  /** Accepted but ignored — mobile only. */
  platform?: string;
}

export interface StrategyResult {
  strategy: StorageStrategy;
  preferredBackend: 'filesystem' | 'cloud' | 'none';
  reason: string;
}

export function resolveStorageStrategy(input: StrategyInput): StrategyResult {
  const normalizedTier = (input.tier || 'trial').toLowerCase();

  if (normalizedTier === 'pro') {
    return {
      strategy: 'cloud-uri',
      preferredBackend: 'cloud',
      reason: 'pro-tier',
    };
  }

  // Core / Trial / unknown — device-local file storage.
  return {
    strategy: 'local-uri',
    preferredBackend: 'filesystem',
    reason: `${normalizedTier}-native`,
  };
}

/** Last-resort strategy when we can't store media at all. */
export const METADATA_ONLY_STRATEGY: StrategyResult = {
  strategy: 'metadata-only',
  preferredBackend: 'none',
  reason: 'fallback-metadata-only',
};
