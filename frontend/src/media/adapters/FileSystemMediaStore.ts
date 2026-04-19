// Raven Scout — Expo FileSystem-backed adapter (native mobile).
//
// Primary media backend. Reads/writes live files under the app's
// cache directory. No web guards — the app only runs on iOS/Android.

import * as FileSystem from 'expo-file-system/legacy';
import type { MediaAsset, MediaInput } from '../types';
import {
  approxBase64Bytes,
  inferMime,
  newImageId,
  rawBase64,
  type MediaStoreAdapter,
} from './MediaStoreAdapter';

const DIR_NAME = 'raven-media';

function mimeToExt(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

async function ensureDir(): Promise<string> {
  const base = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
  if (!base) throw new Error('expo-file-system: no writable directory');
  const dir = `${base}${DIR_NAME}/`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {}
  return dir;
}

export class FileSystemMediaStore implements MediaStoreAdapter {
  readonly id = 'local-file' as const;

  async save(input: MediaInput): Promise<MediaAsset> {
    const mime = input.mime || inferMime(input.base64, 'image/jpeg');
    const b64 = rawBase64(input.base64);
    const imageId = newImageId('fs');
    const dir = await ensureDir();
    const uri = `${dir}${imageId}.${mimeToExt(mime)}`;
    await FileSystem.writeAsStringAsync(uri, b64, {
      encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
    });
    return {
      imageId,
      role: 'primary',   // default; caller overrides
      storageType: 'local-file',
      uri,
      storageKey: uri,
      mime,
      width: input.width,
      height: input.height,
      bytes: approxBase64Bytes(b64),
      createdAt: new Date().toISOString(),
    };
  }

  async resolve(asset: MediaAsset): Promise<string | null> {
    if (!asset.uri) return null;
    try {
      const info = await FileSystem.getInfoAsync(asset.uri);
      return info.exists ? asset.uri : null;
    } catch { return null; }
  }

  async remove(asset: MediaAsset): Promise<void> {
    if (!asset.uri) return;
    try { await FileSystem.deleteAsync(asset.uri, { idempotent: true }); } catch {}
  }

  async has(asset: MediaAsset): Promise<boolean> {
    if (!asset.uri) return false;
    try {
      const info = await FileSystem.getInfoAsync(asset.uri);
      return !!info.exists;
    } catch { return false; }
  }
}
