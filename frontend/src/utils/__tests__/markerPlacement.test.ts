// Raven Scout — markerPlacement.ts unit tests (Task 10).
//
// Validates the pure helper that turns a tap on the rendered image
// into the AnalysisOverlayItem persistence payload.
//
// Run: yarn test:unit (added to the package.json script).

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

const ORIG_W = 1000;
const ORIG_H = 800;
const REND_W = 500; // half scale
const REND_H = 400;

// =====================================================================
// Geo-capable image
// =====================================================================

test('geo: tap at center produces center lat/lng + center x/y', () => {
  const out = buildMarkerPlacement({
    renderedX: 250,
    renderedY: 200,
    renderedWidth: REND_W,
    renderedHeight: REND_H,
    originalWidth: ORIG_W,
    originalHeight: ORIG_H,
    geo: { bounds: BOUNDS, supportsGeoPlacement: true },
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  // Half-scale: tap (250,200) → original (500,400)
  assert.equal(out.data.x, 500);
  assert.equal(out.data.y, 400);
  assert.equal(out.data.coordinateSource, 'derived_from_saved_map_bounds');
  // Center of bbox = midpoint of N+S, W+E.
  if (out.data.coordinateSource === 'derived_from_saved_map_bounds') {
    assert.ok(Math.abs(out.data.latitude - 44.5) < 1e-6);
    assert.ok(Math.abs(out.data.longitude - -93.0) < 1e-6);
  }
});

test('geo: tap at top-left → north-west corner', () => {
  const out = buildMarkerPlacement({
    renderedX: 0,
    renderedY: 0,
    renderedWidth: REND_W,
    renderedHeight: REND_H,
    originalWidth: ORIG_W,
    originalHeight: ORIG_H,
    geo: { bounds: BOUNDS, supportsGeoPlacement: true },
  });
  assert.equal(out.ok, true);
  if (out.ok && out.data.coordinateSource === 'derived_from_saved_map_bounds') {
    assert.equal(out.data.x, 0);
    assert.equal(out.data.y, 0);
    assert.equal(out.data.latitude, 45.0);
    assert.equal(out.data.longitude, -93.5);
  }
});

test('geo: tap at bottom-right → south-east corner', () => {
  const out = buildMarkerPlacement({
    renderedX: REND_W,
    renderedY: REND_H,
    renderedWidth: REND_W,
    renderedHeight: REND_H,
    originalWidth: ORIG_W,
    originalHeight: ORIG_H,
    geo: { bounds: BOUNDS, supportsGeoPlacement: true },
  });
  assert.equal(out.ok, true);
  if (out.ok && out.data.coordinateSource === 'derived_from_saved_map_bounds') {
    assert.equal(out.data.x, ORIG_W);
    assert.equal(out.data.y, ORIG_H);
    assert.equal(out.data.latitude, 44.0);
    assert.equal(out.data.longitude, -92.5);
  }
});

// =====================================================================
// Pixel-only image — never fabricate GPS
// =====================================================================

test('pixel-only (no geo) → x/y populated, GPS null, source pixel_only', () => {
  const out = buildMarkerPlacement({
    renderedX: 100,
    renderedY: 50,
    renderedWidth: REND_W,
    renderedHeight: REND_H,
    originalWidth: ORIG_W,
    originalHeight: ORIG_H,
    geo: null,
  });
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.data.coordinateSource, 'pixel_only');
    assert.equal(out.data.x, 200);
    assert.equal(out.data.y, 100);
    assert.equal(out.data.latitude, null);
    assert.equal(out.data.longitude, null);
  }
});

test('pixel-only when supportsGeoPlacement explicitly false', () => {
  const out = buildMarkerPlacement({
    renderedX: 100,
    renderedY: 50,
    renderedWidth: REND_W,
    renderedHeight: REND_H,
    originalWidth: ORIG_W,
    originalHeight: ORIG_H,
    geo: { bounds: BOUNDS, supportsGeoPlacement: false },
  });
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.data.coordinateSource, 'pixel_only');
    assert.equal(out.data.latitude, null);
    assert.equal(out.data.longitude, null);
  }
});

test('pixel-only when bounds object is missing/incomplete', () => {
  const out = buildMarkerPlacement({
    renderedX: 100,
    renderedY: 50,
    renderedWidth: REND_W,
    renderedHeight: REND_H,
    originalWidth: ORIG_W,
    originalHeight: ORIG_H,
    geo: { bounds: undefined as any, supportsGeoPlacement: true },
  });
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.data.coordinateSource, 'pixel_only');
    assert.equal(out.data.latitude, null);
    assert.equal(out.data.longitude, null);
  }
});

test('pixel-only when bounds are inverted (south > north)', () => {
  const inverted: GeoBounds = { ...BOUNDS, northLat: 40, southLat: 45 };
  const out = buildMarkerPlacement({
    renderedX: 100,
    renderedY: 50,
    renderedWidth: REND_W,
    renderedHeight: REND_H,
    originalWidth: ORIG_W,
    originalHeight: ORIG_H,
    geo: { bounds: inverted, supportsGeoPlacement: true },
  });
  // Inverted bounds → treated as pixel-only; no faked GPS.
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.data.coordinateSource, 'pixel_only');
    assert.equal(out.data.latitude, null);
    assert.equal(out.data.longitude, null);
  }
});

// =====================================================================
// Validation failures
// =====================================================================

test('tap outside rendered rect → tap_out_of_bounds', () => {
  for (const tap of [
    [-1, 100],
    [100, -1],
    [REND_W + 1, 100],
    [100, REND_H + 1],
  ]) {
    const out = buildMarkerPlacement({
      renderedX: tap[0],
      renderedY: tap[1],
      renderedWidth: REND_W,
      renderedHeight: REND_H,
      originalWidth: ORIG_W,
      originalHeight: ORIG_H,
      geo: null,
    });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.reason, 'tap_out_of_bounds');
  }
});

test('NaN tap → tap_out_of_bounds', () => {
  const out = buildMarkerPlacement({
    renderedX: NaN,
    renderedY: 0,
    renderedWidth: REND_W,
    renderedHeight: REND_H,
    originalWidth: ORIG_W,
    originalHeight: ORIG_H,
    geo: null,
  });
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.reason, 'tap_out_of_bounds');
});

test('zero / negative dimensions → invalid_dimensions', () => {
  for (const dims of [
    { rw: 0, rh: 100, ow: 100, oh: 100 },
    { rw: 100, rh: 0, ow: 100, oh: 100 },
    { rw: 100, rh: 100, ow: 0, oh: 100 },
    { rw: 100, rh: 100, ow: 100, oh: 0 },
  ]) {
    const out = buildMarkerPlacement({
      renderedX: 50,
      renderedY: 50,
      renderedWidth: dims.rw,
      renderedHeight: dims.rh,
      originalWidth: dims.ow,
      originalHeight: dims.oh,
      geo: null,
    });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.reason, 'invalid_dimensions');
  }
});

// =====================================================================
// 1:1 rendering (no scaling)
// =====================================================================

test('1:1 render: tap maps directly to original pixel', () => {
  const out = buildMarkerPlacement({
    renderedX: 123,
    renderedY: 456,
    renderedWidth: 1000,
    renderedHeight: 800,
    originalWidth: 1000,
    originalHeight: 800,
    geo: null,
  });
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.ok(Math.abs(out.data.x - 123) < 1e-9);
    assert.ok(Math.abs(out.data.y - 456) < 1e-9);
  }
});
