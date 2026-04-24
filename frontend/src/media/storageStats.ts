// Raven Scout — local storage statistics + cleanup helpers.
//
// Thin layer on top of mediaIndex + mediaStore that the Profile screen
// uses to surface "X images stored, Y MB used, oldest on Z date" and
// to run cleanups ("delete anything older than N days") without
// touching the hunt analysis records.
//
// All operations are best-effort; anything that throws returns a safe
// fallback so the profile UI never blocks on disk errors.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { listAllIndexedMedia, removeMediaFromIndex } from './mediaIndex';
import type { MediaAsset } from './types';
import { clearAllDeviceMedia } from './mediaStore';

const CLEANUP_INTERVAL_KEY = 'raven_cleanup_interval_days_v1';
const LAST_CLEANUP_KEY = 'raven_cleanup_last_run_v1';

export const CLEANUP_INTERVAL_OPTIONS = [7, 14, 30, 60, 90] as const;
export type CleanupInterval = typeof CLEANUP_INTERVAL_OPTIONS[number];
export const DEFAULT_CLEANUP_INTERVAL: CleanupInterval = 30;

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

export async function getCleanupInterval(): Promise<CleanupInterval> {
  try {
    const raw = await AsyncStorage.getItem(CLEANUP_INTERVAL_KEY);
    if (!raw) return DEFAULT_CLEANUP_INTERVAL;
    const n = parseInt(raw, 10);
    return (CLEANUP_INTERVAL_OPTIONS as readonly number[]).includes(n)
      ? (n as CleanupInterval)
      : DEFAULT_CLEANUP_INTERVAL;
  } catch {
    return DEFAULT_CLEANUP_INTERVAL;
  }
}

export async function setCleanupInterval(days: CleanupInterval): Promise<void> {
  try {
    await AsyncStorage.setItem(CLEANUP_INTERVAL_KEY, String(days));
  } catch {
    /* best-effort */
  }
}

async function getLastCleanupRunIso(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_CLEANUP_KEY);
  } catch {
    return null;
  }
}

async function markCleanupRun(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_CLEANUP_KEY, new Date().toISOString());
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------

export interface StorageStats {
  imageCount: number;
  bytesUsed: number;            // summed MediaAsset.bytes
  oldestCreatedAt: string | null;
  /** Includes primary + thumbnail + context frames — anything indexed. */
  assets: MediaAsset[];
  /** ISO date the cleanup last ran (or null if never). */
  lastCleanupAt: string | null;
  /**
   * Projected next scheduled run based on the current interval.
   * `null` if cleanup has never been run — UX prefers "when you tap
   * Clean Up, today counts as the new baseline" to showing a stale date.
   */
  nextScheduledCleanupAt: string | null;
}

function _safeDate(d: string | undefined | null): number | null {
  if (!d) return null;
  const n = Date.parse(d);
  return Number.isFinite(n) ? n : null;
}

export async function getStorageStats(): Promise<StorageStats> {
  let assets: MediaAsset[] = [];
  try {
    assets = await listAllIndexedMedia();
  } catch {
    assets = [];
  }

  let bytesUsed = 0;
  let oldestMs: number | null = null;
  for (const a of assets) {
    if (typeof a.bytes === 'number' && Number.isFinite(a.bytes)) bytesUsed += a.bytes;
    const t = _safeDate(a.createdAt);
    if (t !== null && (oldestMs === null || t < oldestMs)) oldestMs = t;
  }

  const lastCleanupAt = await getLastCleanupRunIso();
  const interval = await getCleanupInterval();
  const nextScheduledCleanupAt = lastCleanupAt
    ? new Date(Date.parse(lastCleanupAt) + interval * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return {
    imageCount: assets.length,
    bytesUsed,
    oldestCreatedAt: oldestMs !== null ? new Date(oldestMs).toISOString() : null,
    assets,
    lastCleanupAt,
    nextScheduledCleanupAt,
  };
}

// ---------------------------------------------------------------------
// Cleanup actions
// ---------------------------------------------------------------------

/**
 * Delete any media whose `createdAt` is older than `days` days.
 * Returns the number of assets removed. Best-effort: survives
 * individual adapter errors by continuing through the list.
 */
export async function cleanupOlderThan(days: number): Promise<number> {
  if (!Number.isFinite(days) || days <= 0) return 0;
  let assets: MediaAsset[] = [];
  try {
    assets = await listAllIndexedMedia();
  } catch {
    return 0;
  }
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  let removed = 0;

  // Resolve each asset's adapter lazily so we don't import mediaStore's
  // private `adapterForAsset`. We just use deleteMedia which handles
  // both byte removal AND index cleanup.
  const { deleteMedia } = await import('./mediaStore');

  for (const a of assets) {
    const t = _safeDate(a.createdAt);
    if (t === null) continue; // safer to keep un-dated assets than nuke them
    if (t >= cutoffMs) continue;
    try {
      await deleteMedia(a.imageId);
      removed += 1;
    } catch {
      // If byte removal fails, still drop it from the index so the stat
      // reflects reality and we don't keep trying forever.
      try { await removeMediaFromIndex(a.imageId); } catch { /* noop */ }
    }
  }
  await markCleanupRun();
  return removed;
}

/** Nuke every indexed media file. Returns the count deleted. */
export async function clearAllLocalImages(): Promise<number> {
  try {
    const n = await clearAllDeviceMedia();
    await markCleanupRun();
    return n;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------
// Formatting helpers (pure — safe to call in render)
// ---------------------------------------------------------------------

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
