// Raven Scout — Media Index.
//
// A lightweight reverse lookup over MediaAsset metadata. Lives in
// AsyncStorage under `raven_media_index_v1`. Contains ONLY MediaAsset
// records (no bytes). The actual image bytes live inside the adapter
// each asset points at (FileSystem / IndexedDB / cloud).
//
// The index lets the hydration layer resolve `mediaRefs` from an
// analysis record into fully-typed MediaAsset objects without
// scanning the adapter backends.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MediaAsset } from './types';
import { logClientEvent } from '../utils/clientLog';

export const MEDIA_INDEX_KEY = 'raven_media_index_v1';

async function readAll(): Promise<MediaAsset[]> {
  try {
    const raw = await AsyncStorage.getItem(MEDIA_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(list: MediaAsset[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(MEDIA_INDEX_KEY, JSON.stringify(list));
    return true;
  } catch (err: any) {
    logClientEvent({
      event: 'storage_write_failed',
      data: {
        store: 'mediaIndex',
        error: err?.message || String(err),
      },
    });
    return false;
  }
}

// --------------------------- Public API ---------------------------

export async function indexMedia(asset: MediaAsset): Promise<void> {
  const all = await readAll();
  const without = all.filter(a => a.imageId !== asset.imageId);
  without.push(asset);
  await writeAll(without);
}

export async function indexMediaBatch(assets: MediaAsset[]): Promise<void> {
  if (assets.length === 0) return;
  const all = await readAll();
  const ids = new Set(assets.map(a => a.imageId));
  const without = all.filter(a => !ids.has(a.imageId));
  await writeAll([...without, ...assets]);
}

export async function getMediaById(imageId: string): Promise<MediaAsset | null> {
  if (!imageId) return null;
  const all = await readAll();
  return all.find(a => a.imageId === imageId) || null;
}

export async function listMediaForHunt(huntId: string): Promise<MediaAsset[]> {
  if (!huntId) return [];
  const all = await readAll();
  return all.filter(a => a.huntId === huntId);
}

export async function removeMediaFromIndex(imageId: string): Promise<void> {
  const all = await readAll();
  const next = all.filter(a => a.imageId !== imageId);
  if (next.length !== all.length) await writeAll(next);
}

export async function removeMediaForHunt(huntId: string): Promise<string[]> {
  const all = await readAll();
  const removed: string[] = [];
  const kept = all.filter(a => {
    if (a.huntId === huntId) {
      removed.push(a.imageId);
      return false;
    }
    return true;
  });
  if (removed.length > 0) await writeAll(kept);
  return removed;
}

export async function wipeMediaIndex(): Promise<void> {
  try { await AsyncStorage.removeItem(MEDIA_INDEX_KEY); } catch {}
}
