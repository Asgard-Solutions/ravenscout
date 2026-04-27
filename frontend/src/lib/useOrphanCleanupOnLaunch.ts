/**
 * Auto fire-and-forget orphan S3 cleanup on app launch.
 *
 * Runs once per signed-in Pro session. Silent — never throws, never
 * shows UI. Throttled to one execution per cold start using a module
 * scoped flag plus an AsyncStorage-backed daily floor so a user who
 * relaunches the app several times in a single day doesn't hammer
 * the cleanup endpoint. The endpoint itself is already idempotent
 * and Pro-gated, so the throttle is purely a politeness measure.
 */

import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cleanupOrphanMediaSafe } from '../api/mediaCleanupApi';
import { useAuth } from '../hooks/useAuth';

const LAST_RUN_KEY = '@ravenscout/orphan_cleanup_last_run';
/** Only run again if the last run is older than this many ms. */
const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

let firedThisProcess = false;

export function useOrphanCleanupOnLaunch(): void {
  const { user, loading } = useAuth();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (hasRunRef.current || firedThisProcess) return;
    if (!user?.user_id) return;

    // Pro-tier only. The backend would 403 anyway, but skipping the
    // request entirely avoids a noisy log line for free / core users.
    const tier = String(user.subscription_tier || user.plan || '').toLowerCase();
    if (tier !== 'pro') return;

    hasRunRef.current = true;
    firedThisProcess = true;

    (async () => {
      try {
        const lastRunRaw = await AsyncStorage.getItem(LAST_RUN_KEY);
        const lastRun = lastRunRaw ? Number(lastRunRaw) : 0;
        if (Number.isFinite(lastRun) && Date.now() - lastRun < MIN_INTERVAL_MS) {
          return;
        }
        const result = await cleanupOrphanMediaSafe();
        // Always stamp — even on null (failure) we don't want to retry
        // every minute on a transient outage.
        await AsyncStorage.setItem(LAST_RUN_KEY, String(Date.now()));
        if (result && (result.deleted > 0 || (result.failed && result.failed.length > 0))) {
          // Light dev signal only; never alert the user.
          if (__DEV__) {
            console.log(
              '[orphan-cleanup] background sweep:',
              `scanned=${result.scanned} deleted=${result.deleted} failed=${result.failed?.length || 0}`,
            );
          }
        }
      } catch {
        // hook is fire-and-forget — silently swallow
      }
    })();
  }, [user?.user_id, user?.subscription_tier, user?.plan, loading]);
}

/**
 * Tiny invisible component so the layout file can mount the hook
 * without restructuring its render tree.
 */
export function OrphanCleanupOnLaunch(): null {
  useOrphanCleanupOnLaunch();
  return null;
}
