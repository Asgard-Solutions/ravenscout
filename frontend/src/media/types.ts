// Raven Scout — Media + persistence type definitions.
//
// KEY RULE:
//   A `MediaAsset` is the *persisted* reference to an image. It MUST
//   NEVER contain base64 bytes. Base64 only exists transiently in
//   memory during analysis / ingestion as `RuntimeMediaAsset.inlineBase64`.

// ------------------------------ Strategy ------------------------------

/** Where and how media for a hunt is stored. */
export type StorageStrategy =
  | 'local-uri'          // Core / Free — local file or IndexedDB
  | 'cloud-uri'          // Pro — cloud object store (currently stubbed to local)
  | 'metadata-only';     // Fallback — no image bytes at all

/** Backing storage implementation. */
export type StorageType =
  | 'local-file'         // Expo FileSystem on mobile
  | 'indexeddb'          // IndexedDB on web
  | 'cloud'              // S3/GCS/etc (future)
  | 'data-uri-legacy';   // Legacy: base64 data URI still inline (needs migration)

// ------------------------------ Assets ------------------------------

export interface MediaAsset {
  /** Stable id unique to this asset across the app. */
  assetId: string;
  /** How the asset is physically stored. */
  storageType: StorageType;
  /**
   * Where to load the bytes from.
   *  - local-file: 'file:///…' Expo path
   *  - indexeddb: 'idb://<storeName>/<key>'  — resolve via IndexedDBMediaStore
   *  - cloud:     'https://cdn.example.com/…'
   *  - data-uri-legacy: 'data:image/jpeg;base64,…'  (will be migrated)
   */
  uri: string;
  /** Optional adapter-specific key — present for cloud/indexeddb. */
  storageKey?: string;
  mime: string;
  width?: number;
  height?: number;
  bytes?: number;
  createdAt: string;
  /**
   * Tiny (≤ 4 KB) data URI preview for list/history thumbnails. Optional;
   * safePersist() will drop this first when payload is too big.
   */
  thumbnail?: string;
}

export interface MediaInput {
  /** Either a base64 data URI or a raw base64 string — both accepted. */
  base64: string;
  mime?: string;
  width?: number;
  height?: number;
}

/** Transient in-memory wrapper — may carry live base64 bytes. */
export interface RuntimeMediaAsset {
  asset: MediaAsset;
  /** Base64 data URI used for display / analysis. NEVER persist. */
  inlineBase64?: string;
}

// ------------------------------ Hunt shapes ------------------------------

/**
 * The current, persisted hunt record shape (v2 of persistence).
 * Contains MediaAsset references — NEVER raw base64.
 */
export interface PersistedHunt {
  /** Marker so migrators can detect shape without inspection. */
  schema: 'hunt.persisted.v2';
  id: string;
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  temperature?: string | number | null;
  propertyType?: string;
  region?: string;
  /** Analysis output + overlays. Unchanged across persistence. */
  result: any;
  weatherData?: any;
  locationCoords?: { lat: number; lon: number } | null;
  createdAt: string;
  /** Media references — never inlined bytes. */
  mediaAssets: MediaAsset[];
  primaryMediaIndex: number;
  /** Which strategy produced this record (for loader + analytics). */
  storageStrategy: StorageStrategy;
}

/**
 * Runtime hunt record used by the UI layer. Media is resolved to
 * display URIs on-demand via `mediaStore.resolve()`.
 */
export interface RuntimeHunt extends Omit<PersistedHunt, 'mediaAssets'> {
  mediaAssets: MediaAsset[];
  /** Display URIs aligned to mediaAssets. Populated lazily. */
  mediaDisplayUris?: (string | null)[];
}

/** A legacy hunt record from before v2 persistence. Only read, never written. */
export interface LegacyHuntRecord {
  id: string;
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  mapImage?: string;        // base64 data URI
  mapImages?: string[];     // base64 data URIs
  primaryMapIndex?: number;
  result: any;
  weatherData?: any;
  locationCoords?: { lat: number; lon: number } | null;
  createdAt: string;
  temperature?: string | number | null;
  propertyType?: string;
  region?: string;
}
