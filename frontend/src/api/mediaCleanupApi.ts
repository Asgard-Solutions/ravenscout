/**
 * Raven Scout — orphan S3 media cleanup API client.
 *
 * Wraps `POST /api/media/cleanup-orphans`, the Pro-tier-only endpoint
 * that sweeps S3 objects that were presigned-uploaded but never
 * committed to a saved hunt. The backend already enforces:
 *   - Pro-tier gate (returns 403 for non-Pro)
 *   - per-user scoping
 *   - 15-minute floor on `older_than_seconds` to respect presign TTL
 *   - defense-in-depth: never deletes a key referenced by a saved hunt
 *
 * This client never throws on the silent fire-and-forget path
 * (see `cleanupOrphanMediaSafe`); the manual button uses the
 * throwing version so the UI can render success / failure toasts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export interface CleanupOrphanMediaResult {
  ok: boolean;
  scanned: number;
  deleted: number;
  kept_committed: number;
  failed: Array<{ key: string; reason: string }>;
  older_than_seconds: number;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem('session_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Manual cleanup — throws on non-2xx so the UI can surface the error.
 *
 * @param olderThanSeconds Optional override (server floors at 900s).
 */
export async function cleanupOrphanMedia(
  olderThanSeconds?: number,
): Promise<CleanupOrphanMediaResult> {
  const headers = await authHeaders();
  const url = new URL(`${BACKEND_URL}/api/media/cleanup-orphans`);
  if (typeof olderThanSeconds === 'number' && Number.isFinite(olderThanSeconds)) {
    url.searchParams.set('older_than_seconds', String(Math.floor(olderThanSeconds)));
  }
  const res = await fetch(url.toString(), { method: 'POST', headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`cleanupOrphanMedia failed (${res.status}): ${body}`);
  }
  return res.json();
}

/**
 * Silent fire-and-forget cleanup for the on-launch path. Resolves with
 * the result on success or `null` on any failure (including 401/403,
 * network errors, and unconfigured S3) so the caller can ignore the
 * outcome without try/catch noise.
 */
export async function cleanupOrphanMediaSafe(
  olderThanSeconds?: number,
): Promise<CleanupOrphanMediaResult | null> {
  try {
    return await cleanupOrphanMedia(olderThanSeconds);
  } catch {
    return null;
  }
}
