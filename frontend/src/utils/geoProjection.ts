/**
 * Raven Scout — GPS ↔ saved-image pixel projection helpers.
 *
 * Single source of truth for converting between geographic coordinates
 * and the pixel coordinate space of a saved map image (the "original"
 * pixel grid the SavedMapImage record is anchored to).
 *
 * COORDINATE CONTRACT
 * ====================
 *   * "original" pixels   → the SavedMapImage's natural pixel grid
 *                          (originalWidth × originalHeight). This is
 *                          the same grid the LLM overlays are sized
 *                          against — keep marker math in this space
 *                          whenever possible.
 *   * "rendered" pixels   → the on-device rendered size of that image.
 *                          Use scaleOriginalPixelToRenderedPixel /
 *                          scaleRenderedPixelToOriginalPixel to cross
 *                          this boundary; pair with imageFit.ts when
 *                          the image is letterboxed inside a container.
 *   * latitude / longitude→ WGS-84 decimal degrees. Range checks
 *                          mirror backend/geo_validation.py:
 *                            • latitude  ∈ [-90, 90]
 *                            • longitude ∈ [-180, 180]
 *
 * ASSUMPTIONS
 * ===========
 *   * The saved image is north-up and not rotated.
 *   * No pitch / perspective distortion in the saved image.
 *   * No post-save crop changed the bounding box.
 *   * Antimeridian-crossing rectangles (eastLng < westLng) are NOT
 *     supported by the linear projection used here. Callers passing
 *     such a box will get an error — those rectangles need a wrap-
 *     aware projection that's out of scope for this util.
 *
 * ERROR MODEL
 * ===========
 *   * Throws GeoProjectionError on bad input (null bounds, zero
 *     dimensions, inverted box, out-of-range coordinates, etc.).
 *   * `clamp: true` ONLY clamps the OUTPUT pixel/coord into the valid
 *     range of the saved image. It never silences an out-of-range
 *     INPUT — invalid lat / lng / pixel inputs still throw.
 */

export interface GeoBounds {
  northLat: number;
  southLat: number;
  westLng: number;
  eastLng: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

export interface RenderedPixelPoint {
  renderedX: number;
  renderedY: number;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Raised on any invalid input to a projection helper. */
export class GeoProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeoProjectionError';
  }
}

// --------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------

function _isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function _assertFiniteNumber(value: unknown, field: string): number {
  if (typeof value === 'boolean' || !_isFiniteNumber(value)) {
    throw new GeoProjectionError(`${field} must be a finite number`);
  }
  return value as number;
}

function _assertLatitude(value: unknown, field = 'latitude'): number {
  const v = _assertFiniteNumber(value, field);
  if (v < -90 || v > 90) {
    throw new GeoProjectionError(`${field} must be between -90 and 90 (got ${v})`);
  }
  return v;
}

function _assertLongitude(value: unknown, field = 'longitude'): number {
  const v = _assertFiniteNumber(value, field);
  if (v < -180 || v > 180) {
    throw new GeoProjectionError(`${field} must be between -180 and 180 (got ${v})`);
  }
  return v;
}

function _assertDimensions(
  dims: ImageDimensions | null | undefined,
  field: string,
): { width: number; height: number } {
  if (!dims) {
    throw new GeoProjectionError(`${field} is required`);
  }
  const w = _assertFiniteNumber(dims.width, `${field}.width`);
  const h = _assertFiniteNumber(dims.height, `${field}.height`);
  if (w <= 0 || h <= 0) {
    throw new GeoProjectionError(
      `${field}.width and ${field}.height must be > 0 (got ${w}×${h})`,
    );
  }
  return { width: w, height: h };
}

function _assertBounds(bounds: GeoBounds | null | undefined): GeoBounds {
  if (!bounds) {
    throw new GeoProjectionError('bounds is required');
  }
  const northLat = _assertLatitude(bounds.northLat, 'bounds.northLat');
  const southLat = _assertLatitude(bounds.southLat, 'bounds.southLat');
  const westLng = _assertLongitude(bounds.westLng, 'bounds.westLng');
  const eastLng = _assertLongitude(bounds.eastLng, 'bounds.eastLng');

  if (northLat <= southLat) {
    throw new GeoProjectionError(
      `bounds.northLat (${northLat}) must be greater than southLat (${southLat})`,
    );
  }
  // Linear projection used here cannot wrap the antimeridian.
  // Reject `westLng > eastLng` outright (that includes the east==west
  // zero-width box, which is also degenerate).
  if (westLng >= eastLng) {
    throw new GeoProjectionError(
      `bounds.eastLng (${eastLng}) must be greater than westLng (${westLng}); ` +
        'antimeridian-crossing rectangles are not supported by this projection',
    );
  }
  return { northLat, southLat, westLng, eastLng };
}

function _clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

// --------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------

