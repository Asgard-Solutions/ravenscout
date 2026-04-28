// ============================================================
// Pending Hunt Assets — local stash between /setup and /results
// ============================================================
//
// The New Hunt flow (Task 4) collects user-provided GPS assets
// before the hunt has a server-side row. We can't POST them to
// /api/hunts/{id}/assets until the parent hunt has been written
// to the cloud (which happens during finalizeProvisionalHunt on
// the /results screen).
//
// This module stashes the in-progress asset payloads in
// AsyncStorage keyed by huntId so the /results screen can drain
// them after the hunt upsert succeeds. Idempotent: each entry has
// a stable client-side `localId` so retries never create dupes.
//
// On success, the entry is removed from the stash. On failure, it
// stays for a future retry. The stash is bounded by per-hunt
// keying — there is no app-wide growth path.

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HuntLocationAssetCreatePayload } from '../api/huntAssetsApi';

const STORAGE_KEY_PREFIX = 'rs:pendingHuntAssets:';

function storageKey(huntId: string): string {
  return `${STORAGE_KEY_PREFIX}${huntId}`;
}

export interface PendingHuntAsset extends HuntLocationAssetCreatePayload {
  /**
   * Stable local id minted at "add" time. Used by the UI for
   * edit/delete and by the drain step for idempotency.
   */
  localId: string;
}

function _genLocalId(): string {
  return `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makePendingAsset(
  payload: HuntLocationAssetCreatePayload,
): PendingHuntAsset {
  return { ...payload, localId: _genLocalId() };
}

export async function savePendingAssets(
  huntId: string,
  assets: PendingHuntAsset[],
): Promise<void> {
  if (!huntId) return;
  if (!assets || assets.length === 0) {
    // Empty list — clear any stale entry for this hunt.
    await AsyncStorage.removeItem(storageKey(huntId)).catch(() => undefined);
    return;
  }
  try {
    await AsyncStorage.setItem(storageKey(huntId), JSON.stringify(assets));
  } catch {
    // Best-effort. UI continues even if AsyncStorage is unavailable.
  }
}

export async function loadPendingAssets(
  huntId: string,
): Promise<PendingHuntAsset[]> {
  if (!huntId) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(huntId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive shape guard — drop entries that are missing fields.
    return parsed.filter(
      (a) =>
        a &&
        typeof a.localId === 'string' &&
        typeof a.type === 'string' &&
        typeof a.name === 'string' &&
        typeof a.latitude === 'number' &&
        typeof a.longitude === 'number',
    );
  } catch {
    return [];
  }
}

export async function clearPendingAssets(huntId: string): Promise<void> {
  if (!huntId) return;
  await AsyncStorage.removeItem(storageKey(huntId)).catch(() => undefined);
}

/**
 * Remove a specific subset of pending assets (by localId). Used by
 * the drain helper in /results.tsx to retire only the entries that
 * successfully posted, leaving any failures in place for retry.
 */
export async function removePendingAssets(
  huntId: string,
  localIdsToRemove: string[],
): Promise<void> {
  if (!huntId || localIdsToRemove.length === 0) return;
  const remaining = (await loadPendingAssets(huntId)).filter(
    (a) => !localIdsToRemove.includes(a.localId),
  );
  await savePendingAssets(huntId, remaining);
}
