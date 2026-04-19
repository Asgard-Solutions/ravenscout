// Raven Scout — Media Store facade (mobile-only).
//
// Delegates byte persistence to a platform adapter chosen by the
// storage strategy resolver:
//   - Core / Trial → FileSystemMediaStore (Expo FileSystem)
//   - Pro          → CloudMediaStore (stubbed; TODO(cloud-upload))
//
// A lightweight reverse-index (`mediaIndex`) lets callers look up
// MediaAsset records by imageId and by huntId without scanning adapter
// backends.

import type { MediaAsset, MediaInput, MediaRole, StorageType } from './types';
import type { StrategyResult, Tier } from './storageStrategy';
import { resolveStorageStrategy } from './storageStrategy';
import type { MediaStoreAdapter } from './adapters/MediaStoreAdapter';
import { FileSystemMediaStore } from './adapters/FileSystemMediaStore';
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
let _legacyStore: DataUriLegacyMediaStore | null = null;
let _cloudStore: CloudMediaStore | null = null;

function getFs(): FileSystemMediaStore { return (_fsStore ||= new FileSystemMediaStore()); }
function getLegacy(): DataUriLegacyMediaStore { return (_legacyStore ||= new DataUriLegacyMediaStore()); }

function getCloud(): CloudMediaStore {
  if (!_cloudStore) _cloudStore = new CloudMediaStore({ fallback: getFs() });
  return _cloudStore;
}

/** Resolve the correct *write* adapter for a given strategy. */
function adapterForStrategy(strategy: StrategyResult): MediaStoreAdapter {
  switch (strategy.preferredBackend) {
    case 'cloud': return getCloud();
    case 'filesystem': return getFs();
    default: return getFs();
  }
}

/** Resolve the correct *read* adapter for an existing asset. */
function adapterForAsset(asset: MediaAsset): MediaStoreAdapter {
  switch (asset.storageType) {
    case 'local-file': return getFs();
    case 'cloud': return getCloud();
    case 'data-uri-legacy': return getLegacy();
    // `indexeddb` is quarantined — no production writes produce it; if a
    // legacy v2 record from earlier web-preview testing surfaces, we
    // still need to return *something*, so fall through to the legacy
    // resolver which can at least return null cleanly.
    case 'indexeddb': return getLegacy();
    default: return getFs();
  }
}

// ------------------------------ Public API ------------------------------

export interface SaveMediaContext {
  tier: Tier | null | undefined;
  /** Accepted for compatibility; ignored — mobile only. */
  platform?: string;
  role?: MediaRole;
  huntId?: string;
}

export async function saveMedia(
  input: MediaInput,
  ctx: SaveMediaContext,
): Promise<MediaAsset> {
  const strategy = resolveStorageStrategy({ tier: ctx.tier ?? null });
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
          reason: 'saveMedia failed (device disk or adapter error)',
          hunt_id: ctx.huntId,
          index: i,
          error: (err as any)?.message,
        },
      });
    }
  }
  await indexMediaBatch(out);
  return out;
}

export async function getMedia(imageId: string): Promise<MediaAsset | null> {
  return getMediaById(imageId);
}

export async function resolveMediaUri(imageId: string): Promise<string | null> {
  const asset = await getMediaById(imageId);
  if (!asset) return null;
  return resolveAsset(asset);
}

export async function resolveAsset(asset: MediaAsset | null | undefined): Promise<string | null> {
  if (!asset) return null;
  try {
    return await adapterForAsset(asset).resolve(asset);
  } catch { return null; }
}

export async function deleteMedia(imageId: string): Promise<void> {
  const asset = await getMediaById(imageId);
  if (asset) {
    try { await adapterForAsset(asset).remove(asset); } catch {}
  }
  await removeMediaFromIndex(imageId);
}

export async function listMediaForHunt(huntId: string): Promise<MediaAsset[]> {
  return indexListForHunt(huntId);
}

export async function removeMediaForHunt(huntId: string): Promise<number> {
  const assets = await indexListForHunt(huntId);
  for (const a of assets) {
    try { await adapterForAsset(a).remove(a); } catch {}
  }
  const removed = await indexRemoveForHunt(huntId);
  return removed.length;
}

export async function migrateLegacyBase64Media(
  base64Images: string[],
  ctx: SaveMediaContext,
): Promise<MediaAsset[]> {
  return saveMediaBatch(base64Images, ctx);
}

export type { StorageType, MediaAsset, MediaInput };
