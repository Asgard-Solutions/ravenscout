// Raven Scout — Top-level media store facade.
//
// One entry point for the rest of the app. Picks the right adapter
// based on the storage strategy and platform, and exposes:
//   - ingestImage()  — save raw/base64 input, returns a persisted
//                      MediaAsset (reference only, no base64)
//   - resolveAsset() — get a displayable URI for an asset
//   - removeAsset()  — delete the backing bytes

import { Platform } from 'react-native';
import type { MediaAsset, MediaInput, StorageType } from './types';
import type { StrategyResult } from './storageStrategy';
import type { MediaStoreAdapter } from './adapters/MediaStoreAdapter';
import { FileSystemMediaStore } from './adapters/FileSystemMediaStore';
import { IndexedDBMediaStore } from './adapters/IndexedDBMediaStore';
import { CloudMediaStore } from './adapters/CloudMediaStore';
import { DataUriLegacyMediaStore } from './adapters/DataUriLegacyMediaStore';

// ------------------------------ Factory ------------------------------

let _fsStore: FileSystemMediaStore | null = null;
let _idbStore: IndexedDBMediaStore | null = null;
let _legacyStore: DataUriLegacyMediaStore | null = null;
let _cloudStore: CloudMediaStore | null = null;

function getFileSystemStore(): FileSystemMediaStore {
  if (!_fsStore) _fsStore = new FileSystemMediaStore();
  return _fsStore;
}
function getIndexedDbStore(): IndexedDBMediaStore {
  if (!_idbStore) _idbStore = new IndexedDBMediaStore();
  return _idbStore;
}
function getLegacyStore(): DataUriLegacyMediaStore {
  if (!_legacyStore) _legacyStore = new DataUriLegacyMediaStore();
  return _legacyStore;
}
function getLocalStoreForPlatform(): MediaStoreAdapter {
  return Platform.OS === 'web' ? getIndexedDbStore() : getFileSystemStore();
}
function getCloudStore(): CloudMediaStore {
  if (!_cloudStore) {
    _cloudStore = new CloudMediaStore({ fallback: getLocalStoreForPlatform() });
  }
  return _cloudStore;
}

/** Pick the right *write* adapter based on a resolved strategy. */
export function adapterForStrategy(strategy: StrategyResult): MediaStoreAdapter {
  switch (strategy.preferredBackend) {
    case 'cloud':
      return getCloudStore();
    case 'indexeddb':
      return getIndexedDbStore();
    case 'filesystem':
      return getFileSystemStore();
    default:
      return getLocalStoreForPlatform();
  }
}

/** Pick the right *read* adapter for an existing MediaAsset. */
export function adapterForAsset(asset: MediaAsset): MediaStoreAdapter {
  switch (asset.storageType) {
    case 'indexeddb': return getIndexedDbStore();
    case 'local-file': return getFileSystemStore();
    case 'cloud': return getCloudStore();
    case 'data-uri-legacy': return getLegacyStore();
    default: return getLocalStoreForPlatform();
  }
}

// ------------------------------ Public API ------------------------------

/**
 * Persist an image input to the storage backend implied by the given
 * strategy, returning a reference-only MediaAsset.
 */
export async function ingestImage(
  strategy: StrategyResult,
  input: MediaInput,
): Promise<MediaAsset> {
  const adapter = adapterForStrategy(strategy);
  return adapter.save(input);
}

/**
 * Resolve an asset to a displayable URI. Returns null if the asset is
 * missing or corrupted — callers should render a placeholder.
 */
export async function resolveAsset(asset: MediaAsset | null | undefined): Promise<string | null> {
  if (!asset) return null;
  try {
    const adapter = adapterForAsset(asset);
    return await adapter.resolve(asset);
  } catch {
    return null;
  }
}

export async function removeAsset(asset: MediaAsset): Promise<void> {
  try {
    const adapter = adapterForAsset(asset);
    await adapter.remove(asset);
  } catch {
    // Best-effort
  }
}

/** True if the asset's storageType implies the bytes live inline. */
export function isLegacyInlineAsset(asset: MediaAsset): boolean {
  return asset.storageType === 'data-uri-legacy' ||
    (typeof asset.uri === 'string' && asset.uri.startsWith('data:'));
}

/**
 * Take a list of base64 images + a strategy, persist each into the
 * appropriate storage adapter, and return MediaAsset[] + display URIs
 * for the runtime side. If a per-image ingest fails, a placeholder
 * asset is emitted so the UI still renders a slot.
 */
export async function extractAndStoreImages(
  base64Images: string[],
  strategy: StrategyResult,
): Promise<{ assets: MediaAsset[]; displayUris: string[] }> {
  const assets: MediaAsset[] = [];
  const displayUris: string[] = [];
  for (const img of base64Images) {
    if (!img) continue;
    try {
      const asset = await ingestImage(strategy, { base64: img });
      assets.push(asset);
      // Keep the raw base64 as the session display URI — fastest for
      // the just-captured image; never persisted.
      displayUris.push(img);
    } catch {
      assets.push({
        assetId: `missing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        storageType: 'local-file',
        uri: '',
        mime: 'image/jpeg',
        createdAt: new Date().toISOString(),
      });
      displayUris.push(img);
    }
  }
  return { assets, displayUris };
}

export type { StorageType, MediaAsset, MediaInput };
