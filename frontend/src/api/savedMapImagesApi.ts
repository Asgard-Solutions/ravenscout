// ============================================================
// Saved Map Image geo-metadata API client
// ============================================================
//
// Wraps /api/saved-map-images so the frontend can persist the geo
// bounds + camera state captured at the moment a MapTiler image is
// generated, or the basic pixel-only metadata for an uploaded image.
//
// Mirrors the wire shape from /app/backend/models/saved_map_image.py.
// All calls are non-throwing and return ApiResult<T> so the UI can
// surface a toast without bringing the surrounding flow down.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { BACKEND_URL } from '../constants/theme';
import { logClientEvent } from '../utils/clientLog';
import type { SavedMapImageWire } from '../types/geo';

const SESSION_TOKEN_KEY = 'session_token';

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function resolveBackendUrl(): string {
  if (BACKEND_URL && typeof BACKEND_URL === 'string') return BACKEND_URL;
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; status?: number; error?: string };

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const token = await getToken();
  if (!token) return { ok: false, reason: 'no_session' };
  try {
    const res = await fetch(`${resolveBackendUrl()}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = (j && (j.detail || j.error)) || '';
        if (typeof detail !== 'string') detail = JSON.stringify(detail);
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        reason: `http_${res.status}`,
        status: res.status,
        error: detail,
      };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, reason: 'network', error: err?.message || String(err) };
  }
}

/**
 * Wire-format payload accepted by POST /api/saved-map-images.
 * Mirrors the SavedMapImageCreate Pydantic model exactly.
 */
export interface SavedMapImageCreatePayload {
  image_id: string;
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

  source?: 'maptiler' | 'upload';
  style?: string | null;

  supports_geo_placement?: boolean;
}

export async function upsertSavedMapImage(
  payload: SavedMapImageCreatePayload,
): Promise<ApiResult<{ ok: true; saved_map_image: SavedMapImageWire }>> {
  const result = await request<{ ok: true; saved_map_image: SavedMapImageWire }>(
    'POST',
    '/api/saved-map-images',
    payload,
  );
  if (!result.ok) {
    logClientEvent({
      event: 'saved_map_image_upsert_failed',
      data: {
        image_id: payload.image_id,
        source: payload.source,
        supports_geo_placement: payload.supports_geo_placement,
        reason: result.reason,
        status: (result as any).status,
      },
    });
  }
  return result;
}

export async function getSavedMapImage(
  imageId: string,
): Promise<ApiResult<{ ok: true; saved_map_image: SavedMapImageWire }>> {
  return request<{ ok: true; saved_map_image: SavedMapImageWire }>(
    'GET',
    `/api/saved-map-images/${encodeURIComponent(imageId)}`,
  );
}

export async function listSavedMapImages(
  huntId?: string,
): Promise<
  ApiResult<{ ok: true; saved_map_images: SavedMapImageWire[]; count: number }>
> {
  const qs = huntId ? `?hunt_id=${encodeURIComponent(huntId)}` : '';
  return request<{
    ok: true;
    saved_map_images: SavedMapImageWire[];
    count: number;
  }>('GET', `/api/saved-map-images${qs}`);
}

export async function deleteSavedMapImage(
  imageId: string,
): Promise<ApiResult<{ ok: true; deleted: number }>> {
  return request<{ ok: true; deleted: number }>(
    'DELETE',
    `/api/saved-map-images/${encodeURIComponent(imageId)}`,
  );
}
