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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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
// Create
// ----------------------------------------------------------------

export interface CreateOverlayItemPayload {
  type: string;
  label: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  x?: number | null;
  y?: number | null;
  coordinateSource: string;
  sourceAssetId?: string | null;
  confidence?: number | null;
  savedMapImageId?: string | null;
  analysisId?: string | null;
}

export async function createOverlayItem(
  huntId: string,
  payload: CreateOverlayItemPayload,
): Promise<ApiResult<{ overlay_item: AnalysisOverlayItemWire }>> {
  const body: Record<string, unknown> = {
    hunt_id: huntId,
    type: payload.type,
    label: payload.label,
    coordinate_source: payload.coordinateSource,
  };
  if (payload.description !== undefined && payload.description !== null) {
    body.description = payload.description;
  }
  if (payload.latitude !== undefined) body.latitude = payload.latitude;
  if (payload.longitude !== undefined) body.longitude = payload.longitude;
  if (payload.x !== undefined) body.x = payload.x;
  if (payload.y !== undefined) body.y = payload.y;
  if (payload.confidence !== undefined && payload.confidence !== null) {
    body.confidence = payload.confidence;
  }
  if (payload.sourceAssetId) body.source_asset_id = payload.sourceAssetId;
  if (payload.savedMapImageId) body.saved_map_image_id = payload.savedMapImageId;
  if (payload.analysisId) body.analysis_id = payload.analysisId;

  const result = await request<{
    ok: true;
    overlay_item: AnalysisOverlayItemWire;
  }>(
    'POST',
    `/api/hunts/${encodeURIComponent(huntId)}/overlay-items`,
    body,
  );
  if (!result.ok) {
    logClientEvent({
      event: 'overlay_item_create_failed',
      data: {
        hunt_id: huntId,
        type: payload.type,
        coord_src: payload.coordinateSource,
        reason: result.reason,
        status: (result as any).status,
      },
    });
  }
  return result;
}

// ----------------------------------------------------------------
// Update
// ----------------------------------------------------------------

export type UpdateOverlayItemPayload = Partial<CreateOverlayItemPayload>;

export async function updateOverlayItem(
  huntId: string,
  itemId: string,
  patch: UpdateOverlayItemPayload,
): Promise<ApiResult<{ overlay_item: AnalysisOverlayItemWire }>> {
  // Convert camelCase → snake_case for the Pydantic update model.
  const body: Record<string, unknown> = {};
  if (patch.type !== undefined) body.type = patch.type;
  if (patch.label !== undefined) body.label = patch.label;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.latitude !== undefined) body.latitude = patch.latitude;
  if (patch.longitude !== undefined) body.longitude = patch.longitude;
  if (patch.x !== undefined) body.x = patch.x;
  if (patch.y !== undefined) body.y = patch.y;
  if (patch.coordinateSource !== undefined) body.coordinate_source = patch.coordinateSource;
  if (patch.sourceAssetId !== undefined) body.source_asset_id = patch.sourceAssetId;
  if (patch.confidence !== undefined) body.confidence = patch.confidence;

  return request<{ ok: true; overlay_item: AnalysisOverlayItemWire }>(
    'PUT',
    `/api/hunts/${encodeURIComponent(huntId)}/overlay-items/${encodeURIComponent(itemId)}`,
    body,
  );
}

// ----------------------------------------------------------------
// Persist AI-returned overlays for a hunt
// ----------------------------------------------------------------

export interface AiOverlayInput {
  type: string;
  label: string;
  x_percent: number;
  y_percent: number;
  reasoning?: string | null;
  confidence?: string | null;
}

export async function persistOverlaysFromAiAnalysis(
  huntId: string,
  payload: {
    analysisId?: string | null;
    savedMapImageId?: string | null;
    aiOverlays: AiOverlayInput[];
  },
): Promise<ApiResult<{ ok: boolean; persisted: number; skipped: number; reason?: string | null }>> {
  return request(
    'POST',
    `/api/hunts/${encodeURIComponent(huntId)}/overlay-items:from-ai-analysis`,
    {
      analysis_id: payload.analysisId ?? null,
      saved_map_image_id: payload.savedMapImageId ?? null,
      ai_overlays: payload.aiOverlays,
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
