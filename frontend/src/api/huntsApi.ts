// ============================================================
// Hunts API client — server-side hunt persistence (MongoDB).
// ============================================================
//
// Wraps POST/GET/PUT/DELETE /api/hunts. Mirrors the shape of the
// local `PersistedHuntAnalysis` record so `finalizeProvisionalHunt`
// can fire-and-forget an upsert without reshaping the payload.
//
// Auth: reads the session token from AsyncStorage (same key used by
// `useAuth.tsx`). If there's no token we no-op — the user may still
// be on the login screen or session-expired, and local AsyncStorage
// persistence remains the source of truth for that case.
//
// All methods are non-throwing from the caller's perspective: any
// network / auth failure is logged via the client-event channel and
// returned as `{ ok: false, reason }`. This keeps the UI free of
// transient "couldn't sync" dialogs and lets the local store stay
// authoritative when the cloud is unreachable.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { BACKEND_URL } from '../constants/theme';
import { logClientEvent } from '../utils/clientLog';

const SESSION_TOKEN_KEY = 'session_token';

/**
 * Server-side hunt document (as returned by the backend).
 * Timestamps are ISO-8601 strings; numeric fields are plain numbers.
 */
export interface ServerHunt {
  user_id: string;
  hunt_id: string;
  created_at?: string;
  updated_at?: string;
  metadata: Record<string, any>;
  analysis?: Record<string, any>;
  analysis_context?: Record<string, any>;
  media_refs?: string[];
  primary_media_ref?: string | null;
  image_s3_keys?: string[];
  storage_strategy?: string | null;
  extra?: Record<string, any>;
}

export interface HuntUpsertPayload {
  huntId: string;
  metadata: Record<string, any>;
  analysis?: Record<string, any>;
  analysisContext?: Record<string, any>;
  mediaRefs?: string[];
  primaryMediaRef?: string | null;
  imageS3Keys?: string[];
  storageStrategy?: string | null;
  extra?: Record<string, any>;
}

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; reason: string; status?: number; error?: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

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
  // BACKEND_URL is loaded from EXPO_PUBLIC_BACKEND_URL at build time.
  // Trim any trailing slash so `${BACKEND_URL}/api/...` is predictable.
  const raw = (BACKEND_URL || '').trim();
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, any>,
): Promise<ApiResult<T>> {
  const headers = await authHeaders();
  if (!headers) {
    return { ok: false, reason: 'no_session_token' };
  }
  const url = `${resolveBackendUrl()}${path}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err: any) {
    return {
      ok: false,
      reason: 'network_error',
      error: err?.message || String(err),
    };
  }

  if (!resp.ok) {
    let detail = '';
    try {
      const j = await resp.json();
      detail = j?.detail || JSON.stringify(j);
    } catch {
      try {
        detail = await resp.text();
      } catch {}
    }
    return {
      ok: false,
      reason: 'http_error',
      status: resp.status,
      error: detail?.slice(0, 200),
    };
  }

  try {
    const json = (await resp.json()) as T;
    return { ok: true, data: json };
  } catch (err: any) {
    return {
      ok: false,
      reason: 'parse_error',
      error: err?.message || String(err),
    };
  }
}

// ------------------------------ Upsert ------------------------------

export async function upsertHunt(
  input: HuntUpsertPayload,
): Promise<ApiResult<{ ok: true; hunt: ServerHunt }>> {
  const body = {
    hunt_id: input.huntId,
    metadata: input.metadata || {},
    analysis: input.analysis ?? null,
    analysis_context: input.analysisContext ?? null,
    media_refs: input.mediaRefs ?? [],
    primary_media_ref: input.primaryMediaRef ?? null,
    image_s3_keys: input.imageS3Keys ?? [],
    storage_strategy: input.storageStrategy ?? null,
    extra: input.extra ?? {},
  };

  const result = await request<{ ok: true; hunt: ServerHunt }>(
    'POST',
    '/api/hunts',
    body,
  );

  // Telemetry — helps track cloud-sync coverage in aggregate.
  if (result.ok) {
    logClientEvent({
      event: 'hunt_cloud_upsert_ok',
      data: { hunt_id: input.huntId },
    });
  } else {
    logClientEvent({
      event: 'hunt_cloud_upsert_failed',
      data: {
        hunt_id: input.huntId,
        reason: result.reason,
        status: (result as ApiErr).status,
        error: (result as ApiErr).error,
      },
    });
  }
  return result;
}

// ------------------------------ List ------------------------------

export async function listHuntsFromCloud(
  limit = 50,
  skip = 0,
): Promise<ApiResult<{ ok: true; total: number; hunts: ServerHunt[] }>> {
  return request<{ ok: true; total: number; hunts: ServerHunt[] }>(
    'GET',
    `/api/hunts?limit=${limit}&skip=${skip}`,
  );
}

// ------------------------------ Read one ------------------------------

export async function getHuntFromCloud(
  huntId: string,
): Promise<ApiResult<{ ok: true; hunt: ServerHunt }>> {
  return request<{ ok: true; hunt: ServerHunt }>('GET', `/api/hunts/${encodeURIComponent(huntId)}`);
}

// ------------------------------ Patch ------------------------------

export async function patchHunt(
  huntId: string,
  patch: Partial<HuntUpsertPayload>,
): Promise<ApiResult<{ ok: true; hunt: ServerHunt }>> {
  const body: Record<string, any> = {};
  if (patch.metadata !== undefined) body.metadata = patch.metadata;
  if (patch.analysis !== undefined) body.analysis = patch.analysis;
  if (patch.analysisContext !== undefined) body.analysis_context = patch.analysisContext;
  if (patch.mediaRefs !== undefined) body.media_refs = patch.mediaRefs;
  if (patch.primaryMediaRef !== undefined) body.primary_media_ref = patch.primaryMediaRef;
  if (patch.imageS3Keys !== undefined) body.image_s3_keys = patch.imageS3Keys;
  if (patch.storageStrategy !== undefined) body.storage_strategy = patch.storageStrategy;
  if (patch.extra !== undefined) body.extra = patch.extra;
  return request<{ ok: true; hunt: ServerHunt }>(
    'PUT',
    `/api/hunts/${encodeURIComponent(huntId)}`,
    body,
  );
}

// ------------------------------ Delete ------------------------------

export async function deleteHuntFromCloud(
  huntId: string,
): Promise<ApiResult<{ ok: true; deleted: number }>> {
  return request<{ ok: true; deleted: number }>(
    'DELETE',
    `/api/hunts/${encodeURIComponent(huntId)}`,
  );
}
