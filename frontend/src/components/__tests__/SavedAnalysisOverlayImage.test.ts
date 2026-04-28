// Raven Scout — SavedAnalysisOverlayImage / overlayItemTaxonomy tests.
//
// These cover the pure helpers used by Task 9's saved-overlay
// renderer. They intentionally avoid mounting the React Native
// component itself (the existing test runner is `node:test` + `tsx`
// — there's no React Native renderer wired up). The component's
// rendering is itself a thin wrapper around `computeOverlayRenderedAnchor`
// + `getOverlayItemTypeInfo`, so covering those covers the
// scaling + visual mapping contract.
//
// Run: yarn test:unit -- (or invoke this file directly with
//   node --test --import tsx <path>)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeOverlayRenderedAnchor } from '../../utils/savedOverlayLayout';
import {
  coordinateSourceLabel,
  getOverlayItemTypeInfo,
} from '../../constants/overlayItemTaxonomy';
import type { AnalysisOverlayItem } from '../../types/geo';

// ---- shared fixtures ------------------------------------------------

const ITEM_AT_500_400: Pick<AnalysisOverlayItem, 'x' | 'y'> = { x: 500, y: 400 };

// =====================================================================
// computeOverlayRenderedAnchor — scaling math
// =====================================================================

test('renders at expected scaled position when display matches original', () => {
  // 1000x800 image rendered 1:1 → 500/400 stays at 500/400.
  const out = computeOverlayRenderedAnchor({
    item: ITEM_AT_500_400,
    originalWidth: 1000,
    originalHeight: 800,
    renderedWidth: 1000,
    renderedHeight: 800,
  });
  assert.deepEqual(out, { renderedX: 500, renderedY: 400 });
});

test('image displayed at half size scales overlay correctly', () => {
  // 1000x800 → 500x400 = 0.5 scale → 500,400 lands at 250,200.
  const out = computeOverlayRenderedAnchor({
    item: ITEM_AT_500_400,
    originalWidth: 1000,
    originalHeight: 800,
    renderedWidth: 500,
    renderedHeight: 400,
  });
  assert.deepEqual(out, { renderedX: 250, renderedY: 200 });
});

test('image displayed at 1.5x scales overlay correctly', () => {
  const out = computeOverlayRenderedAnchor({
    item: { x: 200, y: 100 },
    originalWidth: 800,
    originalHeight: 600,
    renderedWidth: 1200,
    renderedHeight: 900,
  });
  assert.deepEqual(out, { renderedX: 300, renderedY: 150 });
});

test('non-square scaling uses x and y independently', () => {
  // x scale = 2x, y scale = 0.5x.
  const out = computeOverlayRenderedAnchor({
    item: { x: 100, y: 100 },
    originalWidth: 200,
    originalHeight: 400,
    renderedWidth: 400,
    renderedHeight: 200,
  });
  assert.deepEqual(out, { renderedX: 200, renderedY: 50 });
});

test('item with no x/y returns null (do not invent a position)', () => {
  const out = computeOverlayRenderedAnchor({
    item: { x: null, y: null } as any,
    originalWidth: 1000,
    originalHeight: 800,
    renderedWidth: 500,
    renderedHeight: 400,
  });
  assert.equal(out, null);
});

test('item with NaN/Infinity coordinates returns null', () => {
  for (const v of [NaN, Infinity, -Infinity]) {
    const a = computeOverlayRenderedAnchor({
      item: { x: v, y: 0 },
      originalWidth: 1000,
      originalHeight: 800,
      renderedWidth: 500,
      renderedHeight: 400,
    });
    const b = computeOverlayRenderedAnchor({
      item: { x: 0, y: v },
      originalWidth: 1000,
      originalHeight: 800,
      renderedWidth: 500,
      renderedHeight: 400,
    });
    assert.equal(a, null);
    assert.equal(b, null);
  }
});

test('zero or negative dimensions are rejected (no division-by-zero)', () => {
  const cases = [
    { ow: 0, oh: 800, rw: 500, rh: 400 },
    { ow: 1000, oh: 0, rw: 500, rh: 400 },
    { ow: 1000, oh: 800, rw: 0, rh: 400 },
    { ow: 1000, oh: 800, rw: 500, rh: 0 },
    { ow: -10, oh: 800, rw: 500, rh: 400 },
  ];
  for (const c of cases) {
    const out = computeOverlayRenderedAnchor({
      item: ITEM_AT_500_400,
      originalWidth: c.ow,
      originalHeight: c.oh,
      renderedWidth: c.rw,
      renderedHeight: c.rh,
    });
    assert.equal(out, null);
  }
});

