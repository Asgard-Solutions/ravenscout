// Raven Scout — Hunt serialization: runtime ↔ persisted (PURE).
//
// CRITICAL INVARIANT: toPersistedHunt() guarantees the returned object
// contains NO base64 data URIs anywhere. stripBase64Images() is the
// final safeguard applied right before writing to AsyncStorage.
//
// This file has NO runtime side-effects and NO React Native imports.
// Image ingestion (which needs platform adapters) lives in
// `mediaStore.ts` as `extractAndStoreImages`.

import type {
  LegacyHuntRecord,
  MediaAsset,
  PersistedHunt,
  RuntimeHunt,
} from './types';

const BASE64_RE = /data:image\/[a-z]+;base64,/i;

// ------------------------------ Detection ------------------------------

/** True if the input is (or contains) a base64 data URI. */
export function isBase64DataUri(s: unknown): boolean {
  return typeof s === 'string' && BASE64_RE.test(s);
}

/** Detect if a hunt record is in the legacy shape (has mapImages as base64). */
export function isLegacyHunt(record: any): record is LegacyHuntRecord {
  if (!record || typeof record !== 'object') return false;
  if (record.schema === 'hunt.persisted.v2') return false;
  if (Array.isArray(record.mediaAssets)) return false;
  const hasBase64Array = Array.isArray(record.mapImages) &&
    record.mapImages.some((m: unknown) => isBase64DataUri(m));
  const hasBase64Scalar = isBase64DataUri(record.mapImage);
  return hasBase64Array || hasBase64Scalar ||
    (Array.isArray(record.mapImages) && record.mapImages.length > 0);
}

// ------------------------------ Strip ------------------------------

/**
 * Recursively strip any base64 image data URIs from an object. The
 * input is mutated in place AND returned. Use ONLY on records destined
 * for AsyncStorage.
 */
export function stripBase64Images<T>(record: T): T {
  const seen = new WeakSet<object>();
  const walk = (v: any): any => {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') {
      return isBase64DataUri(v) ? null : v;
    }
    if (Array.isArray(v)) {
      return v.map(walk).filter(x => x !== null && x !== undefined);
    }
    if (typeof v === 'object') {
      if (seen.has(v)) return v;
      seen.add(v);
      for (const k of Object.keys(v)) {
        const next = walk(v[k]);
        if (next === null && typeof v[k] === 'string' && isBase64DataUri(v[k])) {
          delete v[k];
        } else {
          v[k] = next;
        }
      }
    }
    return v;
  };
  return walk(record) as T;
}

// ------------------------------ Runtime ↔ Persisted ------------------------------

export interface BuildRuntimeHuntInput {
  id: string;
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  temperature?: string | number | null;
  propertyType?: string;
  region?: string;
  result: any;
  weatherData?: any;
  locationCoords?: { lat: number; lon: number } | null;
  createdAt: string;
  mediaAssets: MediaAsset[];
  mediaDisplayUris?: (string | null)[];
  primaryMediaIndex: number;
  storageStrategy: 'local-uri' | 'cloud-uri' | 'metadata-only';
}

export function buildRuntimeHunt(input: BuildRuntimeHuntInput): RuntimeHunt {
  return {
    schema: 'hunt.persisted.v2',
    id: input.id,
    species: input.species,
    speciesName: input.speciesName,
    date: input.date,
    timeWindow: input.timeWindow,
    windDirection: input.windDirection,
    temperature: input.temperature ?? null,
    propertyType: input.propertyType,
    region: input.region,
    result: input.result,
    weatherData: input.weatherData,
    locationCoords: input.locationCoords ?? null,
    createdAt: input.createdAt,
    mediaAssets: input.mediaAssets,
    mediaDisplayUris: input.mediaDisplayUris,
    primaryMediaIndex: input.primaryMediaIndex,
    storageStrategy: input.storageStrategy,
  };
}

/**
 * Produce a shape safe for AsyncStorage. Strips any lingering base64
 * and drops runtime-only fields (mediaDisplayUris).
 */
export function toPersistedHunt(runtime: RuntimeHunt): PersistedHunt {
  const clone: any = JSON.parse(JSON.stringify({
    schema: 'hunt.persisted.v2',
    id: runtime.id,
    species: runtime.species,
    speciesName: runtime.speciesName,
    date: runtime.date,
    timeWindow: runtime.timeWindow,
    windDirection: runtime.windDirection,
    temperature: runtime.temperature ?? null,
    propertyType: runtime.propertyType,
    region: runtime.region,
    result: runtime.result,
    weatherData: runtime.weatherData,
    locationCoords: runtime.locationCoords ?? null,
    createdAt: runtime.createdAt,
    mediaAssets: runtime.mediaAssets,
    primaryMediaIndex: runtime.primaryMediaIndex,
    storageStrategy: runtime.storageStrategy,
  }));
  return stripBase64Images(clone) as PersistedHunt;
}

/** Reverse: persisted record → runtime with no display URIs populated yet. */
export function fromPersistedHunt(persisted: PersistedHunt): RuntimeHunt {
  return {
    ...persisted,
    mediaDisplayUris: new Array(persisted.mediaAssets?.length || 0).fill(null),
  };
}
