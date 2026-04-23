// Raven Scout — Provisional (hot-cache) hunt store.
//
// A tiny single-entry AsyncStorage bucket for the MOST RECENT
// just-analyzed hunt. Exists as a durable tier-0.5 fallback between
// the in-memory session store (which is lost on tab reshuffle,
// bfcache, or mobile memory pressure) and the full analysisStore
// (which can fail on web previews with no writable filesystem and
// on mobile Chrome with a ~5MB localStorage cap).
//
// IMPORTANT: unlike analysisStore, this bucket is ALLOWED to hold
// base64 display URIs — that's what makes it a usable fallback
// when MediaStore is unavailable. The payload is soft-capped and
// rotated to exactly 1 entry so the store never grows.
//
// Read precedence in hydrateHuntResult:
//   1. in-memory singleton   (fastest, session-scoped)
//   2. provisional store     (this file — survives reload/bfcache)
//   3. analysisStore          (full history, base64-stripped)
//   4. legacy v1/v2 migration
//
// A provisional record is UPGRADED to an analysisStore record by
// the saveHunt pipeline whenever the real persistence succeeds,
// after which the provisional entry is cleared.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedHuntAnalysis, RuntimeHunt } from './types';

export const PROVISIONAL_HUNT_KEY = 'raven_provisional_hunt_v1';

export interface ProvisionalHuntEntry {
  schema: 'raven.provisional.v1';
  huntId: string;
  createdAt: string;
  /** The full analysis record (includes metadata, analysisContext, etc.). */
  analysis: PersistedHuntAnalysis;
  /**
   * imageId -> base64 data URI. Keyed by the SAME provisional /
   * persisted imageIds used in `analysis.mediaRefs`.
   */
  displayUris: Record<string, string>;
  /**
   * Approximate size of the serialized entry — logged on write so
   * quota failures surface with context rather than as mysterious
   * "hunt_not_found".
   */
  approxBytes: number;
}

function approxSize(obj: unknown): number {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}

export async function writeProvisionalHunt(
  huntId: string,
  analysis: PersistedHuntAnalysis,
  displayUris: Record<string, string>,
): Promise<{ ok: boolean; bytes: number; error?: string }> {
  const entry: ProvisionalHuntEntry = {
    schema: 'raven.provisional.v1',
    huntId,
    createdAt: new Date().toISOString(),
    analysis,
    displayUris,
    approxBytes: 0,
  };
  entry.approxBytes = approxSize(entry);
  try {
    await AsyncStorage.setItem(PROVISIONAL_HUNT_KEY, JSON.stringify(entry));
    return { ok: true, bytes: entry.approxBytes };
  } catch (err: any) {
    return {
      ok: false,
      bytes: entry.approxBytes,
      error: err?.message || String(err),
    };
  }
}

export async function readProvisionalHunt(
  huntId: string,
): Promise<ProvisionalHuntEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(PROVISIONAL_HUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== 'raven.provisional.v1') return null;
    if (parsed.huntId !== huntId) return null;
    return parsed as ProvisionalHuntEntry;
  } catch {
    return null;
  }
}

export async function clearProvisionalHunt(matchingHuntId?: string): Promise<void> {
  try {
    if (matchingHuntId) {
      const raw = await AsyncStorage.getItem(PROVISIONAL_HUNT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.huntId !== matchingHuntId) return;
    }
    await AsyncStorage.removeItem(PROVISIONAL_HUNT_KEY);
  } catch {
    /* no-op */
  }
}

/** Adapt a provisional entry into a RuntimeHunt for hydration use. */
export function provisionalToRuntime(entry: ProvisionalHuntEntry): RuntimeHunt {
  return {
    ...entry.analysis,
    displayUris: entry.displayUris,
  };
}
