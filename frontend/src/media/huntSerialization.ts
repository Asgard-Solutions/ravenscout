// Raven Scout — Hunt serialization utilities (pure).
//
// Contains only transformations that DO NOT touch React Native or
// storage adapters. Safe to import from Node tests.

import type {
  HuntMetadata,
  LegacyV1HuntRecord,
  LegacyV2HuntRecord,
  PersistedHuntAnalysis,
  StorageStrategy,
} from './types';

const BASE64_RE = /data:image\/[a-z]+;base64,/i;

// ------------------------------ Detection ------------------------------

export function isBase64DataUri(s: unknown): boolean {
  return typeof s === 'string' && BASE64_RE.test(s);
}

export function isLegacyV1Hunt(record: any): record is LegacyV1HuntRecord {
  if (!record || typeof record !== 'object') return false;
  if (record.schema === 'hunt.persisted.v2') return false;
  if (record.schema === 'hunt.analysis.v1') return false;
  const hasBase64Array = Array.isArray(record.mapImages) &&
    record.mapImages.some((m: unknown) => isBase64DataUri(m));
  const hasBase64Scalar = isBase64DataUri(record.mapImage);
  return hasBase64Array || hasBase64Scalar ||
    (Array.isArray(record.mapImages) && record.mapImages.length > 0) ||
    (typeof record.mapImage === 'string' && record.mapImage.length > 0);
}

export function isLegacyV2Hunt(record: any): record is LegacyV2HuntRecord {
  return !!record &&
    typeof record === 'object' &&
    record.schema === 'hunt.persisted.v2' &&
    Array.isArray(record.mediaAssets);
}

// ------------------------------ Strip ------------------------------

/**
 * Recursively strip any base64 image data URIs from an object. The
 * input is mutated in place AND returned. Final safeguard before any
 * AsyncStorage write.
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

// ------------------------------ Metadata helpers ------------------------------

export function extractMetadata(input: {
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  temperature?: string | number | null;
  propertyType?: string;
  region?: string;
  weatherData?: any;
  locationCoords?: { lat: number; lon: number } | null;
}): HuntMetadata {
  return {
    species: input.species,
    speciesName: input.speciesName,
    date: input.date,
    timeWindow: input.timeWindow,
    windDirection: input.windDirection,
    temperature: input.temperature ?? null,
    propertyType: input.propertyType,
    region: input.region,
    weatherData: input.weatherData,
    locationCoords: input.locationCoords ?? null,
  };
}

export function buildPersistedAnalysis(input: {
  id: string;
  createdAt?: string;
  metadata: HuntMetadata;
  analysis: any;
  mediaRefs: string[];
  primaryMediaRef: string | null;
  storageStrategy: StorageStrategy;
}): PersistedHuntAnalysis {
  return stripBase64Images({
    schema: 'hunt.analysis.v1',
    id: input.id,
    createdAt: input.createdAt || new Date().toISOString(),
    metadata: input.metadata,
    analysis: input.analysis,
    mediaRefs: input.mediaRefs,
    primaryMediaRef: input.primaryMediaRef,
    storageStrategy: input.storageStrategy,
  });
}
