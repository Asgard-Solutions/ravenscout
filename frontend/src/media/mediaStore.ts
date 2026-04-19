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
  wipeMediaIndex,
} from './mediaIndex';
import { logClientEvent } from '../utils/clientLog';
import {
  buildThumbnail,
  compressImage,
  profileForTier,
} from './imageProcessor';

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
  // Compress unless explicitly skipped (thumbnails / already-processed).
  const role = ctx.role || 'primary';
  let payload = input;
  if (role !== 'thumbnail') {
    const profile = profileForTier(ctx.tier);
    const compressed = await compressImage(input.base64, profile);
    payload = {
      base64: compressed.dataUri,
      mime: compressed.mime,
      width: compressed.width || input.width,
      height: compressed.height || input.height,
    };
  }
  const stored = await adapter.save(payload, { huntId: ctx.huntId, role });
  const asset: MediaAsset = {
    ...stored,
    role,
    huntId: ctx.huntId,
  };
  await indexMedia(asset);
  return asset;
}

/** Save a thumbnail for an existing primary asset. Best-effort.
 *  Returns null if the thumbnail could not be generated — callers
 *  leave `thumbnailRef` undefined so the UI falls back to the primary.
 */
async function saveThumbnailFor(
  primaryBase64: string,
  ctx: SaveMediaContext,
): Promise<MediaAsset | null> {
  try {
    const thumb = await buildThumbnail(primaryBase64);
    if (thumb.failed) {
      logClientEvent({
        event: 'persist_degraded',
        data: {
          reason: 'thumbnail_build_failed',
          hunt_id: ctx.huntId,
        },
      });
      return null;
    }
    const strategy = resolveStorageStrategy({ tier: ctx.tier ?? null });
    const adapter = adapterForStrategy(strategy);
    const stored = await adapter.save(
      { base64: thumb.dataUri, mime: thumb.mime },
      { huntId: ctx.huntId, role: 'thumbnail' },
    );
    const asset: MediaAsset = {
      ...stored,
      role: 'thumbnail',
      huntId: ctx.huntId,
    };
    await indexMedia(asset);
    return asset;
  } catch (err) {
    logClientEvent({
      event: 'persist_degraded',
      data: {
        reason: 'thumbnail_persist_failed',
        hunt_id: ctx.huntId,
        error: (err as any)?.message,
      },
    });
    return null;
  }
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
      // Only the primary gets a thumbnail (history list anchor).
      if (role === 'primary') {
        const thumb = await saveThumbnailFor(b, ctx);
        if (thumb) {
          asset.thumbnailRef = thumb.imageId;
          await indexMedia(asset); // re-index with thumbnailRef
        }
      }
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
  // Also queue any thumbnails referenced by primaries (in case they
  // weren't tagged with huntId for any reason).
  const thumbIds = new Set<string>();
  for (const a of assets) {
    if (a.thumbnailRef) thumbIds.add(a.thumbnailRef);
  }
  for (const a of assets) {
    try { await adapterForAsset(a).remove(a); } catch {}
  }
  for (const tid of thumbIds) {
    if (assets.some(a => a.imageId === tid)) continue;
    const t = await getMediaById(tid);
    if (t) {
      try { await adapterForAsset(t).remove(t); } catch {}
      await removeMediaFromIndex(tid);
    }
  }
  const removed = await indexRemoveForHunt(huntId);
  return removed.length + thumbIds.size;
}

/**
 * Wipe ALL media bytes + the index. Intended for a manual "clear all
 * device media" debug action. Does not touch the AnalysisStore so the
 * user can still see metadata-only history if they want.
 */
export async function clearAllDeviceMedia(): Promise<number> {
  // Read every asset, ask its adapter to delete the bytes, then
  // wipe the index. Index-only orphans are removed by wipeMediaIndex.
  const fs = getFs();
  // We can iterate via index; if some assets are missing in the index,
  // their files will be GC'd by the OS eventually. Best-effort.
  let count = 0;
  try {
    // Reuse indexListForHunt with a sentinel — it filters by huntId.
    // Instead, read everything by clearing only what we know about.
    const known = await listAllIndexed();
    for (const a of known) {
      try {
        await adapterForAsset(a).remove(a);
        count++;
      } catch {}
    }
  } catch {}
  // Best-effort: clear the on-disk media directory altogether.
  try { await fs.removeAll?.(); } catch {}
  await wipeMediaIndex();
  return count;
}

async function listAllIndexed(): Promise<MediaAsset[]> {
  // Defer to mediaIndex's internal reader by importing dynamically to
  // avoid circular deps.
  const mod = await import('./mediaIndex');
  return mod.listAllIndexedMedia();
}

export async function migrateLegacyBase64Media(
  base64Images: string[],
  ctx: SaveMediaContext,
): Promise<MediaAsset[]> {
  return saveMediaBatch(base64Images, ctx);
}

export type { StorageType, MediaAsset, MediaInput };
