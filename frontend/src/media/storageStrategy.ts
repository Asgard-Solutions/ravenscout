// Raven Scout — Tier-aware storage strategy resolver.
//
// Single source of truth. Do not re-derive tier→strategy mappings
// anywhere else in the codebase.

import type { StorageStrategy } from './types';

export type Tier = 'trial' | 'core' | 'pro' | string;
export type PlatformName = 'ios' | 'android' | 'web' | string;

export interface StrategyInput {
  tier: Tier | null | undefined;
  platform: PlatformName;
}

export interface StrategyResult {
  strategy: StorageStrategy;
  /**
   * The *effective* backing store. For Pro we want 'cloud' long-term
   * but currently fall back to local storage until real cloud upload
   * is wired in (see CloudMediaStore TODO).
   */
  preferredBackend: 'filesystem' | 'indexeddb' | 'cloud' | 'none';
  reason: string;
}

export function resolveStorageStrategy(input: StrategyInput): StrategyResult {
  const { tier, platform } = input;
  const normalizedTier = (tier || 'trial').toLowerCase();

  if (normalizedTier === 'pro') {
    return {
      strategy: 'cloud-uri',
      preferredBackend: 'cloud',
      reason: 'pro-tier',
    };
  }

  // Core / Trial / unknown — local media storage.
  if (platform === 'web') {
    return {
      strategy: 'local-uri',
      preferredBackend: 'indexeddb',
      reason: `${normalizedTier}-web`,
    };
  }
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
