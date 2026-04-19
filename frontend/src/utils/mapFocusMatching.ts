// Raven Scout — Pure overlay matching helpers.
//
// This module is intentionally free of React/RN imports so it can be
// unit-tested in Node using `tsx` + `node --test`.
//
// Matching priority (used by `matchOverlay`):
//   1. explicit overlay id reference
//   2. v2 `based_on` back-reference (observation id -> overlay)
//   3. exact / near-exact coordinate match  (<= DIST_EXACT % units)
//   4. preferred-type within tight radius   (<= DIST_TIGHT % units)
//   5. nearest overlay fallback             (<= DIST_NEAREST_MAX % units)
//
// If the best candidate's computed quality score falls below
// `minAcceptableQuality`, we return null instead of linking the wrong
// overlay — this keeps the pulsing ring anchored to the raw coordinates
// without falsely highlighting an unrelated marker.

// -- Tunable thresholds (coordinate space is 0..100 for both axes) --
export const DIST_EXACT = 2.5;
export const DIST_TIGHT = 8;
export const DIST_NEAREST_MAX = 18;
export const MIN_ACCEPTABLE_QUALITY = 0.3;

// Generic overlay shape — compatible with V2Overlay, V1Overlay, and the
// local `OverlayMarker` used by results.tsx. `based_on` and `confidence`
// are optional because v1 overlays omit them.
export interface OverlayCandidate {
  id: string;
  type: string;
  x_percent: number;
  y_percent: number;
  based_on?: string[];
  confidence?: number | string;
}

export type MatchKind =
  | 'explicit'
  | 'based_on'
  | 'coordinate'
  | 'type_preferred'
  | 'closest';

export interface MatchResult<T extends OverlayCandidate> {
  overlay: T;
  kind: MatchKind;
  /** Euclidean distance in percentage units */
  distance: number;
  /** 0..1 — higher is more confident */
  quality: number;
}

export interface MatchOptions {
  /** Direct id reference. Beats everything else if found. */
  explicitOverlayId?: string | null;
  /** Source id (e.g. observation id) — overlay.based_on may reference it */
  basedOnSourceId?: string | null;
  /** Preferred overlay.type for coordinate tiebreaks */
  preferType?: string;
  /** Quality floor for coord-based matches. Below this => null */
  minAcceptableQuality?: number;
}

// ---------- low-level helpers ----------

export function distancePct(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

export function isCoordValid(x?: number, y?: number): boolean {
  return typeof x === 'number' && typeof y === 'number' &&
    x >= 5 && x <= 95 && y >= 5 && y <= 95;
}

// quality: 1 when distance=0, 0 when distance>=maxDistance
function qualityFromDistance(d: number, maxDistance: number): number {
  if (d <= 0) return 1;
  if (d >= maxDistance) return 0;
  return 1 - d / maxDistance;
}

// ---------- priority-chain building blocks ----------

/** Priority 1 — explicit overlay id lookup. */
export function findExplicitOverlayMatch<T extends OverlayCandidate>(
  id: string | undefined | null,
  overlays: T[],
): T | null {
  if (!id) return null;
  return overlays.find(o => o.id === id) || null;
}

/** Priority 2 — v2 `based_on` back-reference. */
export function findOverlayByBasedOn<T extends OverlayCandidate>(
  sourceId: string | undefined | null,
  overlays: T[],
): T | null {
  if (!sourceId) return null;
  for (const o of overlays) {
    if (o.based_on && o.based_on.includes(sourceId)) return o;
  }
  return null;
}

/** Priority 3 — strict coordinate match. */
export function findCoordinateMatch<T extends OverlayCandidate>(
  x: number,
  y: number,
  overlays: T[],
  threshold: number = DIST_EXACT,
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const o of overlays) {
    const d = distancePct(x, y, o.x_percent, o.y_percent);
    if (d <= threshold && d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  return best;
}

/** Priority 4 — preferred-type match within a tighter radius. */
export function findPreferredOverlayByType<T extends OverlayCandidate>(
  x: number,
  y: number,
  overlays: T[],
  preferType: string,
  maxDistance: number = DIST_TIGHT,
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const o of overlays) {
    if (o.type !== preferType) continue;
    const d = distancePct(x, y, o.x_percent, o.y_percent);
    if (d <= maxDistance && d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  return best;
}

/** Priority 5 — nearest overlay fallback. */
export function findClosestLocalOverlay<T extends OverlayCandidate>(
  x: number,
  y: number,
  overlays: T[],
  maxDistance: number = DIST_NEAREST_MAX,
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const o of overlays) {
    const d = distancePct(x, y, o.x_percent, o.y_percent);
    if (d > maxDistance) continue;
    if (d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  return best;
}

// ---------- main orchestrator ----------

/**
 * Match a target (x,y) against a pool of overlays using the priority chain.
 * Returns `null` when no acceptable match exists — callers should treat that
 * as "focus by coordinate only, do not false-link an overlay".
 */
export function matchOverlay<T extends OverlayCandidate>(
  x: number,
  y: number,
  overlays: T[],
  options: MatchOptions = {},
): MatchResult<T> | null {
  if (overlays.length === 0) return null;
  const minQ = options.minAcceptableQuality ?? MIN_ACCEPTABLE_QUALITY;

  // 1. Explicit id — always wins when resolvable.
  const explicit = findExplicitOverlayMatch(options.explicitOverlayId, overlays);
  if (explicit) {
    const d = distancePct(x, y, explicit.x_percent, explicit.y_percent);
    return { overlay: explicit, kind: 'explicit', distance: d, quality: 1 };
  }

  // 2. based_on back-reference — deterministic v2 linkage.
  const byRef = findOverlayByBasedOn(options.basedOnSourceId, overlays);
  if (byRef) {
    const d = distancePct(x, y, byRef.x_percent, byRef.y_percent);
    return { overlay: byRef, kind: 'based_on', distance: d, quality: 0.95 };
  }

  // Skip coord strategies when coords are out of range / missing.
  if (!isCoordValid(x, y)) return null;

  // 3. Near-exact coordinate match.
  const exact = findCoordinateMatch(x, y, overlays, DIST_EXACT);
  if (exact) {
    const d = distancePct(x, y, exact.x_percent, exact.y_percent);
    // Even at DIST_EXACT boundary we keep quality high (>=0.88).
    const q = 0.88 + qualityFromDistance(d, DIST_EXACT) * 0.12;
    return { overlay: exact, kind: 'coordinate', distance: d, quality: q };
  }

  // 4. Preferred-type match inside the tight radius.
  if (options.preferType) {
    const typed = findPreferredOverlayByType(
      x, y, overlays, options.preferType, DIST_TIGHT,
    );
    if (typed) {
      const d = distancePct(x, y, typed.x_percent, typed.y_percent);
      // Base quality from distance + small type-preference bonus (0.10).
      const q = Math.min(1, qualityFromDistance(d, DIST_TIGHT) * 0.9 + 0.1);
      if (q >= minQ) {
        return { overlay: typed, kind: 'type_preferred', distance: d, quality: q };
      }
    }
  }

  // 5. Last resort: closest overlay, subject to quality floor.
  const closest = findClosestLocalOverlay(x, y, overlays, DIST_NEAREST_MAX);
  if (closest) {
    const d = distancePct(x, y, closest.x_percent, closest.y_percent);
    const q = qualityFromDistance(d, DIST_NEAREST_MAX);
    if (q >= minQ) {
      return { overlay: closest, kind: 'closest', distance: d, quality: q };
    }
  }

  // Weak or missing — do NOT false-link.
  return null;
}
