// Raven Scout — drag-to-reposition coordinate-source policy tests
// (Task 10 follow-up).
//
// The reposition handler in /app/results.tsx applies a small policy:
// when the user drags a marker whose coordinate_source was
// 'user_provided' (locked to a HuntLocationAsset's stored GPS), the
// new coordinates land in `derived_from_saved_map_bounds` (geo-
// capable image) or `pixel_only` (otherwise). We replicate that
// policy here as a pure helper so its behavior is locked.
//
// We're not testing the React component itself (the existing test
// runner is node:test + tsx, no React Native renderer); we're
// testing the COORDINATE-SOURCE TRANSITION RULE that the handler
// uses, which is the only Task-specific bit of new behavior.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMarkerPlacement } from '../markerPlacement';
import type { GeoBounds } from '../geoProjection';

const BOUNDS: GeoBounds = {
  northLat: 45.0,
  southLat: 44.0,
  westLng: -93.5,
  eastLng: -92.5,
};

/**
 * Mirrors the policy used by handleRepositionItem in results.tsx:
 * pure function so we can lock the contract here.
 */
function downgradeSourceOnReposition(
  oldSource: string | null | undefined,
  newDerivedSource: 'derived_from_saved_map_bounds' | 'pixel_only',
): string {
  if (oldSource === 'user_provided') {
    return newDerivedSource;
  }
  return String(oldSource || newDerivedSource);
}

test('reposition: user_provided on geo image → derived_from_saved_map_bounds', () => {
  const placement = buildMarkerPlacement({
    renderedX: 250,
    renderedY: 200,
    renderedWidth: 500,
    renderedHeight: 400,
    originalWidth: 1000,
    originalHeight: 800,
    geo: { bounds: BOUNDS, supportsGeoPlacement: true },
  });
  assert.equal(placement.ok, true);
  if (!placement.ok) return;
  const newSource = downgradeSourceOnReposition(
    'user_provided',
    placement.data.coordinateSource,
  );
  assert.equal(newSource, 'derived_from_saved_map_bounds');
  // GPS gets recomputed from the new pixel — proves we don't keep
  // the old asset's stored values when the user moves the marker.
  assert.ok(Math.abs((placement.data as any).latitude - 44.5) < 1e-6);
  assert.ok(Math.abs((placement.data as any).longitude - -93.0) < 1e-6);
});

test('reposition: user_provided on pixel-only image → pixel_only', () => {
  const placement = buildMarkerPlacement({
    renderedX: 100,
    renderedY: 100,
    renderedWidth: 500,
    renderedHeight: 400,
    originalWidth: 1000,
    originalHeight: 800,
    geo: null,
  });
  assert.equal(placement.ok, true);
  if (!placement.ok) return;
  const newSource = downgradeSourceOnReposition(
    'user_provided',
    placement.data.coordinateSource,
  );
  assert.equal(newSource, 'pixel_only');
  // Crucially, no fabricated GPS:
  assert.equal((placement.data as any).latitude, null);
  assert.equal((placement.data as any).longitude, null);
});

test('reposition: ai_estimated stays ai_estimated (do not downgrade)', () => {
  const placement = buildMarkerPlacement({
    renderedX: 250,
    renderedY: 200,
    renderedWidth: 500,
    renderedHeight: 400,
    originalWidth: 1000,
    originalHeight: 800,
    geo: { bounds: BOUNDS, supportsGeoPlacement: true },
  });
  assert.equal(placement.ok, true);
  if (!placement.ok) return;
  const newSource = downgradeSourceOnReposition(
    'ai_estimated_from_image',
    placement.data.coordinateSource,
  );
  // Non-user_provided sources keep their original tag — the new
  // pixel position is reflected in x/y but the source label stays.
  assert.equal(newSource, 'ai_estimated_from_image');
});

test('reposition: derived_from_saved_map_bounds stays itself', () => {
  const placement = buildMarkerPlacement({
    renderedX: 250,
    renderedY: 200,
    renderedWidth: 500,
    renderedHeight: 400,
    originalWidth: 1000,
    originalHeight: 800,
    geo: { bounds: BOUNDS, supportsGeoPlacement: true },
  });
  assert.equal(placement.ok, true);
  if (!placement.ok) return;
  const newSource = downgradeSourceOnReposition(
    'derived_from_saved_map_bounds',
    placement.data.coordinateSource,
  );
  assert.equal(newSource, 'derived_from_saved_map_bounds');
});

test('reposition: out-of-bounds drag → placement.ok === false', () => {
  const placement = buildMarkerPlacement({
    renderedX: 1200, // off-image
    renderedY: 200,
    renderedWidth: 500,
    renderedHeight: 400,
    originalWidth: 1000,
    originalHeight: 800,
    geo: { bounds: BOUNDS, supportsGeoPlacement: true },
  });
  assert.equal(placement.ok, false);
  if (!placement.ok) {
    assert.equal(placement.reason, 'tap_out_of_bounds');
  }
});

test('reposition: pixel-only image never persists fabricated GPS even if user_provided', () => {
  // Hostile case: user repositions a user_provided marker on a
  // pixel-only image. We must NOT pretend the asset's old GPS
  // applies to the new position.
  const placement = buildMarkerPlacement({
    renderedX: 50,
    renderedY: 50,
    renderedWidth: 500,
    renderedHeight: 400,
    originalWidth: 1000,
    originalHeight: 800,
    geo: { supportsGeoPlacement: false }, // pixel-only
  });
  assert.equal(placement.ok, true);
  if (!placement.ok) return;
  const newSource = downgradeSourceOnReposition(
    'user_provided',
    placement.data.coordinateSource,
  );
  assert.equal(newSource, 'pixel_only');
  assert.equal((placement.data as any).latitude, null);
  assert.equal((placement.data as any).longitude, null);
});
