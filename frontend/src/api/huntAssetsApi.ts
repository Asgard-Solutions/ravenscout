// ============================================================
// Hunt Location Assets API client
// ============================================================
//
// Wraps the /api/hunts/{hunt_id}/assets CRUD endpoints. Mirrors the
// shape of HuntLocationAsset on the backend (see
// /app/backend/models/hunt_location_asset.py).
//
// All calls are non-throwing: any network / auth failure is logged
// via the client-event channel and returned as `{ ok: false, reason }`
// so the UI can surface a toast without bringing down the surrounding
// flow. This matches the contract used by huntsApi.ts.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { BACKEND_URL } from '../constants/theme';
import { logClientEvent } from '../utils/clientLog';
import type {
  HuntLocationAssetType,
  HuntLocationAssetWire,
} from '../types/geo';

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

export interface HuntLocationAssetCreatePayload {
  type: HuntLocationAssetType;
  name: string;
  latitude: number;
  longitude: number;
  notes?: string | null;
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
  if (!headers) {
    return { ok: false, reason: 'no_session' };
  }
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
// CRUD
// ----------------------------------------------------------------

export async function createHuntAsset(
  huntId: string,
  payload: HuntLocationAssetCreatePayload,
): Promise<ApiResult<{ ok: true; asset: HuntLocationAssetWire }>> {
  const result = await request<{ ok: true; asset: HuntLocationAssetWire }>(
    'POST',
    `/api/hunts/${encodeURIComponent(huntId)}/assets`,
    payload,
  );
  if (!result.ok) {
    logClientEvent({
      event: 'hunt_asset_create_failed',
      data: {
        hunt_id: huntId,
        type: payload.type,
        reason: result.reason,
        status: (result as any).status,
      },
    });
  }
  return result;
}

export async function listHuntAssets(
  huntId: string,
): Promise<
  ApiResult<{ ok: true; assets: HuntLocationAssetWire[]; count: number }>
> {
  return request<{ ok: true; assets: HuntLocationAssetWire[]; count: number }>(
    'GET',
    `/api/hunts/${encodeURIComponent(huntId)}/assets`,
  );
}

export async function updateHuntAsset(
  huntId: string,
  assetId: string,
  patch: Partial<HuntLocationAssetCreatePayload>,
): Promise<ApiResult<{ ok: true; asset: HuntLocationAssetWire }>> {
  return request<{ ok: true; asset: HuntLocationAssetWire }>(
    'PUT',
    `/api/hunts/${encodeURIComponent(huntId)}/assets/${encodeURIComponent(assetId)}`,
    patch,
  );
}

export async function deleteHuntAsset(
  huntId: string,
  assetId: string,
): Promise<ApiResult<{ ok: true; deleted: number }>> {
  return request<{ ok: true; deleted: number }>(
    'DELETE',
    `/api/hunts/${encodeURIComponent(huntId)}/assets/${encodeURIComponent(assetId)}`,
  );
}

// ----------------------------------------------------------------
// Bulk helper
// ----------------------------------------------------------------
//
// Used by the post-finalize step in /results.tsx to drain any
// pending assets stashed during the New Hunt flow. Idempotent:
// callers pass a list of payloads + an optional set of
// already-committed local ids; the helper returns the per-payload
// outcome so the caller can record which ones successfully created.

export interface BulkAssetCreateOutcome {
  /** index into the input list */
  index: number;
  ok: boolean;
  /** server-assigned asset_id if ok */
  assetId?: string;
  reason?: string;
  status?: number;
  error?: string;
}

export async function bulkCreateHuntAssets(
  huntId: string,
  payloads: HuntLocationAssetCreatePayload[],
): Promise<BulkAssetCreateOutcome[]> {
  const out: BulkAssetCreateOutcome[] = [];
  for (let i = 0; i < payloads.length; i++) {
    // Sequential POSTs — keeps server-side ordering deterministic
    // (created_at sort) and avoids accidentally racing the auth
    // token refresh path on slow networks. The total volume here is
    // small (typically <10 assets per hunt) so parallelism gain is
    // negligible.
    /* eslint-disable no-await-in-loop */
    const r = await createHuntAsset(huntId, payloads[i]);
    if (r.ok) {
      out.push({ index: i, ok: true, assetId: r.data.asset.asset_id });
    } else {
      out.push({
        index: i,
        ok: false,
        reason: r.reason,
        status: (r as any).status,
        error: (r as any).error,
      });
    }
    /* eslint-enable no-await-in-loop */
  }
  return out;
}
