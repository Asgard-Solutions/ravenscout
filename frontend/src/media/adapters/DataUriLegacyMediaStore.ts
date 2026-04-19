// Raven Scout — Legacy data-URI adapter (read-only).

import type { MediaAsset, MediaInput } from '../types';
import type { MediaStoreAdapter } from './MediaStoreAdapter';

export class DataUriLegacyMediaStore implements MediaStoreAdapter {
  readonly id = 'data-uri-legacy' as const;

  async save(_input: MediaInput): Promise<MediaAsset> {
    throw new Error('DataUriLegacyMediaStore is read-only');
  }

  async resolve(asset: MediaAsset): Promise<string | null> {
    if (!asset.uri) return null;
    if (asset.uri.startsWith('data:')) return asset.uri;
    return null;
  }

  async remove(): Promise<void> {}
  async has(asset: MediaAsset): Promise<boolean> {
    return !!asset.uri && asset.uri.startsWith('data:');
  }
}
