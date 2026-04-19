// Raven Scout — Storage adapter interface.
//
// Every concrete adapter (FileSystem, IndexedDB, Cloud) implements
// this shape. Callers should never branch on the adapter class — they
// go through `mediaStore.save/resolve/delete` which picks the right
// adapter via the strategy resolver.

import type { MediaAsset, MediaInput, StorageType } from '../types';

export interface MediaStoreAdapter {
  /** Stable identifier for logs / telemetry. */
  readonly id: StorageType;

  /** Persist bytes and return a reference-only MediaAsset. */
  save(input: MediaInput): Promise<MediaAsset>;

  /**
   * Return a displayable URI for the asset. May be:
   *  - the same uri the asset already has (file://, https://)
   *  - a freshly-generated blob: URL (IndexedDB)
   *  - a data: URI (legacy fallback)
   */
  resolve(asset: MediaAsset): Promise<string | null>;

  /** Delete the backing bytes. Missing is non-error. */
  remove(asset: MediaAsset): Promise<void>;

  /** True if the asset can be loaded by this adapter. */
  has(asset: MediaAsset): Promise<boolean>;
}

// ------------------------------ Helpers ------------------------------

/** Extract raw base64 bytes from either a data URI or a plain b64 string. */
export function rawBase64(input: string): string {
  if (!input) return '';
  const comma = input.indexOf(',');
  if (input.startsWith('data:') && comma >= 0) {
    return input.slice(comma + 1);
  }
  return input;
}

/** Infer mime from a data URI prefix; fall back to provided default. */
export function inferMime(dataUriOrB64: string, fallback = 'image/jpeg'): string {
  if (!dataUriOrB64) return fallback;
  const m = /^data:([^;]+);/.exec(dataUriOrB64);
  return m ? m[1] : fallback;
}

/** Approximate byte length of a base64 string. */
export function approxBase64Bytes(b64: string): number {
  if (!b64) return 0;
  const padding = (b64.match(/=+$/) || [''])[0].length;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export function newAssetId(prefix = 'media'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}
