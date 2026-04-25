/**
 * Raven Scout — analytics usage hook.
 *
 * Server is the source of truth: every render path that needs to
 * know how many analyses the user has left should `refresh()` after
 * any state-changing event (analyze success, purchase success,
 * cycle reset). Local cached state is fine for display while we
 * fetch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAnalyticsUsage, type AnalyticsUsage } from '../api/analyticsApi';

export interface UseAnalyticsUsageResult {
  usage: AnalyticsUsage | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch from the server. Safe to call concurrently. */
  refresh: () => Promise<AnalyticsUsage | null>;
}

export function useAnalyticsUsage(autoFetch = true): UseAnalyticsUsageResult {
  const [usage, setUsage] = useState<AnalyticsUsage | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<AnalyticsUsage | null> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async (): Promise<AnalyticsUsage | null> => {
    if (inflightRef.current) return inflightRef.current;
    setLoading(true);
    setError(null);
    const p = (async () => {
      try {
        const u = await fetchAnalyticsUsage();
        if (mountedRef.current) setUsage(u);
        return u;
      } catch (e: any) {
        if (mountedRef.current) setError(e?.message || 'Failed to load usage');
        return null;
      } finally {
        if (mountedRef.current) setLoading(false);
        inflightRef.current = null;
      }
    })();
    inflightRef.current = p;
    return p;
  }, []);

  useEffect(() => {
    if (autoFetch) { void refresh(); }
  }, [autoFetch, refresh]);

  return { usage, loading, error, refresh };
}
