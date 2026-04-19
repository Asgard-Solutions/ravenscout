// Raven Scout — Storage adapter interface.

import type { MediaAsset, MediaInput, MediaRole, StorageType } from '../types';

/**
 * Optional context passed down to adapters on write. Adapters that
 * need it (e.g. cloud uploads that bake huntId/role into the storage
 * key) may consume it; adapters that don't (local filesystem) can
 * safely ignore it.
 *
 * Adding a new optional argument keeps backwards compatibility with
 * pre-v3.1 adapters.
 */
export interface MediaStoreSaveContext {
  huntId?: string;
  role?: MediaRole;
}

export interface MediaStoreAdapter {
  readonly id: StorageType;
  save(input: MediaInput, ctx?: MediaStoreSaveContext): Promise<MediaAsset>;
  resolve(asset: MediaAsset): Promise<string | null>;
  remove(asset: MediaAsset): Promise<void>;
  has(asset: MediaAsset): Promise<boolean>;
}

export function rawBase64(input: string): string {
  if (!input) return '';
  const comma = input.indexOf(',');
  if (input.startsWith('data:') && comma >= 0) return input.slice(comma + 1);
  return input;
}

export function inferMime(dataUriOrB64: string, fallback = 'image/jpeg'): string {
  if (!dataUriOrB64) return fallback;
  const m = /^data:([^;]+);/.exec(dataUriOrB64);
  return m ? m[1] : fallback;
}

export function approxBase64Bytes(b64: string): number {
  if (!b64) return 0;
  const padding = (b64.match(/=+$/) || [''])[0].length;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export function newImageId(prefix = 'img'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}