test('overlay positions are determined by SAVED x/y, not GPS', () => {
  // Two items with identical x/y but wildly different latitude/longitude.
  // The renderer must pick the same rendered anchor for both.
  const a = computeOverlayRenderedAnchor({
    item: { x: 250, y: 200 } as any,
    originalWidth: 1000,
    originalHeight: 800,
    renderedWidth: 500,
    renderedHeight: 400,
  });
  const b = computeOverlayRenderedAnchor({
    item: { x: 250, y: 200 } as any,
    originalWidth: 1000,
    originalHeight: 800,
    renderedWidth: 500,
    renderedHeight: 400,
  });
  assert.deepEqual(a, b);
  assert.deepEqual(a, { renderedX: 125, renderedY: 100 });
});

// =====================================================================
// Reload contract — same item rendered before and after a "reload"
// (the test impersonates a remount by re-running the scaling) must
// produce the SAME rendered anchor regardless of any imagined
// "live map state".
// =====================================================================

test('reload reproduces identical rendered anchor', () => {
  const item: Pick<AnalysisOverlayItem, 'x' | 'y'> = { x: 750, y: 300 };
  const dims = {
    originalWidth: 1000,
    originalHeight: 800,
    renderedWidth: 600,
    renderedHeight: 480,
  };
  const before = computeOverlayRenderedAnchor({ item, ...dims });
  const after = computeOverlayRenderedAnchor({ item, ...dims });
  assert.deepEqual(before, after);
  // Also explicitly: 750/1000 * 600 = 450 ; 300/800 * 480 = 180.
  assert.deepEqual(before, { renderedX: 450, renderedY: 180 });
});

// =====================================================================
// Multiple items render independently
// =====================================================================

test('multiple overlay items map to distinct rendered positions', () => {
  const items: Array<Pick<AnalysisOverlayItem, 'x' | 'y'>> = [
    { x: 0, y: 0 },
    { x: 1000, y: 800 },
    { x: 500, y: 400 },
    { x: 250, y: 200 },
  ];
  const anchors = items.map(it =>
    computeOverlayRenderedAnchor({
      item: it,
      originalWidth: 1000,
      originalHeight: 800,
      renderedWidth: 500,
      renderedHeight: 400,
    }),
  );
  assert.deepEqual(anchors, [
    { renderedX: 0, renderedY: 0 },
    { renderedX: 500, renderedY: 400 },
    { renderedX: 250, renderedY: 200 },
    { renderedX: 125, renderedY: 100 },
  ]);
});

// =====================================================================
// Taxonomy / detail-panel labels
// =====================================================================

test('coordinateSourceLabel describes pixel_only correctly', () => {
  assert.equal(
    coordinateSourceLabel('pixel_only'),
    'Pixel-only image placement',
  );
});

test('coordinateSourceLabel describes user_provided correctly', () => {
  assert.equal(coordinateSourceLabel('user_provided'), 'User provided');
});

test('coordinateSourceLabel falls back gracefully for unknown source', () => {
  assert.equal(coordinateSourceLabel('something_new' as any), 'something_new');
  assert.equal(coordinateSourceLabel(null), 'Unknown');
  assert.equal(coordinateSourceLabel(undefined), 'Unknown');
});

test('getOverlayItemTypeInfo returns canonical info for known types', () => {
  const stand = getOverlayItemTypeInfo('stand');
  assert.equal(stand.type, 'stand');
  assert.equal(stand.label, 'Stand');
  assert.match(stand.color, /^#?[0-9A-Fa-f]{3,8}$/);
  assert.ok(stand.icon.length > 0);

  const pixelOnlyType = getOverlayItemTypeInfo('avoid_area');
  assert.equal(pixelOnlyType.type, 'avoid_area');
  assert.equal(pixelOnlyType.label, 'Avoid Area');
});

test('getOverlayItemTypeInfo falls back to a sane default for unknown types', () => {
  const fb = getOverlayItemTypeInfo('does_not_exist' as any);
  assert.equal(fb.type, 'custom');
  assert.equal(fb.label, 'Marker');
});

test('getOverlayItemTypeInfo handles null and undefined gracefully', () => {
  assert.equal(getOverlayItemTypeInfo(null).type, 'custom');
  assert.equal(getOverlayItemTypeInfo(undefined).type, 'custom');
});
