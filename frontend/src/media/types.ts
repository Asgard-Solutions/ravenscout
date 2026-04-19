// Raven Scout — Domain types (v3 split schema).
//
// SUPPORTED RUNTIME: native mobile (iOS / Android) only.
// Any references to `indexeddb` or web object URLs in this file are
// strictly for reading legacy records that might have been written
// during earlier web-preview testing. No new writes target those
// storage types.
//
// ARCHITECTURAL INVARIANT:
//   - Analysis records (PersistedHuntAnalysis) NEVER carry image bytes
//     or MediaAsset objects. They store only `mediaRefs: string[]`
//     (image ids).
//   - MediaAsset records live in the Media Index store and point at
//     binary storage handled by platform adapters.
//   - UI code consumes `HydratedHuntResult` which joins the two.

// ----------------------------- Strategy -----------------------------

export type StorageStrategy =
  | 'local-uri'          // Core / Free — Expo FileSystem (device)
  | 'cloud-uri'          // Pro — cloud object store (stubbed today)
  | 'metadata-only';     // Fallback — no image bytes at all

export type StorageType =
  | 'local-file'         // Expo FileSystem on device (primary)
  | 'cloud'              // S3/GCS/etc (future, currently stubbed)
  | 'data-uri-legacy'    // Legacy: base64 data URI still inline (needs migration)
  | 'indexeddb';         // QUARANTINED: legacy web-preview records only. Never written by current code.

// ----------------------------- Media -----------------------------

export type MediaRole = 'primary' | 'context' | 'thumbnail';

export interface MediaAsset {
  imageId: string;
  huntId?: string;
  role: MediaRole;
  storageType: StorageType;
  /**
   * URI used to fetch the bytes.
   *  - local-file:       'file:///…' Expo path (primary)
   *  - cloud:            'https://cdn.example.com/…'
   *  - data-uri-legacy:  'data:image/jpeg;base64,…'
   *  - indexeddb:        'idb://<store>/<key>'  (quarantined; legacy reads only)
   */
  uri: string;
  storageKey?: string;
  mime: string;
  width?: number;
  height?: number;
  bytes?: number;
  createdAt: string;
  /**
   * If present, points to a `role='thumbnail'` MediaAsset imageId.
   * Only set on `role='primary'` assets.
   */
  thumbnailRef?: string;
}

export interface MediaInput {
  base64: string;
  mime?: string;
  width?: number;
  height?: number;
}

// ----------------------------- Hunt metadata -----------------------------

export interface HuntMetadata {
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
}

// ----------------------------- Persisted shapes -----------------------------

export interface PersistedHuntAnalysis {
  schema: 'hunt.analysis.v1';
  id: string;
  createdAt: string;
  metadata: HuntMetadata;
  analysis: any;
  mediaRefs: string[];
  primaryMediaRef: string | null;
  storageStrategy: StorageStrategy;
}

// ----------------------------- Runtime shapes -----------------------------

export interface RuntimeHunt extends PersistedHuntAnalysis {
  displayUris?: Record<string, string>;
}

// ----------------------------- Hydrated shape -----------------------------

export interface HydratedMedia {
  asset: MediaAsset;
  displayUri: string | null;
  resolved: boolean;
}

export interface HydratedHuntResult {
  id: string;
  createdAt: string;
  metadata: HuntMetadata;
  analysis: any;
  media: HydratedMedia[];
  primaryMedia: HydratedMedia | null;
  primaryDisplayUri: string | null;
  displayUris: (string | null)[];
  missingMediaCount: number;
  fromSessionCache: boolean;
  warning: string | null;
}

// ----------------------------- Legacy shapes (read-only) -----------------------------

export interface LegacyV1HuntRecord {
  id: string;
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  mapImage?: string;
  mapImages?: string[];
  primaryMapIndex?: number;
  result: any;
  weatherData?: any;
  locationCoords?: { lat: number; lon: number } | null;
  createdAt: string;
  temperature?: string | number | null;
  propertyType?: string;
  region?: string;
}

export interface LegacyV2HuntRecord {
  schema: 'hunt.persisted.v2';
  id: string;
  createdAt: string;
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  result: any;
  weatherData?: any;
  locationCoords?: { lat: number; lon: number } | null;
  mediaAssets: Array<{
    assetId?: string;
    imageId?: string;
    storageType: StorageType;
    uri: string;
    storageKey?: string;
    mime: string;
    width?: number;
    height?: number;
    bytes?: number;
    createdAt: string;
  }>;
  primaryMediaIndex?: number;
  temperature?: string | number | null;
  propertyType?: string;
  region?: string;
  storageStrategy?: StorageStrategy;
}
