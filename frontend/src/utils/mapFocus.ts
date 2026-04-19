// Raven Scout — Map Focus & Overlay Linking (React hook + linking logic).
//
// Pure matching helpers live in `mapFocusMatching.ts` so they stay unit-
// testable in Node. This module wires them into React state and produces
// `LinkedSetup` / `LinkedObservation` view-model entries consumed by
// `AnalysisSections.tsx`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { V2Overlay, TopSetup, MapObservation } from '../types/analysis';
import {
  matchOverlay,
  isCoordValid,
  findClosestLocalOverlay as _findClosestLocalOverlay,
  type OverlayCandidate,
  type MatchResult,
} from './mapFocusMatching';

// Re-export matching helpers so existing callers keep working.
export {
  matchOverlay,
  findExplicitOverlayMatch,
  findOverlayByBasedOn,
  findCoordinateMatch,
  findPreferredOverlayByType,
  findClosestLocalOverlay,
  isCoordValid as isCoordinateValid,
  DIST_EXACT,
  DIST_TIGHT,
  DIST_NEAREST_MAX,
  MIN_ACCEPTABLE_QUALITY,
} from './mapFocusMatching';
export type { OverlayCandidate, MatchResult, MatchKind, MatchOptions } from './mapFocusMatching';

// ------------------------------ Types ------------------------------

export interface FocusTarget {
  x_percent: number;
  y_percent: number;
  overlayId?: string;
  source: 'setup' | 'observation' | 'overlay';
  sourceId: string;
  /** Optional diagnostic — which priority tier produced the overlayId */
  matchKind?: string;
}

export interface LinkedSetup extends TopSetup {
  linkedOverlayId: string | null;
  canFocusMap: boolean;
  focusTarget: FocusTarget | null;
  /** Diagnostic: how the overlay was matched (explicit/coordinate/etc.) */
  matchKind: string | null;
  /** 0..1 confidence of the link; null when no overlay matched */
  matchQuality: number | null;
}

export interface LinkedObservation extends MapObservation {
  linkedOverlayId: string | null;
  canFocusMap: boolean;
  focusTarget: FocusTarget | null;
  matchKind: string | null;
  matchQuality: number | null;
}

// ------------------------------ Linking ------------------------------

export function linkSetupsToOverlays(
  setups: TopSetup[],
  overlays: V2Overlay[],
): LinkedSetup[] {
  return setups.map(setup => {
    const hasCoords = isCoordValid(setup.x_percent, setup.y_percent);
    let result: MatchResult<V2Overlay> | null = null;
    let focusTarget: FocusTarget | null = null;

    if (hasCoords) {
      // Priority: stand-type overlays preferred for top setups.
      result = matchOverlay(setup.x_percent, setup.y_percent, overlays, {
        preferType: 'stand',
      });
      focusTarget = {
        x_percent: setup.x_percent,
        y_percent: setup.y_percent,
        overlayId: result?.overlay.id,
        source: 'setup',
        sourceId: `setup-${setup.rank}`,
        matchKind: result?.kind,
      };
    }

    return {
      ...setup,
      linkedOverlayId: result?.overlay.id ?? null,
      canFocusMap: hasCoords,
      focusTarget,
      matchKind: result?.kind ?? null,
      matchQuality: result?.quality ?? null,
    };
  });
}

export function linkObservationsToOverlays(
  observations: MapObservation[],
  overlays: V2Overlay[],
): LinkedObservation[] {
  return observations.map(obs => {
    const hasCoords = isCoordValid(obs.x_percent, obs.y_percent);
    let result: MatchResult<V2Overlay> | null = null;
    let focusTarget: FocusTarget | null = null;

    if (hasCoords) {
      // Observations rely on the `based_on` back-reference primarily; no
      // type preference because observations don't map to a fixed overlay
      // type.
      result = matchOverlay(obs.x_percent, obs.y_percent, overlays, {
        basedOnSourceId: obs.id,
      });
      focusTarget = {
        x_percent: obs.x_percent,
        y_percent: obs.y_percent,
        overlayId: result?.overlay.id,
        source: 'observation',
        sourceId: obs.id,
        matchKind: result?.kind,
      };
    }

    return {
      ...obs,
      linkedOverlayId: result?.overlay.id ?? null,
      canFocusMap: hasCoords,
      focusTarget,
      matchKind: result?.kind ?? null,
      matchQuality: result?.quality ?? null,
    };
  });
}

export function buildFocusTarget(
  x: number,
  y: number,
  source: FocusTarget['source'],
  sourceId: string,
  overlayId?: string,
): FocusTarget | null {
  if (!isCoordValid(x, y)) return null;
  return { x_percent: x, y_percent: y, overlayId, source, sourceId };
}

// ------------------------------ Runtime helper ------------------------------

/**
 * Highlight the local OverlayMarker (from hunt.result.overlays) that best
 * corresponds to a fired focus target. Uses the priority chain; returns
 * null when the best candidate is too weak (avoids false highlights).
 */
export function resolveLocalOverlayForFocus<T extends OverlayCandidate>(
  target: FocusTarget,
  overlays: T[],
): T | null {
  if (overlays.length === 0) return null;
  const res = matchOverlay(target.x_percent, target.y_percent, overlays, {
    explicitOverlayId: target.overlayId,
  });
  return res ? res.overlay : null;
}

// ------------------------------ Hook ------------------------------

export interface MapFocusState {
  sourceId: string | null;
  target: FocusTarget | null;
  /** Bumps each time a new focus is triggered */
  tick: number;
}

const EMPTY_FOCUS: MapFocusState = { sourceId: null, target: null, tick: 0 };

export function useMapFocus(
  setups: TopSetup[],
  observations: MapObservation[],
  overlays: V2Overlay[],
  autoClearMs: number = 3500,
) {
  const [focusState, setFocusState] = useState<MapFocusState>(EMPTY_FOCUS);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const linkedSetups = useMemo(
    () => linkSetupsToOverlays(setups, overlays),
    [setups, overlays],
  );
  const linkedObservations = useMemo(
    () => linkObservationsToOverlays(observations, overlays),
    [observations, overlays],
  );

  const clearFocus = useCallback(() => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    setFocusState(EMPTY_FOCUS);
  }, []);

  const focus = useCallback((target: FocusTarget) => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    // Replacing the previous active selection cleanly — no merging,
    // no stale sourceId.
    setFocusState({
      sourceId: target.sourceId,
      target,
      tick: Date.now(),
    });
    if (autoClearMs > 0) {
      clearTimer.current = setTimeout(() => {
        setFocusState(EMPTY_FOCUS);
        clearTimer.current = null;
      }, autoClearMs);
    }
  }, [autoClearMs]);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  return {
    focusState,
    linkedSetups,
    linkedObservations,
    focus,
    clearFocus,
  };
}
