// Raven Scout — Geo / GPS domain types.
//
// Mirrors the Pydantic models in backend/models/saved_map_image.py
// and backend/models/hunt_location_asset.py. Keep field names and
// enum members in sync with those files — this file is the join
// schema between the API responses and the frontend.
//
// NOTE on naming:
//   - The wire format uses snake_case (hunt_id, image_id, north_lat…)
//     because the backend stores Mongo docs that way.
//   - This file exposes camelCase aliases via mapper helpers so UI
//     code can use the JS-idiomatic shape without clashing with the
//     existing src/media/types.ts conventions.

// ---------- Hunt Location Assets ----------

export const HUNT_LOCATION_ASSET_TYPES = [
  'stand',
  'blind',
  'feeder',
  'camera',
  'parking',
  'access_point',
  'water',
  'scrape',
  'rub',
  'bedding',
  'custom',
] as const;

export type HuntLocationAssetType = (typeof HUNT_LOCATION_ASSET_TYPES)[number];

/** Wire shape returned by the backend. */
export interface HuntLocationAssetWire {
  asset_id: string;
  user_id: string;
  hunt_id: string;
  type: HuntLocationAssetType;
  name: string;
  latitude: number;
  longitude: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

/** UI-friendly shape (camelCase). */
export interface HuntLocationAsset {
  id: string;
  userId: string;
  huntId: string;
  type: HuntLocationAssetType;
  name: string;
  latitude: number;
  longitude: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function huntLocationAssetFromWire(
  w: HuntLocationAssetWire,
): HuntLocationAsset {
  return {
    id: w.asset_id,
    userId: w.user_id,
    huntId: w.hunt_id,
    type: w.type,
    name: w.name,
    latitude: w.latitude,
    longitude: w.longitude,
    notes: w.notes ?? null,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

// ---------- Saved Map Image geo metadata ----------

export const SAVED_MAP_IMAGE_SOURCES = ['maptiler', 'upload'] as const;
export type SavedMapImageSource = (typeof SAVED_MAP_IMAGE_SOURCES)[number];

export interface SavedMapImageWire {
  image_id: string;
  user_id: string;
  hunt_id?: string | null;

  image_url?: string | null;

  original_width?: number | null;
  original_height?: number | null;

  north_lat?: number | null;
  south_lat?: number | null;
  west_lng?: number | null;
  east_lng?: number | null;

  center_lat?: number | null;
  center_lng?: number | null;
  zoom?: number | null;
  bearing?: number | null;
  pitch?: number | null;

  source: SavedMapImageSource;
  style?: string | null;

  supports_geo_placement: boolean;

  created_at: string;
  updated_at: string;
}

/** UI-friendly shape (camelCase, matches the spec exactly). */
export interface SavedMapImage {
  id: string;                         // image_id (the join key)
  imageUrl: string | null;
  originalWidth: number | null;
  originalHeight: number | null;

  northLat: number | null;
  southLat: number | null;
  westLng: number | null;
  eastLng: number | null;

  centerLat: number | null;
  centerLng: number | null;
  zoom: number | null;
  bearing: number | null;
  pitch: number | null;

  source: SavedMapImageSource;
  style: string | null;

  supportsGeoPlacement: boolean;

  createdAt: string;
  updatedAt: string;
}

export function savedMapImageFromWire(w: SavedMapImageWire): SavedMapImage {
  return {
    id: w.image_id,
    imageUrl: w.image_url ?? null,
    originalWidth: w.original_width ?? null,
    originalHeight: w.original_height ?? null,
    northLat: w.north_lat ?? null,
    southLat: w.south_lat ?? null,
    westLng: w.west_lng ?? null,
    eastLng: w.east_lng ?? null,
    centerLat: w.center_lat ?? null,
    centerLng: w.center_lng ?? null,
    zoom: w.zoom ?? null,
    bearing: w.bearing ?? null,
    pitch: w.pitch ?? null,
    source: w.source ?? 'upload',
    style: w.style ?? null,
    supportsGeoPlacement: Boolean(w.supports_geo_placement),
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

// ---------- Shared validation (mirrors backend/geo_validation.py) ----------

export function isValidLatitude(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

export function isValidLongitude(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

export function isValidLatLng(
  lat: unknown,
  lng: unknown,
): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng);
}
