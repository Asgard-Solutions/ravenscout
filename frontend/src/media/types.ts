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
  /**
   * Pro-tier fallback flag. Set to true when a Pro user's image
   * could not be uploaded to the cloud (offline, presign failure, etc.)
   * and the bytes are being retained on the device as a temporary
   * fallback. The media record is still usable — the UI should render
   * normally — and a future sync pass can retry the upload.
   */
  pendingCloudSync?: boolean;
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
  /**
   * Canonical hunt-style id (see src/constants/huntStyles.ts).
   * NEVER stored as freeform display text — only canonical ids
   * reach this field so the prompt pipeline and re-analyze flows
   * stay consistent.
   */
  huntStyle?: string | null;
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
  /**
   * Frozen snapshot of the exact image + GPS used to produce the
   * analysis result. Source of truth for overlay rendering — takes
   * precedence over metadata.locationCoords (the hunt-level default)
   * and over primaryMediaRef (which may become stale if the user
   * later re-selects the primary image).
   *
   * Absent on records created before v3.1. Callers should fall back
   * to primaryMediaRef + metadata.locationCoords in that case.
   */
  analysisContext?: AnalysisContext | null;
}

// ----------------------------- Analysis context -----------------------------

export interface OverlayCalibration {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  anchorPoints?: Array<{ x: number; y: number }>;
}

export interface AnalysisContext {
  schema: 'analysis-context.v1';
  imageId: string;
  gps: { lat: number; lon: number } | null;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  overlayCalibration: OverlayCalibration | null;
  /** 'valid' when the analysis context is in sync with the saved
   *  media + overlays; 'stale' when the basis has changed (image
   *  switched, GPS changed, anchors moved) and overlays should not
   *  be rendered as authoritative. */
  overlayStatus: 'valid' | 'stale';
  lockedAt: string;
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
  /** Frozen analysis basis: the exact image + GPS that produced the
   *  overlays. Always prefer this over `metadata.locationCoords` when
   *  present. May be null on records created before v3.1. */
  analysisContext: AnalysisContext | null;
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
