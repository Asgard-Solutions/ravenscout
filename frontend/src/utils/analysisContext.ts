// Raven Scout — Analysis context resolver (pure logic).
//
// Single source of truth for "which image + GPS should the overlay
// actually render against?" Used by the results screen and map
// focus code.
//
// Precedence (from most authoritative to least):
//   1. hydrated.analysisContext  (the frozen lock)
//   2. hydrated.primaryMedia     (last picked primary at save time)
//   3. hunt-level metadata.locationCoords (default GPS) as last resort
//      for GPS only — NEVER override a present analysisContext.gps.
//
// Returns a normalized snapshot that the UI can consume directly.

import type {
  AnalysisContext,
  HydratedHuntResult,
  HydratedMedia,
} from '../media/types';

export interface ResolvedAnalysisBasis {
  /** The imageId the overlay is bound to (null if no image). */
  imageId: string | null;
  /** Display URI for the bound image (null if not resolvable). */
  imageUri: string | null;
  /** GPS used at analysis time. */
  gps: { lat: number; lon: number } | null;
  /** Natural image dimensions when available (0 when unknown). */
  naturalWidth: number;
  naturalHeight: number;
  /** Overlay calibration snapshot if captured. */
  overlayCalibration: AnalysisContext['overlayCalibration'];
  /** 'valid' unless the basis has been invalidated. */
  overlayStatus: 'valid' | 'stale';
  /** How the basis was resolved — lets UI explain precedence to devs. */
  source:
    | 'analysis-context'              // (1) saved lock
    | 'analysis-context-missing-media' // context present but image gone → stale
    | 'primary-media-fallback'         // (2) no context, using primary
    | 'none';                          // (3) nothing usable
}

const EMPTY: ResolvedAnalysisBasis = {
  imageId: null,
  imageUri: null,
  gps: null,
  naturalWidth: 0,
  naturalHeight: 0,
  overlayCalibration: null,
  overlayStatus: 'valid',
  source: 'none',
};

export function resolveAnalysisBasis(
  hunt: HydratedHuntResult | null | undefined,
): ResolvedAnalysisBasis {
  if (!hunt) return EMPTY;
  const media = hunt.media || [];
  const ctx = hunt.analysisContext;

  // 1) Saved analysis context wins — if its imageId still resolves.
  if (ctx && ctx.imageId) {
    const bound = media.find(
      (m: HydratedMedia) => m.asset.imageId === ctx.imageId,
    );
    if (bound) {
      return {
        imageId: ctx.imageId,
        imageUri: bound.displayUri || null,
        // Key rule: analysis GPS overrides hunt-level GPS. NEVER fall
        // back to metadata.locationCoords when analysisContext.gps is
        // explicitly set (even to null — null means "user analyzed
        // without a GPS fix").
        gps: ctx.gps,
        naturalWidth: ctx.imageNaturalWidth || 0,
        naturalHeight: ctx.imageNaturalHeight || 0,
        overlayCalibration: ctx.overlayCalibration ?? null,
        overlayStatus: ctx.overlayStatus || 'valid',
        source: 'analysis-context',
      };
    }
    // Context exists but the image it points at is missing → STALE.
    // Keep GPS from context so the map still knows where; clear the
    // imageUri so we don't render overlays on a wrong image.
    return {
      imageId: ctx.imageId,
      imageUri: null,
      gps: ctx.gps,
      naturalWidth: ctx.imageNaturalWidth || 0,
      naturalHeight: ctx.imageNaturalHeight || 0,
      overlayCalibration: ctx.overlayCalibration ?? null,
      overlayStatus: 'stale',
      source: 'analysis-context-missing-media',
    };
  }

  // 2) No context (legacy record) — fall back to primaryMedia.
  if (hunt.primaryMedia) {
    return {
      imageId: hunt.primaryMedia.asset.imageId,
      imageUri: hunt.primaryDisplayUri || hunt.primaryMedia.displayUri || null,
      gps: hunt.metadata?.locationCoords ?? null,
      naturalWidth: hunt.primaryMedia.asset.width || 0,
      naturalHeight: hunt.primaryMedia.asset.height || 0,
      overlayCalibration: null,
      overlayStatus: 'valid',
      source: 'primary-media-fallback',
    };
  }

  // 3) Nothing usable.
  return EMPTY;
}

/**
 * Determine whether an AnalysisContext is stale given a current set
 * of media assets. Used by both the hydrator (sets
 * `overlayStatus='stale'` on load) and the UI (to render a warning
 * without waiting for a hydrate roundtrip).
 */
export function isAnalysisContextStale(
  ctx: AnalysisContext | null | undefined,
  media: Array<{ asset: { imageId: string } }> | null | undefined,
): boolean {
  if (!ctx) return false;
  if (ctx.overlayStatus === 'stale') return true;
  if (!media || media.length === 0) return true;
  return !media.some(m => m.asset.imageId === ctx.imageId);
}

/**
 * True when a proposed new basis would make the current AnalysisContext
 * stale. Used before saving edits that change the basis so callers
 * know to call `markOverlayStale()`.
 */
export function wouldInvalidateContext(
  ctx: AnalysisContext | null | undefined,
  nextBasis: {
    imageId?: string | null;
    gps?: { lat: number; lon: number } | null;
    overlayCalibration?: AnalysisContext['overlayCalibration'];
  },
): boolean {
  if (!ctx) return false;
  if (nextBasis.imageId && nextBasis.imageId !== ctx.imageId) return true;
  if (nextBasis.gps !== undefined) {
    const a = ctx.gps, b = nextBasis.gps;
    const aNull = !a;
    const bNull = !b;
    if (aNull !== bNull) return true;
    if (a && b && (a.lat !== b.lat || a.lon !== b.lon)) return true;
  }
  if (nextBasis.overlayCalibration !== undefined) {
    const prev = JSON.stringify(ctx.overlayCalibration ?? null);
    const next = JSON.stringify(nextBasis.overlayCalibration ?? null);
    if (prev !== next) return true;
  }
  return false;
}

/**
 * Build the initial AnalysisContext that gets baked into a newly
 * saved hunt. Called from `saveHunt` once media persistence has
 * completed so we know the canonical imageId.
 *
 * - If the caller didn't supply dims (e.g. Image.getSize failed), we
 *   persist zeros — the UI can fall back to measured on-screen dims.
 *   The context is still valuable because it locks the imageId + GPS.
 * - GPS precedence here matches runtime resolution: explicit
 *   analysisContext.gps wins, otherwise the hunt-level locationCoords
 *   snapshot acts as the analysis GPS at lock time.
 */
export function buildInitialAnalysisContext(input: {
  primaryMediaRef: string | null;
  ctxInput?: {
    imageNaturalWidth?: number;
    imageNaturalHeight?: number;
    gps?: { lat: number; lon: number } | null;
    overlayCalibration?: AnalysisContext['overlayCalibration'];
  };
  fallbackGps: { lat: number; lon: number } | null;
}): AnalysisContext | null {
  if (!input.primaryMediaRef) return null;
  const gps =
    input.ctxInput && 'gps' in input.ctxInput
      ? input.ctxInput.gps
      : input.fallbackGps;
  return {
    schema: 'analysis-context.v1',
    imageId: input.primaryMediaRef,
    gps: gps ?? null,
    imageNaturalWidth: input.ctxInput?.imageNaturalWidth || 0,
    imageNaturalHeight: input.ctxInput?.imageNaturalHeight || 0,
    overlayCalibration: input.ctxInput?.overlayCalibration ?? null,
    overlayStatus: 'valid',
    lockedAt: new Date().toISOString(),
  };
}
