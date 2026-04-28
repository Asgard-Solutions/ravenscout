// ============================================================
// Analysis Overlay Items API client
// ============================================================
//
// Wraps the persisted `analysis_overlay_items` CRUD endpoints
// (see /app/backend/hunt_geo_router.py). These are the items that
// Task 9's SavedAnalysisOverlayImage renders on top of saved map
// images, using the original-image x/y coordinates the backend
// stores.
//
// All calls are non-throwing — failures return
// `{ ok: false, reason }` so the consuming UI can fall back to the
// in-memory analysis state without crashing.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { BACKEND_URL } from '../constants/theme';
import {
  type AnalysisOverlayItem,
  type AnalysisOverlayItemWire,
  analysisOverlayItemFromWire,
} from '../types/geo';
import { logClientEvent } from '../utils/clientLog';

const SESSION_TOKEN_KEY = 'session_token';

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getToken();
  if (!token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function resolveBackendUrl(): string {
  if (BACKEND_URL && typeof BACKEND_URL === 'string') return BACKEND_URL;
  return process.env.EXPO_PUBLIC_BACKEND_URL || '';
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; status?: number; error?: string };

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, reason: 'no_session' };
  try {
    const res = await fetch(`${resolveBackendUrl()}${path}`, {
      method,
      headers,
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

// ----------------------------------------------------------------
// List
// ----------------------------------------------------------------

export async function listOverlayItems(
  huntId: string,
  opts?: { analysisId?: string },
): Promise<ApiResult<{ items: AnalysisOverlayItem[]; count: number }>> {
  const qs = opts?.analysisId
    ? `?analysis_id=${encodeURIComponent(opts.analysisId)}`
    : '';
  const result = await request<{
    ok: true;
    overlay_items: AnalysisOverlayItemWire[];
    count: number;
  }>('GET', `/api/hunts/${encodeURIComponent(huntId)}/overlay-items${qs}`);

  if (!result.ok) {
    logClientEvent({
      event: 'overlay_items_list_failed',
      data: {
        hunt_id: huntId,
        analysis_id: opts?.analysisId || null,
        reason: result.reason,
        status: (result as any).status,
      },
    });
    return result;
  }
  const items = (result.data.overlay_items || []).map(analysisOverlayItemFromWire);
  return { ok: true, data: { items, count: result.data.count } };
}

// ----------------------------------------------------------------
// Bulk normalize + persist (Task 8 endpoint passthrough)
// ----------------------------------------------------------------

export interface BulkNormalizeItemPayload {
  type: string;
  label: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  x?: number | null;
  y?: number | null;
  coordinateSource?: string;
  sourceAssetId?: string | null;
  confidence?: number | null;
}

export interface BulkNormalizeResponse {
  ok: true;
  created_count: number;
  skipped_count: number;
  created: AnalysisOverlayItemWire[];
  skipped: Array<{ index: number; reason: string }>;
}

export async function bulkNormalizeOverlayItems(
  huntId: string,
  payload: {
    items: BulkNormalizeItemPayload[];
    analysisId?: string | null;
    savedMapImageId?: string | null;
  },
): Promise<ApiResult<BulkNormalizeResponse>> {
  return request<BulkNormalizeResponse>(
    'POST',
    `/api/hunts/${encodeURIComponent(huntId)}/overlay-items:bulk-normalize`,
    {
      items: payload.items,
      analysis_id: payload.analysisId ?? null,
      saved_map_image_id: payload.savedMapImageId ?? null,
    },
  );
}

// ----------------------------------------------------------------
// Delete (utility — used by future marker CRUD)
// ----------------------------------------------------------------

export async function deleteOverlayItem(
  huntId: string,
  itemId: string,
): Promise<ApiResult<{ ok: true; deleted: number }>> {
  return request<{ ok: true; deleted: number }>(
    'DELETE',
    `/api/hunts/${encodeURIComponent(huntId)}/overlay-items/${encodeURIComponent(itemId)}`,
  );
}
