// Raven Scout — IndexedDB-backed adapter (web).

import type { MediaAsset, MediaInput } from '../types';
import {
  approxBase64Bytes,
  inferMime,
  newImageId,
  rawBase64,
  type MediaStoreAdapter,
} from './MediaStoreAdapter';

const DB_NAME = 'raven-scout-media';
const DB_VERSION = 1;
const STORE_NAME = 'assets';
const URI_PREFIX = `idb://${STORE_NAME}/`;

function isWebIdbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function putBlob(db: IDBDatabase, key: string, blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function getBlob(db: IDBDatabase, key: string): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as Blob) || null);
    req.onerror = () => reject(req.error);
  });
}
function deleteKey(db: IDBDatabase, key: string): Promise<void> {
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export class IndexedDBMediaStore implements MediaStoreAdapter {
  readonly id = 'indexeddb' as const;

  async save(input: MediaInput): Promise<MediaAsset> {
    if (!isWebIdbAvailable()) throw new Error('IndexedDB unavailable');
    const mime = input.mime || inferMime(input.base64, 'image/jpeg');
    const b64 = rawBase64(input.base64);
    const bytes = approxBase64Bytes(b64);
    const imageId = newImageId('idb');
    const storageKey = imageId;
    const db = await openDb();
    try {
      const blob = base64ToBlob(b64, mime);
      await putBlob(db, storageKey, blob);
    } finally { db.close(); }
    return {
      imageId,
      role: 'primary',
      storageType: 'indexeddb',
      uri: `${URI_PREFIX}${storageKey}`,
      storageKey,
      mime,
      width: input.width,
      height: input.height,
      bytes,
      createdAt: new Date().toISOString(),
    };
  }

  async resolve(asset: MediaAsset): Promise<string | null> {
    if (!isWebIdbAvailable()) return null;
    if (!asset.uri || !asset.uri.startsWith(URI_PREFIX)) return null;
    const key = asset.storageKey || asset.uri.slice(URI_PREFIX.length);
    const db = await openDb();
    try {
      const blob = await getBlob(db, key);
      if (!blob) return null;
      return URL.createObjectURL(blob);
    } finally { db.close(); }
  }

  async remove(asset: MediaAsset): Promise<void> {
    if (!isWebIdbAvailable()) return;
    const key = asset.storageKey || asset.uri.slice(URI_PREFIX.length);
    const db = await openDb();
    try { await deleteKey(db, key); } finally { db.close(); }
  }

  async has(asset: MediaAsset): Promise<boolean> {
    if (!isWebIdbAvailable()) return false;
    const key = asset.storageKey || asset.uri.slice(URI_PREFIX.length);
    const db = await openDb();
    try {
      const blob = await getBlob(db, key);
      return !!blob;
    } finally { db.close(); }
  }
}

export const INDEXEDDB_URI_PREFIX = URI_PREFIX;
