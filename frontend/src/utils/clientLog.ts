// Raven Scout — Lightweight client-side event logger.
//
// Fire-and-forget logging for non-critical diagnostics (storage
// failures, retry counts, etc). Never blocks the UI; never throws.

import { Platform } from 'react-native';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export type ClientEvent =
  | 'storage_write_failed'
  | 'storage_quota_exceeded'
  | 'hunt_loaded_from_memory_fallback'
  | 'hunt_not_found'
  | 'persist_degraded'
  | 'legacy_hunt_migrated';

export interface ClientEventPayload {
  event: ClientEvent;
  /** Freeform context (error message, sizes, retry count, etc.) */
  data?: Record<string, unknown>;
}

export async function logClientEvent(payload: ClientEventPayload): Promise<void> {
  // Always console.log locally first — useful in Metro/web dev tools.
  try {
    // eslint-disable-next-line no-console
    console.warn(`[client-event] ${payload.event}`, payload.data ?? {});
  } catch {}

  if (!BASE) return;

  const body = {
    event: payload.event,
    data: payload.data ?? {},
    platform: Platform.OS,
    platform_version: typeof Platform.Version === 'string' || typeof Platform.Version === 'number'
      ? String(Platform.Version)
      : 'unknown',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    ts: new Date().toISOString(),
  };

  try {
    // Fire-and-forget. 3s timeout via AbortController to avoid hanging.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    await fetch(`${BASE}/api/log/client-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: 'include',
    }).catch(() => {});
    clearTimeout(t);
  } catch {
    // Swallow — this is best-effort telemetry.
  }
}
