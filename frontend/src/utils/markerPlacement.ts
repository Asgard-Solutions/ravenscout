// Raven Scout — saved-image marker placement helpers (Task 10).
//
// Pure functions that take a tap position in RENDERED pixel space
// and return the persistence payload for an
// AnalysisOverlayItem create call:
//
//   * For a geo-capable saved image (bounds + dims supplied), emit:
//       x, y                         (in original pixel grid)
//       latitude, longitude          (derived via pixelToLatLng)
//       coordinateSource = 'derived_from_saved_map_bounds'
//
//   * For a pixel-only image (no bounds OR not geo-capable), emit:
//       x, y                         (in original pixel grid)
//       latitude = null, longitude = null
//       coordinateSource = 'pixel_only'
//
// Validation:
//   * tap must land inside the rendered rect (0..renderedW, 0..renderedH)
//   * derived (x,y) must land inside the original rect
//   * geo branch additionally validates derived lat/lng range
//
// These helpers are deliberately UI-free so they can run under
// node:test without dragging react-native into the require graph.

import {
  GeoProjectionError,
  pixelToLatLng,
  scaleRenderedPixelToOriginalPixel,
  type GeoBounds,
} from './geoProjection';

export interface SavedImageGeo {
  /**
   * GPS bounds for the saved image. When omitted (or missing any
   * field), the helper treats the image as pixel-only.
   */
  bounds?: GeoBounds | null;
  /** Whether the image was flagged as geo-placeable on save. */
  supportsGeoPlacement?: boolean | null;
}

export interface MarkerPlacementInput {
  /** Tap position in RENDERED pixel space (x within [0, renderedWidth]). */
  renderedX: number;
  renderedY: number;
  /** Currently displayed image size. */
  renderedWidth: number;
  renderedHeight: number;
  /** Original image dims (the saved map image's natural size). */
  originalWidth: number;
  originalHeight: number;
  /**
   * Optional geo metadata. Pass `null` (or omit `bounds`) for pixel-
   * only images.
   */
  geo?: SavedImageGeo | null;
}

export interface PlacementResultBase {
  /** Original-image x coordinate (always populated on success). */
  x: number;
  y: number;
}

export interface GeoPlacementResult extends PlacementResultBase {
  coordinateSource: 'derived_from_saved_map_bounds';
  latitude: number;
  longitude: number;
}

export interface PixelOnlyPlacementResult extends PlacementResultBase {
  coordinateSource: 'pixel_only';
  latitude: null;
  longitude: null;
}

export type PlacementResult = GeoPlacementResult | PixelOnlyPlacementResult;

export type PlacementError =
  | 'tap_out_of_bounds'
  | 'invalid_dimensions'
  | 'projection_failed';

export type PlacementOutcome =
  | { ok: true; data: PlacementResult }
  | { ok: false; reason: PlacementError; detail?: string };

function isPositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function geoBoundsAreUsable(g?: SavedImageGeo | null): g is { bounds: GeoBounds; supportsGeoPlacement?: boolean | null } {
  if (!g || g.supportsGeoPlacement === false) return false;
  const b = g.bounds;
  if (!b) return false;
  return (
    typeof b.northLat === 'number' &&
    typeof b.southLat === 'number' &&
    typeof b.westLng === 'number' &&
    typeof b.eastLng === 'number' &&
    Number.isFinite(b.northLat) &&
    Number.isFinite(b.southLat) &&
    Number.isFinite(b.westLng) &&
    Number.isFinite(b.eastLng) &&
    b.northLat > b.southLat &&
    b.eastLng > b.westLng
  );
}

/**
 * Build a placement payload from a tap on the rendered image.
 *
 * Returns `{ ok: true, data }` with the AnalysisOverlayItem-ready
 * coordinate fields. Returns `{ ok: false, reason }` on validation
 * failure (tap outside the image, bad dims, projection failure).
 */
export function buildMarkerPlacement(
  input: MarkerPlacementInput,
): PlacementOutcome {
  const {
    renderedX,
    renderedY,
    renderedWidth,
    renderedHeight,
    originalWidth,
    originalHeight,
    geo,
  } = input;

  if (
    !isPositive(renderedWidth) ||
    !isPositive(renderedHeight) ||
    !isPositive(originalWidth) ||
    !isPositive(originalHeight)
  ) {
    return { ok: false, reason: 'invalid_dimensions' };
  }
  if (
    typeof renderedX !== 'number' ||
    typeof renderedY !== 'number' ||
    !Number.isFinite(renderedX) ||
    !Number.isFinite(renderedY) ||
    renderedX < 0 ||
    renderedX > renderedWidth ||
    renderedY < 0 ||
    renderedY > renderedHeight
  ) {
    return { ok: false, reason: 'tap_out_of_bounds' };
  }

  // Convert the tap to original-image pixel space.
  let origX: number;
  let origY: number;
  try {
    const o = scaleRenderedPixelToOriginalPixel({
      renderedX,
      renderedY,
      renderedDimensions: { width: renderedWidth, height: renderedHeight },
      originalDimensions: { width: originalWidth, height: originalHeight },
    });
    origX = o.x;
    origY = o.y;
  } catch (err) {
    if (err instanceof GeoProjectionError) {
      return { ok: false, reason: 'projection_failed', detail: err.message };
    }
    return { ok: false, reason: 'projection_failed' };
  }

  // Clamp / sanity check on the original pixel rect — guards against
  // 1px rounding drift past the edge.
  if (
    origX < 0 ||
    origX > originalWidth ||
    origY < 0 ||
    origY > originalHeight
  ) {
    return { ok: false, reason: 'tap_out_of_bounds' };
  }

  if (!geoBoundsAreUsable(geo)) {
    return {
      ok: true,
      data: {
        x: origX,
        y: origY,
        latitude: null,
        longitude: null,
        coordinateSource: 'pixel_only',
      },
    };
  }

  // Geo-capable branch: derive lat/lng from the original pixel.
  try {
    const { latitude, longitude } = pixelToLatLng({
      x: origX,
      y: origY,
      bounds: geo.bounds!,
      originalDimensions: { width: originalWidth, height: originalHeight },
    });
    return {
      ok: true,
      data: {
        x: origX,
        y: origY,
        latitude,
        longitude,
        coordinateSource: 'derived_from_saved_map_bounds',
      },
    };
  } catch (err) {
    if (err instanceof GeoProjectionError) {
      return { ok: false, reason: 'projection_failed', detail: err.message };
    }
    return { ok: false, reason: 'projection_failed' };
  }
}
