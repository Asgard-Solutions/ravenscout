// Raven Scout — Cloud object-storage adapter (STUB).
//
// TODO(cloud-upload): Replace the local-store fallback body below
// with real S3/GCS uploads once the object-storage integration ships.
// This is the ONLY file that needs to change — the outer API
// (MediaStoreAdapter + MediaAsset shape) is frozen.
//
// Today the stub delegates byte persistence to the platform-local
// adapter (FileSystem on native, IndexedDB on web) but stamps the
// resulting MediaAsset with `storageType='cloud'`. When real cloud
// ships, swap the body of `save()` to upload and return a real
// https:// URI.

import type { MediaAsset, MediaInput } from '../types';
import { newImageId, type MediaStoreAdapter } from './MediaStoreAdapter';

export interface CloudStubConfig {
  fallback: MediaStoreAdapter;
}

export class CloudMediaStore implements MediaStoreAdapter {
  readonly id = 'cloud' as const;

  constructor(private readonly config: CloudStubConfig) {}

  async save(input: MediaInput): Promise<MediaAsset> {
    // TODO(cloud-upload): replace with: const uploaded = await uploadToCloud(input);
    const local = await this.config.fallback.save(input);
    return {
      ...local,
      imageId: newImageId('cloud'),
      storageType: 'cloud',
    };
  }

  async resolve(asset: MediaAsset): Promise<string | null> {
    if (asset.uri && /^https?:\/\//i.test(asset.uri)) return asset.uri;
    return this.config.fallback.resolve(asset);
  }

  async remove(asset: MediaAsset): Promise<void> {
    return this.config.fallback.remove(asset);
  }

  async has(asset: MediaAsset): Promise<boolean> {
    return this.config.fallback.has(asset);
  }
}
