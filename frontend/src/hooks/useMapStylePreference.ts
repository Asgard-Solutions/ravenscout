/**
 * Persist the user's selected base map style across app launches.
 *
 * - Reads the stored preference on first mount; falls back to
 *   DEFAULT_MAP_STYLE_ID when nothing is persisted yet OR when the
 *   stored id is no longer in the registry (graceful migration).
 * - Writes any subsequent change to AsyncStorage transparently so
 *   callers can use `[styleId, setStyleId]` like a normal useState.
 * - All persistence is best-effort — storage errors never block
 *   the in-memory switch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_MAP_STYLE_ID,
  MAP_STYLE_STORAGE_KEY,
  isRavenScoutMapStyleId,
  type RavenScoutMapStyleId,
} from '../constants/mapStyles';

export interface UseMapStylePreferenceResult {
  styleId: RavenScoutMapStyleId;
  setStyleId: (next: RavenScoutMapStyleId) => void;
  /** True until the persisted preference has been read from storage. */
  hydrating: boolean;
}

export function useMapStylePreference(
  initial: RavenScoutMapStyleId = DEFAULT_MAP_STYLE_ID,
): UseMapStylePreferenceResult {
  const [styleId, setStyleIdState] = useState<RavenScoutMapStyleId>(initial);
  const [hydrating, setHydrating] = useState(true);
  const hydratedRef = useRef(false);

  // Load once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(MAP_STYLE_STORAGE_KEY);
        if (cancelled) return;
        if (raw && isRavenScoutMapStyleId(raw)) {
          setStyleIdState(raw);
        }
      } catch {
        /* ignore — fall back to the in-memory default */
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setHydrating(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setStyleId = useCallback((next: RavenScoutMapStyleId) => {
    setStyleIdState(next);
    // Best-effort write — in-memory state is the source of truth in
    // this session, persistence is a nice-to-have for the next launch.
    AsyncStorage.setItem(MAP_STYLE_STORAGE_KEY, next).catch(() => { /* noop */ });
  }, []);

  return { styleId, setStyleId, hydrating };
}
