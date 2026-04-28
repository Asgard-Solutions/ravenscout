// Raven Scout — pure helper for SavedAnalysisOverlayImage (Task 9).
//
// Lives in /utils so it can be imported by both the React Native
// component AND the node:test runner (which can't resolve
// `react-native` imports).

import {
  GeoProjectionError,
  scaleOriginalPixelToRenderedPixel,
} from './geoProjection';

/**
 * Returns the rendered (px) anchor for an overlay item, or `null`
 * when the item has no usable saved x/y or the dimensions are
 * invalid. Never reads from any "live map" state, never falls
 * back to GPS, never invents coordinates.
 *
 * Mirrors the saved-basis contract spelled out in Task 9:
 *   renderedX = (x / originalWidth)  * renderedWidth
 *   renderedY = (y / originalHeight) * renderedHeight
 */
export function computeOverlayRenderedAnchor(params: {
  item: { x?: number | null; y?: number | null };
  originalWidth: number;
  originalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
}): { renderedX: number; renderedY: number } | null {
  const { item, originalWidth, originalHeight, renderedWidth, renderedHeight } =
    params;
  if (
    typeof item.x !== 'number' ||
    typeof item.y !== 'number' ||
    !Number.isFinite(item.x) ||
    !Number.isFinite(item.y)
  ) {
    return null;
  }
  if (
    !(originalWidth > 0) ||
    !(originalHeight > 0) ||
    !(renderedWidth > 0) ||
    !(renderedHeight > 0)
  ) {
    return null;
  }
  try {
    const out = scaleOriginalPixelToRenderedPixel({
      x: item.x,
      y: item.y,
      originalDimensions: { width: originalWidth, height: originalHeight },
      renderedDimensions: { width: renderedWidth, height: renderedHeight },
    });
    return { renderedX: out.renderedX, renderedY: out.renderedY };
  } catch (err) {
    if (err instanceof GeoProjectionError) return null;
    return null;
  }
}
