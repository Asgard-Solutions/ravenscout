/**
 * Raven Scout — Image fit math.
 *
 * ONE canonical mapping between an image's natural coordinate space
 * and the on-screen rect it occupies inside a fixed-size container.
 * The overlay pipeline uses this to keep LLM-returned
 * `x_percent / y_percent` (normalized to the image's natural
 * dimensions) aligned to the image as actually rendered on device.
 *
 * Coordinate contract (end-to-end):
 *   • Backend / LLM  →  overlays carry x_percent, y_percent in
 *                       [0, 100] relative to the ANALYZED image's
 *                       natural pixel grid.
 *   • Client         →  the image is displayed with
 *                       `resizeMode="contain"` inside a container.
 *                       The rendered image rect = the container rect
 *                       ONLY when aspect ratios match; otherwise the
 *                       image is letterboxed (padded on one axis).
 *   • Overlays       →  positioned at
 *                       `offsetX + (x_percent/100) * renderedWidth`
 *                       `offsetY + (y_percent/100) * renderedHeight`
 *
 * This single helper returns that rect so every call-site uses
 * identical math. If naturalWidth or naturalHeight are missing /
 * zero we fall back to the full container (behaviour before the
 * basis-lock fix) so legacy hunts still render.
 */

export interface FittedImageRect {
  /** X offset (letterbox pad) of the rendered image inside the container. */
  offsetX: number;
  /** Y offset (letterbox pad) of the rendered image inside the container. */
  offsetY: number;
  /** Width of the rendered image in on-screen pixels. */
  width: number;
  /** Height of the rendered image in on-screen pixels. */
  height: number;
  /** True when natural dimensions were unknown and we degraded to container. */
  degraded: boolean;
}

export function computeFittedImageRect(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number,
): FittedImageRect {
  // Defensive — zero / negative / NaN containers can't render anything.
  const safeCW = Number.isFinite(containerW) && containerW > 0 ? containerW : 0;
  const safeCH = Number.isFinite(containerH) && containerH > 0 ? containerH : 0;

  // Missing natural dimensions → fall back to container (legacy safe).
  if (
    !Number.isFinite(naturalW) ||
    !Number.isFinite(naturalH) ||
    naturalW <= 0 ||
    naturalH <= 0
  ) {
    return {
      offsetX: 0,
      offsetY: 0,
      width: safeCW,
      height: safeCH,
      degraded: true,
    };
  }

  const containerAspect = safeCW / Math.max(safeCH, 1e-6);
  const imageAspect = naturalW / Math.max(naturalH, 1e-6);

  if (imageAspect > containerAspect) {
    // Image is wider than container (per aspect) → width-fitted,
    // letterbox top+bottom.
    const width = safeCW;
    const height = safeCW / imageAspect;
    return {
      offsetX: 0,
      offsetY: (safeCH - height) / 2,
      width,
      height,
      degraded: false,
    };
  }
  // Image is taller (or equal) → height-fitted, letterbox left+right.
  const height = safeCH;
  const width = safeCH * imageAspect;
  return {
    offsetX: (safeCW - width) / 2,
    offsetY: 0,
    width,
    height,
    degraded: false,
  };
}

/**
 * Dev-only check: returns an array of overlay indices whose
 * `x_percent` / `y_percent` fall outside [0, 100]. Returns an empty
 * array when all overlays are in bounds. Callers should log the
 * result behind __DEV__ — silently dropping coords is forbidden by
 * the coordinate contract.
 */
export function findOutOfBoundsOverlayIndices(
  overlays: Array<{ x_percent?: number; y_percent?: number }>,
  tolerance = 0,
): number[] {
  const out: number[] = [];
  const lo = 0 - tolerance;
  const hi = 100 + tolerance;
  for (let i = 0; i < overlays.length; i++) {
    const o = overlays[i] || {};
    const x = typeof o.x_percent === 'number' ? o.x_percent : NaN;
    const y = typeof o.y_percent === 'number' ? o.y_percent : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < lo || x > hi || y < lo || y > hi) {
      out.push(i);
    }
  }
  return out;
}
