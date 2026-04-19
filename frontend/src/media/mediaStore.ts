// Raven Scout — Media Store facade.
//
// Public API the rest of the app uses. Delegates bytes to a platform
// adapter selected by the storage strategy resolver, and keeps a
// lightweight index (mediaIndex) for reverse lookup by imageId and
// for `listMediaForHunt`.

import { Platform } from 'react-native';
import type { MediaAsset, MediaInput, MediaRole, StorageType } from './types';
import type { StrategyResult, Tier } from './storageStrategy';
import { resolveStorageStrategy } from './storageStrategy';
import type { MediaStoreAdapter } from './adapters/MediaStoreAdapter';
import { FileSystemMediaStore } from './adapters/FileSystemMediaStore';
import { IndexedDBMediaStore } from './adapters/IndexedDBMediaStore';
import { CloudMediaStore } from './adapters/CloudMediaStore';
import { DataUriLegacyMediaStore } from './adapters/DataUriLegacyMediaStore';
import {
  getMediaById,
  indexMedia,
  indexMediaBatch,
  listMediaForHunt as indexListForHunt,
  removeMediaFromIndex,
  removeMediaForHunt as indexRemoveForHunt,
} from './mediaIndex';
import { logClientEvent } from '../utils/clientLog';

// ------------------------------ Adapter factory ------------------------------

let _fsStore: FileSystemMediaStore | null = null;
let _idbStore: IndexedDBMediaStore | null = null;
let _legacyStore: DataUriLegacyMediaStore | null = null;
let _cloudStore: CloudMediaStore | null = null;

function getFs(): FileSystemMediaStore { return (_fsStore ||= new FileSystemMediaStore()); }
function getIdb(): IndexedDBMediaStore { return (_idbStore ||= new IndexedDBMediaStore()); }
function getLegacy(): DataUriLegacyMediaStore { return (_legacyStore ||= new DataUriLegacyMediaStore()); }
function getLocalForPlatform(): MediaStoreAdapter {
  return Platform.OS === 'web' ? getIdb() : getFs();
}
function getCloud(): CloudMediaStore {
  if (!_cloudStore) _cloudStore = new CloudMediaStore({ fallback: getLocalForPlatform() });
  return _cloudStore;
}

function adapterForStrategy(strategy: StrategyResult): MediaStoreAdapter {
  switch (strategy.preferredBackend) {
    case 'cloud': return getCloud();
    case 'indexeddb': return getIdb();
    case 'filesystem': return getFs();
    default: return getLocalForPlatform();
  }
}

function adapterForAsset(asset: MediaAsset): MediaStoreAdapter {
  switch (asset.storageType) {
    case 'indexeddb': return getIdb();
    case 'local-file': return getFs();
    case 'cloud': return getCloud();
    case 'data-uri-legacy': return getLegacy();
    default: return getLocalForPlatform();
  }
}

// ------------------------------ Public API ------------------------------

export interface SaveMediaContext {
  tier: Tier | null | undefined;
  platform?: string;
  role?: MediaRole;
  huntId?: string;
}

/**
 * Persist image bytes to the correct backend (tier + platform aware).
 * Registers the resulting MediaAsset in the media index.
 */
export async function saveMedia(
  input: MediaInput,
  ctx: SaveMediaContext,
): Promise<MediaAsset> {
  const strategy = resolveStorageStrategy({
    tier: ctx.tier ?? null,
    platform: ctx.platform || Platform.OS,
  });
  const adapter = adapterForStrategy(strategy);
  const stored = await adapter.save(input);
  const asset: MediaAsset = {
    ...stored,
    role: ctx.role || stored.role || 'primary',
    huntId: ctx.huntId,
  };
  await indexMedia(asset);
  return asset;
}

/**
 * Convenience: persist many base64 images for a hunt at once. Returns
 * the MediaAsset array in input order. Failures emit placeholders so
 * the caller's mediaRefs stay aligned.
 */
export async function saveMediaBatch(
  images: string[],
  ctx: SaveMediaContext,
): Promise<MediaAsset[]> {
  const out: MediaAsset[] = [];
  for (let i = 0; i < images.length; i++) {
    const b = images[i];
    if (!b) continue;
    const role: MediaRole = i === 0 ? 'primary' : 'context';
    try {
      const asset = await saveMedia({ base64: b }, { ...ctx, role });
      out.push(asset);
    } catch (err) {
      logClientEvent({
        event: 'persist_degraded',
        data: {
          reason: 'saveMedia failed',
          hunt_id: ctx.huntId,
          index: i,
          error: (err as any)?.message,
        },
      });
    }
  }
  await indexMediaBatch(out);  // no-op if already indexed; keeps batch atomic
  return out;
}

/** Fetch a MediaAsset by its stable id. */
export async function getMedia(imageId: string): Promise<MediaAsset | null> {
  return getMediaById(imageId);
}

/** Resolve an imageId to a displayable URI. Null if unresolvable. */
export async function resolveMediaUri(imageId: string): Promise<string | null> {
  const asset = await getMediaById(imageId);
  if (!asset) return null;
  return resolveAsset(asset);
}

/** Resolve a MediaAsset directly (used by hydration). */
export async function resolveAsset(asset: MediaAsset | null | undefined): Promise<string | null> {
  if (!asset) return null;
  try {
    return await adapterForAsset(asset).resolve(asset);
  } catch { return null; }
}

/** Delete media bytes and index entry. */
export async function deleteMedia(imageId: string): Promise<void> {
  const asset = await getMediaById(imageId);
  if (asset) {
    try { await adapterForAsset(asset).remove(asset); } catch {}
  }
  await removeMediaFromIndex(imageId);
}

/** List all media associated with a given hunt. */
export async function listMediaForHunt(huntId: string): Promise<MediaAsset[]> {
  return indexListForHunt(huntId);
}

/** Remove every media asset associated with a hunt. */
export async function removeMediaForHunt(huntId: string): Promise<number> {
  const assets = await indexListForHunt(huntId);
  for (const a of assets) {
    try { await adapterForAsset(a).remove(a); } catch {}
  }
  const removed = await indexRemoveForHunt(huntId);
  return removed.length;
}

/**
 * Legacy migration: take a list of inline base64 images, persist each
 * to the tier-correct backend, index them against `huntId`, and
 * return the resulting MediaAsset[] (in input order).
 */
export async function migrateLegacyBase64Media(
  base64Images: string[],
  ctx: SaveMediaContext,
): Promise<MediaAsset[]> {
  return saveMediaBatch(base64Images, ctx);
}

export type { StorageType, MediaAsset, MediaInput };
