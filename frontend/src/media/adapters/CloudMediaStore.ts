// Raven Scout — Cloud object-storage adapter (STUB).
//
// TODO(cloud-upload): replace the local-store fallback below with real
// S3/GCS uploads once the object-storage integration is provisioned.
// The caller contract is frozen — ONLY swap the body here, do not
// change the MediaAsset / MediaStoreAdapter signatures.
//
// Today this stub:
//   1. Delegates persistence to whichever local adapter is configured
//      (FileSystem on native, IndexedDB on web).
//   2. Rewrites the returned MediaAsset with storageType='cloud' so
//      the persisted record looks cloud-native (assetId, storageKey,
//      storageType) — which is the shape we want in production. This
//      means the migration surface on the day we flip the switch is
//      a single file.

import type { MediaAsset, MediaInput } from '../types';
import { newAssetId, type MediaStoreAdapter } from './MediaStoreAdapter';

export interface CloudStubConfig {
  fallback: MediaStoreAdapter;
}

export class CloudMediaStore implements MediaStoreAdapter {
  readonly id = 'cloud' as const;

  constructor(private readonly config: CloudStubConfig) {}

  async save(input: MediaInput): Promise<MediaAsset> {
    // TODO(cloud-upload): replace with real upload call and return
    // a cloud URL. Until then we keep bytes in the local fallback but
    // shape the persisted record as if it were cloud.
    const localAsset = await this.config.fallback.save(input);
    const cloudAssetId = newAssetId('cloud');
    return {
      ...localAsset,
      assetId: cloudAssetId,
      storageType: 'cloud',
      // The URI stays pointing at the local store — CloudMediaStore.resolve
      // below will delegate to the fallback to pull bytes until real cloud
      // URLs are available.
      uri: localAsset.uri,
      storageKey: localAsset.storageKey,
    };
  }

  async resolve(asset: MediaAsset): Promise<string | null> {
    // TODO(cloud-upload): if asset.uri starts with https:// return it directly
    if (asset.uri && /^https?:\/\//i.test(asset.uri)) {
      return asset.uri;
    }
    // Otherwise fall back to the local store.
    return this.config.fallback.resolve(asset);
  }

  async remove(asset: MediaAsset): Promise<void> {
    return this.config.fallback.remove(asset);
  }

  async has(asset: MediaAsset): Promise<boolean> {
    return this.config.fallback.has(asset);
  }
}
