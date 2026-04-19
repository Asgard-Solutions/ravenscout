// Raven Scout — Legacy data-URI adapter.
//
// Used ONLY to resolve assets that were persisted before v2 of the
// persistence schema (i.e. base64 data URIs stored directly inside
// hunt records). Nothing new is ever saved through this adapter — the
// migration step upgrades hits to a real adapter on first access.

import type { MediaAsset, MediaInput } from '../types';
import type { MediaStoreAdapter } from './MediaStoreAdapter';

export class DataUriLegacyMediaStore implements MediaStoreAdapter {
  readonly id = 'data-uri-legacy' as const;

  async save(_input: MediaInput): Promise<MediaAsset> {
    throw new Error('DataUriLegacyMediaStore is read-only (no new writes)');
  }

  async resolve(asset: MediaAsset): Promise<string | null> {
    if (!asset.uri) return null;
    if (asset.uri.startsWith('data:')) return asset.uri;
    return null;
  }

  async remove(): Promise<void> {
    // No-op: the bytes live inline in a hunt record, so deletion is
    // performed by migrating the whole record.
  }

  async has(asset: MediaAsset): Promise<boolean> {
    return !!asset.uri && asset.uri.startsWith('data:');
  }
}
