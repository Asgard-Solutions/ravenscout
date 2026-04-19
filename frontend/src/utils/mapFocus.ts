// Raven Scout — Map Focus & Overlay Linking Utilities

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { V2Overlay, TopSetup, MapObservation } from '../types/analysis';

export interface FocusTarget {
  x_percent: number;
  y_percent: number;
  overlayId?: string;
  source: 'setup' | 'observation' | 'overlay';
  sourceId: string;
}

export interface LinkedSetup extends TopSetup {
  linkedOverlayId: string | null;
  canFocusMap: boolean;
  focusTarget: FocusTarget | null;
}

export interface LinkedObservation extends MapObservation {
  linkedOverlayId: string | null;
  canFocusMap: boolean;
  focusTarget: FocusTarget | null;
}

// --- Coordinate Helpers ---

export function isCoordinateValid(x?: number, y?: number): boolean {
  return typeof x === 'number' && typeof y === 'number' &&
    x >= 5 && x <= 95 && y >= 5 && y <= 95;
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// --- Overlay Matching ---

/** Find the closest overlay to given coordinates, optionally preferring a type */
export function findClosestOverlay(
  x: number, y: number,
  overlays: V2Overlay[],
  preferType?: string,
  maxDistance: number = 25,
): V2Overlay | null {
  if (overlays.length === 0) return null;

  let best: V2Overlay | null = null;
  let bestDist = Infinity;

  for (const ov of overlays) {
    const d = distance(x, y, ov.x_percent, ov.y_percent);
    if (d > maxDistance) continue;
    // Prefer matching type (e.g., stands for setups)
    const typeBonus = preferType && ov.type === preferType ? -5 : 0;
    const adjusted = d + typeBonus;
    if (adjusted < bestDist) {
      bestDist = adjusted;
      best = ov;
    }
  }
  return best;
}

/** Find overlay by explicit ID reference (based_on field) */
function findOverlayById(id: string, overlays: V2Overlay[]): V2Overlay | null {
  return overlays.find(o => o.id === id) || null;
}

// --- Setup Linking ---

export function linkSetupsToOverlays(
  setups: TopSetup[],
  overlays: V2Overlay[],
): LinkedSetup[] {
  return setups.map(setup => {
    let linkedOverlayId: string | null = null;
    let focusTarget: FocusTarget | null = null;

    const hasCoords = isCoordinateValid(setup.x_percent, setup.y_percent);

    if (hasCoords) {
      // Find closest stand-type overlay first, then any overlay
      const match = findClosestOverlay(setup.x_percent, setup.y_percent, overlays, 'stand')
        || findClosestOverlay(setup.x_percent, setup.y_percent, overlays);
      if (match) {
        linkedOverlayId = match.id;
      }
      focusTarget = {
        x_percent: setup.x_percent,
        y_percent: setup.y_percent,
        overlayId: linkedOverlayId || undefined,
        source: 'setup',
        sourceId: `setup-${setup.rank}`,
      };
    }

    return {
      ...setup,
      linkedOverlayId,
      canFocusMap: hasCoords,
      focusTarget,
    };
  });
}

// --- Observation Linking ---

export function linkObservationsToOverlays(
  observations: MapObservation[],
  overlays: V2Overlay[],
): LinkedObservation[] {
  return observations.map(obs => {
    let linkedOverlayId: string | null = null;
    let focusTarget: FocusTarget | null = null;

    const hasCoords = isCoordinateValid(obs.x_percent, obs.y_percent);

    if (hasCoords) {
      // Check based_on references from overlays
      for (const ov of overlays) {
        if (ov.based_on?.includes(obs.id)) {
          linkedOverlayId = ov.id;
          break;
        }
      }
      // Fallback to proximity
      if (!linkedOverlayId) {
        const match = findClosestOverlay(obs.x_percent, obs.y_percent, overlays, undefined, 15);
        if (match) linkedOverlayId = match.id;
      }
      focusTarget = {
        x_percent: obs.x_percent,
        y_percent: obs.y_percent,
        overlayId: linkedOverlayId || undefined,
        source: 'observation',
        sourceId: obs.id,
      };
    }

    return {
      ...obs,
      linkedOverlayId,
      canFocusMap: hasCoords,
      focusTarget,
    };
  });
}

export function buildFocusTarget(
  x: number, y: number, source: FocusTarget['source'], sourceId: string, overlayId?: string
): FocusTarget | null {
  if (!isCoordinateValid(x, y)) return null;
  return { x_percent: x, y_percent: y, overlayId, source, sourceId };
}

// --- React Hook: unified focus state ---

export interface MapFocusState {
  sourceId: string | null;
  target: FocusTarget | null;
  /** Bumps each time a new focus is triggered, so effects can re-run even for same target */
  tick: number;
}

const EMPTY_FOCUS: MapFocusState = { sourceId: null, target: null, tick: 0 };

/**
 * Unified hook that:
 *  - Builds linked setups/observations once (memoized)
 *  - Tracks which source is currently focused
 *  - Auto-clears focus after `autoClearMs` milliseconds (default 3500ms)
 */
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

  // Cleanup on unmount
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

/** Find closest local overlay (by x_percent/y_percent) — used to highlight DraggableMarker */
export function findClosestLocalOverlay<T extends { id: string; x_percent: number; y_percent: number; type?: string }>(
  x: number,
  y: number,
  overlays: T[],
  maxDistance: number = 20,
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const ov of overlays) {
    const d = Math.sqrt((ov.x_percent - x) ** 2 + (ov.y_percent - y) ** 2);
    if (d > maxDistance) continue;
    if (d < bestDist) {
      bestDist = d;
      best = ov;
    }
  }
  return best;
}
