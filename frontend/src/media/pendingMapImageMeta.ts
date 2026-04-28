// ============================================================
// Pending Saved Map Image geo metadata stash
// ============================================================
//
// Captures the geospatial metadata for each image added during the
// New Hunt flow (Task 5). Indexed by huntId, stored as an ORDER-
// PRESERVING array so the entries align 1:1 with the mapImages
// base64 array in /setup.tsx and — after upload — the hunt's
// `mediaRefs` array.
//
// /results.tsx zips this stash with `mediaRefs` after the hunt is
// upserted to derive (image_id, geo_meta) pairs and POST them via
// /api/saved-map-images. Drained entries are cleared on success;
// failures stay for retry.
//
// SHAPE
// =====
// Each entry is one of:
//   * SavedMapTilerMeta — captured from the live MapTiler view
//     (north-up, no rotation enforced by the capture script in
//     TacticalMapView.tsx)
//   * UploadedImageMeta — user-picked image; pixel-only, no bounds
//   * null — image was added but we couldn't probe dimensions /
//     extract bounds. Drained as `{source:'upload',
//     supports_geo_placement:false}` with no width/height — the
//     backend tolerates that.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = 'rs:pendingMapImageMeta:';

function storageKey(huntId: string): string {
  return `${STORAGE_KEY_PREFIX}${huntId}`;
}

export interface SavedMapTilerMeta {
  source: 'maptiler';
  supportsGeoPlacement: true;

  originalWidth: number;
  originalHeight: number;

  northLat: number;
  southLat: number;
  westLng: number;
  eastLng: number;

  centerLat: number;
  centerLng: number;
  zoom: number;
  bearing: number;
  pitch: number;

  /** MapTiler / MapLibre style URL or short style id. */
  style: string | null;
}

export interface UploadedImageMeta {
  source: 'upload';
  supportsGeoPlacement: false;

  originalWidth: number | null;
  originalHeight: number | null;

  northLat: null;
  southLat: null;
  westLng: null;
  eastLng: null;

  centerLat: null;
  centerLng: null;
  zoom: null;
  bearing: null;
  pitch: null;

  style: null;
}

export type PendingMapImageMeta = SavedMapTilerMeta | UploadedImageMeta;

/**
 * Build a default UploadedImageMeta with optional pixel dimensions.
 * Used when the user picks an image from their library.
 */
export function makeUploadMeta(
  dims: { width: number; height: number } | null,
): UploadedImageMeta {
  return {
    source: 'upload',
    supportsGeoPlacement: false,
    originalWidth: dims?.width ?? null,
    originalHeight: dims?.height ?? null,
    northLat: null,
    southLat: null,
    westLng: null,
    eastLng: null,
    centerLat: null,
    centerLng: null,
    zoom: null,
    bearing: null,
    pitch: null,
    style: null,
  };
}

export async function saveMapImageMetaList(
  huntId: string,
  metas: (PendingMapImageMeta | null)[],
): Promise<void> {
  if (!huntId) return;
  const filtered = metas.filter((m) => m !== null) as PendingMapImageMeta[];
  if (metas.length === 0 || filtered.length === 0) {
    await AsyncStorage.removeItem(storageKey(huntId)).catch(() => undefined);
    return;
  }
  // Persist the FULL array (including null slots) so order alignment
  // survives. JSON encodes nulls fine.
  try {
    await AsyncStorage.setItem(storageKey(huntId), JSON.stringify(metas));
  } catch {
    // Best-effort.
  }
}

export async function loadMapImageMetaList(
  huntId: string,
): Promise<(PendingMapImageMeta | null)[]> {
  if (!huntId) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(huntId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      // Defensive: only accept entries with a known source.
      if (entry.source !== 'maptiler' && entry.source !== 'upload') return null;
      return entry as PendingMapImageMeta;
    });
  } catch {
    return [];
  }
}

export async function clearMapImageMetaList(huntId: string): Promise<void> {
  if (!huntId) return;
  await AsyncStorage.removeItem(storageKey(huntId)).catch(() => undefined);
}

/**
 * Build the wire-format SavedMapImageCreatePayload from a stash entry +
 * the server-assigned image_id (from MediaAsset.imageId in the
 * hunt's mediaRefs).
 */
export function buildSavedMapImagePayload(
  imageId: string,
  huntId: string,
  meta: PendingMapImageMeta,
) {
  if (meta.source === 'maptiler') {
    return {
      image_id: imageId,
      hunt_id: huntId,
      original_width: meta.originalWidth,
      original_height: meta.originalHeight,
      north_lat: meta.northLat,
      south_lat: meta.southLat,
      west_lng: meta.westLng,
      east_lng: meta.eastLng,
      center_lat: meta.centerLat,
      center_lng: meta.centerLng,
      zoom: meta.zoom,
      bearing: meta.bearing,
      pitch: meta.pitch,
      source: 'maptiler' as const,
      style: meta.style,
      supports_geo_placement: true,
    };
  }
  return {
    image_id: imageId,
    hunt_id: huntId,
    original_width: meta.originalWidth ?? null,
    original_height: meta.originalHeight ?? null,
    north_lat: null,
    south_lat: null,
    west_lng: null,
    east_lng: null,
    center_lat: null,
    center_lng: null,
    zoom: null,
    bearing: null,
    pitch: null,
    source: 'upload' as const,
    style: null,
    supports_geo_placement: false,
  };
}