/**
 * Convert a (latitude, longitude) into pixel coordinates on the
 * SavedMapImage's original pixel grid.
 *
 * Linear / equirectangular projection — see ASSUMPTIONS at the top
 * of the file.
 *
 * @throws GeoProjectionError on null bounds, zero dimensions, out-of-
 * range input, or inverted bounds.
 */
export function latLngToPixel(params: {
  latitude: number;
  longitude: number;
  bounds: GeoBounds;
  originalDimensions: ImageDimensions;
  /**
   * When true, clamps the OUTPUT pixel into [0, width] / [0, height]
   * even if the input lat/lng falls outside the bounding box. Defaults
   * to false — callers that want "snap to edge" semantics should
   * opt in explicitly.
   */
  clamp?: boolean;
}): PixelPoint {
  const lat = _assertLatitude(params.latitude);
  const lng = _assertLongitude(params.longitude);
  const bounds = _assertBounds(params.bounds);
  const { width, height } = _assertDimensions(
    params.originalDimensions,
    'originalDimensions',
  );

  const lngSpan = bounds.eastLng - bounds.westLng;
  const latSpan = bounds.northLat - bounds.southLat;

  const x = ((lng - bounds.westLng) / lngSpan) * width;
  const y = ((bounds.northLat - lat) / latSpan) * height;

  if (params.clamp) {
    return { x: _clamp(x, 0, width), y: _clamp(y, 0, height) };
  }
  return { x, y };
}

/**
 * Convert pixel coordinates on the SavedMapImage's original pixel
 * grid back into (latitude, longitude).
 *
 * @throws GeoProjectionError on null bounds, zero dimensions, or
 * non-finite pixel input. Pixel values OUTSIDE [0,width] / [0,height]
 * are accepted and yield extrapolated lat/lng unless `clamp` is set.
 */
export function pixelToLatLng(params: {
  x: number;
  y: number;
  bounds: GeoBounds;
  originalDimensions: ImageDimensions;
  /**
   * When true, the output latitude / longitude is clamped to the
   * bounding box even if the input pixel falls outside the image.
   */
  clamp?: boolean;
}): LatLng {
  const x = _assertFiniteNumber(params.x, 'x');
  const y = _assertFiniteNumber(params.y, 'y');
  const bounds = _assertBounds(params.bounds);
  const { width, height } = _assertDimensions(
    params.originalDimensions,
    'originalDimensions',
  );

  const lngSpan = bounds.eastLng - bounds.westLng;
  const latSpan = bounds.northLat - bounds.southLat;

  const longitude = bounds.westLng + (x / width) * lngSpan;
  const latitude = bounds.northLat - (y / height) * latSpan;

  if (params.clamp) {
    return {
      latitude: _clamp(latitude, bounds.southLat, bounds.northLat),
      longitude: _clamp(longitude, bounds.westLng, bounds.eastLng),
    };
  }
  return { latitude, longitude };
}

/**
 * Scale a point in the saved image's ORIGINAL pixel grid to its
 * position in the currently RENDERED pixel grid.
 *
 * NOTE: this assumes the rendered image is a uniform scale of the
 * original (no letterbox padding). When the image is displayed with
 * `resizeMode="contain"` and the container's aspect ratio differs
 * from the image's, pair this with `computeFittedImageRect` from
 * `imageFit.ts` to add the letterbox offset.
 *
 * @throws GeoProjectionError on zero/negative dimensions or non-
 * finite inputs.
 */
export function scaleOriginalPixelToRenderedPixel(params: {
  x: number;
  y: number;
  originalDimensions: ImageDimensions;
  renderedDimensions: ImageDimensions;
}): RenderedPixelPoint {
  const x = _assertFiniteNumber(params.x, 'x');
  const y = _assertFiniteNumber(params.y, 'y');
  const orig = _assertDimensions(params.originalDimensions, 'originalDimensions');
  const rend = _assertDimensions(params.renderedDimensions, 'renderedDimensions');

  return {
    renderedX: (x / orig.width) * rend.width,
    renderedY: (y / orig.height) * rend.height,
  };
}

/**
 * Inverse of `scaleOriginalPixelToRenderedPixel`. Maps a rendered
 * pixel back to the original pixel grid.
 *
 * @throws GeoProjectionError on zero/negative dimensions or non-
 * finite inputs.
 */
export function scaleRenderedPixelToOriginalPixel(params: {
  renderedX: number;
  renderedY: number;
  originalDimensions: ImageDimensions;
  renderedDimensions: ImageDimensions;
}): PixelPoint {
  const rx = _assertFiniteNumber(params.renderedX, 'renderedX');
  const ry = _assertFiniteNumber(params.renderedY, 'renderedY');
  const orig = _assertDimensions(params.originalDimensions, 'originalDimensions');
  const rend = _assertDimensions(params.renderedDimensions, 'renderedDimensions');

  return {
    x: (rx / rend.width) * orig.width,
    y: (ry / rend.height) * orig.height,
  };
}
