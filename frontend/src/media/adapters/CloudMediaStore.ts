// Raven Scout — AWS S3 cloud media adapter (Pro tier).
//
// Replaces the previous stub. Uploads compressed image bytes directly
// to S3 via a server-minted pre-signed PUT URL — no AWS credentials on
// device, no bytes proxied through the API.
//
// Flow (save):
//   1. Write the already-compressed base64 payload to a throwaway temp
//      file on the device (so we can stream it to S3).
//   2. Ask the backend for a pre-signed PUT URL for an
//      `hunts/{userId}/{huntId}/{role}/{imageId}.{ext}` key.
//   3. `FileSystem.uploadAsync` the temp file to S3 with PUT.
//   4. Delete the temp file. Return a MediaAsset stamped with
//      `storageType='cloud'`, the asset URL, and the storage key.
//
// Fallback strategy (Strategy B):
//   Any failure in steps 2–3 keeps the temp file in place and returns
//   a MediaAsset with `storageType='local-file'` +
//   `pendingCloudSync=true`. The UI renders it normally; a future
//   sync pass can retry the upload.
//
// SUPPORTED RUNTIME: iOS / Android via expo-file-system.

import * as FileSystem from 'expo-file-system/legacy';

import type { MediaAsset, MediaInput, MediaRole } from '../types';
import {
  approxBase64Bytes,
  inferMime,
  newImageId,
  rawBase64,
  type MediaStoreAdapter,
  type MediaStoreSaveContext,
} from './MediaStoreAdapter';
import {
  CloudMediaUnavailableError,
  requestCloudDelete,
  requestPresignDownload,
  requestPresignUpload,
} from './cloudPresignClient';
import { isCloudMediaDisabled } from '../cloudConfig';
import { logClientEvent } from '../../utils/clientLog';

const TEMP_DIR_NAME = 'raven-media-upload';

function mimeToExt(mime: string): string {
  if (!mime) return 'jpg';
  const m = mime.toLowerCase();
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  return 'jpg';
}

async function ensureTempDir(): Promise<string> {
  const base = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
  if (!base) throw new Error('expo-file-system: no writable directory');
  const dir = `${base}${TEMP_DIR_NAME}/`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {}
  return dir;
}

async function writeTempFile(b64: string, mime: string, imageId: string): Promise<string> {
  const dir = await ensureTempDir();
  const uri = `${dir}${imageId}.${mimeToExt(mime)}`;
  await FileSystem.writeAsStringAsync(uri, b64, {
    encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
  });
  return uri;
}

async function safeDelete(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {}
}

export interface CloudMediaStoreConfig {
  /** Adapter used when cloud upload is unavailable / disabled / fails
   *  AND we need a true local record (no temp-file bytes retained). */
  fallback: MediaStoreAdapter;
}

export class CloudMediaStore implements MediaStoreAdapter {
  readonly id = 'cloud' as const;

  constructor(private readonly config: CloudMediaStoreConfig) {}

