// Raven Scout — Domain types (v3 split schema).
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
  | 'local-uri'          // Core / Free — local file or IndexedDB
  | 'cloud-uri'          // Pro — cloud object store (currently stubbed to local)
  | 'metadata-only';     // Fallback — no image bytes at all

export type StorageType =
  | 'local-file'         // Expo FileSystem on mobile
  | 'indexeddb'          // IndexedDB on web
  | 'cloud'              // S3/GCS/etc (future)
  | 'data-uri-legacy';   // Legacy: base64 data URI still inline (needs migration)

// ----------------------------- Media -----------------------------

/**
 * The role a media asset plays inside a hunt. `primary` is the image
 * that AI overlays are anchored on; `context` images provide additional
 * angles (Pro multi-image flow).
 */
export type MediaRole = 'primary' | 'context' | 'thumbnail';

export interface MediaAsset {
  /** Stable id unique across the app. Serves as the reference key. */
  imageId: string;
  /** Optional reverse link to the owning hunt. Useful for listMediaForHunt. */
  huntId?: string;
  /** What this image represents inside the hunt. */
  role: MediaRole;
  /** Physical backing store kind. */
  storageType: StorageType;
  /**
   * URI used to fetch the bytes.
   *  - local-file:       'file:///…' Expo path
   *  - indexeddb:        'idb://<store>/<key>'
   *  - cloud:            'https://cdn.example.com/…'
   *  - data-uri-legacy:  'data:image/jpeg;base64,…'
   */
  uri: string;
  /** Adapter-specific key — present for cloud / indexeddb. */
  storageKey?: string;
  mime: string;
  width?: number;
  height?: number;
  bytes?: number;
  createdAt: string;
}

export interface MediaInput {
  /** Base64 data URI or raw base64 string. */
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

/**
 * v3 persisted analysis record. Lives in AsyncStorage under
 * `raven_analysis_v1`. Contains NO image bytes and NO embedded
 * MediaAsset objects — only `mediaRefs` (image ids).
 */
export interface PersistedHuntAnalysis {
  schema: 'hunt.analysis.v1';
  id: string;
  createdAt: string;
  metadata: HuntMetadata;
  /** Full structured analysis JSON (LLM output: overlays, summary, v2 schema). */
  analysis: any;
  /** Image ids of related media, in capture order. */
  mediaRefs: string[];
  /** Which imageId is the primary for overlay anchoring. */
  primaryMediaRef: string | null;
  /** The strategy used when this hunt was created. */
  storageStrategy: StorageStrategy;
}

// ----------------------------- Runtime shapes -----------------------------

/**
 * Runtime hunt object. Only lives in memory during the current
 * session. Persistence always flows through the two stores.
 */
export interface RuntimeHunt extends PersistedHuntAnalysis {
  /** imageId → blob/file/data URI — never persisted. */
  displayUris?: Record<string, string>;
}

// ----------------------------- Hydrated shape (UI facing) -----------------------------

export interface HydratedMedia {
  asset: MediaAsset;
  /** The URI the UI can feed to <Image source={{uri}} />. Null if unresolvable. */
  displayUri: string | null;
  resolved: boolean;
}

export interface HydratedHuntResult {
  id: string;
  createdAt: string;
  metadata: HuntMetadata;
  analysis: any;
  /** All media for this hunt in capture order (`mediaRefs` order). */
  media: HydratedMedia[];
  /** The primary (overlay-anchor) media, or null if missing. */
  primaryMedia: HydratedMedia | null;
  /** Convenience accessor — primary's display URI or null. */
  primaryDisplayUri: string | null;
  /** Convenience accessor — all display URIs in mediaRefs order (nulls kept). */
  displayUris: (string | null)[];
  /** How many mediaRefs failed to resolve to a usable URI. */
  missingMediaCount: number;
  /** Whether any display data was served from a session-only cache. */
  fromSessionCache: boolean;
  /** Optional warning string for UX banner. */
  warning: string | null;
}

// ----------------------------- Legacy shapes (read-only) -----------------------------

/** Pre-v2 records inlined base64 directly in `mapImages`. */
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

/** v2 combined record — mediaAssets embedded inline in the analysis record. */
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