  async save(input: MediaInput, ctx?: MediaStoreSaveContext): Promise<MediaAsset> {
    const mime = input.mime || inferMime(input.base64, 'image/jpeg');
    const b64 = rawBase64(input.base64);
    const role: MediaRole = (ctx?.role as MediaRole) || 'primary';
    const huntId = ctx?.huntId;
    const extension = mimeToExt(mime);
    const imageId = newImageId('cloud');

    // Dev/test escape hatch — skip network entirely.
    if (isCloudMediaDisabled()) {
      return this._localFallbackSave(input, imageId, role, huntId, 'cloud_disabled');
    }

    let tempUri: string | null = null;
    try {
      // 1. Persist the bytes to a streamable temp file.
      tempUri = await writeTempFile(b64, mime, imageId);

      // 2. Mint the pre-signed PUT URL.
      const presign = await requestPresignUpload({
        imageId,
        huntId,
        role,
        mime,
        extension,
      });

      // 3. Upload directly to S3.
      const uploadResult = await FileSystem.uploadAsync(presign.uploadUrl, tempUri, {
        httpMethod: 'PUT',
        uploadType:
          (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT ?? 0,
        headers: { 'Content-Type': mime },
      });
      const status = uploadResult?.status ?? 0;
      if (status < 200 || status >= 300) {
        // Surface S3's response body so we can see WHY (e.g.
        // SignatureDoesNotMatch, AccessDenied, RequestTimeTooSkewed).
        // expo-file-system returns the response body in `body` for
        // BINARY_CONTENT uploads.
        const respBody = (uploadResult as any)?.body || '';
        const respHeaders = (uploadResult as any)?.headers || {};
        logClientEvent({
          event: 'persist_degraded',
          data: {
            reason: 'cloud_s3_put_non_2xx',
            hunt_id: huntId,
            role,
            status,
            mime,
            // Keep small snippet for telemetry only.
            body_snippet: typeof respBody === 'string' ? respBody.slice(0, 500) : null,
            content_type_header: respHeaders['Content-Type'] || respHeaders['content-type'] || null,
          },
        });
        throw new Error(
          `S3 PUT failed status=${status}` +
            (typeof respBody === 'string' && respBody.length
              ? ` body=${respBody.slice(0, 300)}`
              : ''),
        );
      }

      // 4. Cleanup temp; return cloud-stamped asset.
      await safeDelete(tempUri);
      return {
        imageId,
        role,
        huntId,
        storageType: 'cloud',
        uri: presign.assetUrl,
        storageKey: presign.storageKey,
        mime,
        width: input.width,
        height: input.height,
        bytes: approxBase64Bytes(b64),
        createdAt: new Date().toISOString(),
        pendingCloudSync: false,
        // Stamp delivery mode at save time so the resolver knows
        // whether the stored `uri` is directly fetchable (public CDN
        // / public bucket) or whether it has to mint a signed GET.
        // Defaults to `false` (treat as private) so assets uploaded
        // against the default AWS S3 bucket render correctly via
        // signed-download URLs.
        publicDelivery: presign.privateDelivery === false,
      } as MediaAsset;
    } catch (err: any) {
      const reason =
        err instanceof CloudMediaUnavailableError
          ? 'cloud_unavailable'
          : 'cloud_upload_failed';
      logClientEvent({
        event: 'persist_degraded',
        data: {
          reason,
          hunt_id: huntId,
          role,
          error: err?.message || String(err),
        },
      });

      // Strategy B: keep the temp file bytes on device, mark pending.
      if (tempUri) {
        return {
          imageId,
          role,
          huntId,
          storageType: 'local-file',
          uri: tempUri,
          storageKey: tempUri,
          mime,
          width: input.width,
          height: input.height,
          bytes: approxBase64Bytes(b64),
          createdAt: new Date().toISOString(),
          pendingCloudSync: true,
        };
      }
      // Couldn't even stage a temp file — delegate cleanly to the
      // local-filesystem adapter.
      return this._localFallbackSave(input, imageId, role, huntId, reason);
    }
  }

  private async _localFallbackSave(
    input: MediaInput,
    imageId: string,
    role: MediaRole,
    huntId: string | undefined,
    reason: string,
  ): Promise<MediaAsset> {
    try {
      const local = await this.config.fallback.save(input, { huntId, role });
      return {
        ...local,
        imageId,
        role,
        huntId,
        pendingCloudSync: true,
      };
    } catch (err: any) {
      logClientEvent({
        event: 'persist_degraded',
        data: {
          reason: 'cloud_fallback_failed',
          upstream_reason: reason,
          hunt_id: huntId,
          error: err?.message || String(err),
        },
      });
      throw err;
    }
  }

  async resolve(asset: MediaAsset): Promise<string | null> {
    // For cloud assets we MUST prefer a freshly-minted signed GET URL
    // whenever a storageKey is present, because the stored `uri` is
    // the direct S3 object URL which is NOT directly fetchable on a
    // private bucket (the production default — no CloudFront / public
    // base URL configured). Using `asset.uri` blindly returned a 403
    // from S3 and rendered the thumbnail as blank.
    //
    // Only return the stored `uri` directly when delivery is public,
    // which we detect by the asset carrying a `publicDelivery: true`
    // flag stamped at save time. Every non-public cloud asset
    // resolves via the presign-download endpoint.
    if (asset.storageType === 'cloud') {
      if ((asset as any).publicDelivery === true && asset.uri && /^https?:\/\//i.test(asset.uri)) {
        return asset.uri;
      }
      if (asset.storageKey) {
        try {
          return await requestPresignDownload(asset.storageKey);
        } catch {
          // Fall through to the stored URI as a last resort — better
          // than a blank thumbnail if CloudFront/public delivery is
          // actually configured but we mis-flagged the asset.
          if (asset.uri && /^https?:\/\//i.test(asset.uri)) return asset.uri;
          return null;
        }
      }
      // No key — can't mint a signed URL. Fall back to whatever URI
      // we have (covers legacy v2 records).
      if (asset.uri && /^https?:\/\//i.test(asset.uri)) return asset.uri;
      return null;
    }
    // Pending-sync local fallback — delegate to filesystem adapter.
    return this.config.fallback.resolve(asset);
  }

  async remove(asset: MediaAsset): Promise<void> {
    if (asset.storageType === 'cloud' && asset.storageKey) {
      // Best-effort cloud deletion. We do NOT fail index cleanup if
      // the remote delete errors — the media store swallows remove()
      // exceptions anyway, but we add a breadcrumb for ops.
      const ok = await requestCloudDelete(asset.storageKey);
      if (!ok) {
        logClientEvent({
          event: 'persist_degraded',
          data: {
            reason: 'cloud_delete_failed',
            storage_key: asset.storageKey,
            hunt_id: asset.huntId,
          },
        });
      }
      return;
    }
    // Pending-sync fallback (still a local-file asset) — let the
    // filesystem adapter do its normal idempotent delete.
    await this.config.fallback.remove(asset);
  }

  async has(asset: MediaAsset): Promise<boolean> {
    if (asset.storageType === 'cloud') {
      return !!(asset.uri || asset.storageKey);
    }
    return this.config.fallback.has(asset);
  }

  /**
   * Convenience: force a fresh signed-download URL even if the asset
   * already carries a public URL. Useful if the cached public URL is
   * known to be stale / the bucket switched to private.
   */
  async resolveSigned(asset: MediaAsset): Promise<string | null> {
    if (!asset.storageKey) return null;
    try {
      return await requestPresignDownload(asset.storageKey);
    } catch {
      return null;
    }
  }
}
