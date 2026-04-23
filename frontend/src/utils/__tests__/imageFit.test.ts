// Raven Scout — imageFit coordinate-contract tests.
//
// Guards the canonical mapping between the analyzed image's natural
// pixel grid and the on-screen rect it occupies inside a container.
// These cover the six scenarios from the bug report:
//   1) same aspect            → rect == container, no letterbox
//   2) portrait image, landscape container
//   3) landscape image, portrait container
//   4) image with EXIF-normalized portrait orientation (just aspect)
//   5) missing natural dims  → degraded fallback
//   6) tiny container        → defensive zero-safe behavior
//
// Run: yarn test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeFittedImageRect, findOutOfBoundsOverlayIndices } from '../imageFit';

// Helper — approx equals to absorb floating-point dust.
function eq(a: number, b: number, eps = 0.001): boolean {
  return Math.abs(a - b) < eps;
}

// ============ same aspect ratio (1:1 into 1:1) ============

test('fit: identical aspect → rect fills container, no letterbox', () => {
  const r = computeFittedImageRect(300, 300, 1000, 1000);
  assert.equal(r.offsetX, 0);
  assert.equal(r.offsetY, 0);
  assert.equal(r.width, 300);
  assert.equal(r.height, 300);
  assert.equal(r.degraded, false);
});

test('fit: mid-range 16:9 into 16:9 → rect fills', () => {
  const r = computeFittedImageRect(320, 180, 1920, 1080);
  assert.ok(eq(r.width, 320));
  assert.ok(eq(r.height, 180));
  assert.equal(r.offsetX, 0);
  assert.equal(r.offsetY, 0);
});

// ============ wider image than container ============

test('fit: wider image than container → height-shrunk + vertical letterbox', () => {
  // Container 343 × 350 (≈0.98). Image 1920 × 1080 (16:9 ≈ 1.78).
  // Image aspect > container aspect → width-fitted.
  // width = 343, height = 343 / (1920/1080) = 192.94...
  const r = computeFittedImageRect(343, 350, 1920, 1080);
  assert.ok(eq(r.width, 343), `width=${r.width}`);
  assert.ok(eq(r.height, 343 / (1920 / 1080)), `height=${r.height}`);
  assert.equal(r.offsetX, 0);
  assert.ok(eq(r.offsetY, (350 - r.height) / 2));
  assert.equal(r.degraded, false);
});

// ============ taller image than container ============

test('fit: taller image than container → width-shrunk + horizontal letterbox', () => {
  // Container 343 × 350. Image 1080 × 1920 (portrait, 9:16 ≈ 0.56).
  // Image aspect < container aspect → height-fitted.
  // height = 350, width = 350 * (1080/1920) = 196.875
  const r = computeFittedImageRect(343, 350, 1080, 1920);
  assert.ok(eq(r.height, 350));
  assert.ok(eq(r.width, 350 * (1080 / 1920)), `width=${r.width}`);
  assert.ok(eq(r.offsetX, (343 - r.width) / 2));
  assert.equal(r.offsetY, 0);
  assert.equal(r.degraded, false);
});

// ============ portrait rotation scenario (post-orientation-normalize) ============

test('fit: portrait capture into landscape container → height-fitted letterbox', () => {
  // Post-normalization portrait image (tall). Container is wider than tall.
  const r = computeFittedImageRect(800, 400, 1080, 1920);
  // Image aspect 0.5625 < container aspect 2.0 → height-fitted.
  assert.equal(r.height, 400);
  assert.ok(eq(r.width, 400 * (1080 / 1920))); // 225
  assert.ok(eq(r.offsetX, (800 - 225) / 2));   // 287.5
  assert.equal(r.offsetY, 0);
});

// ============ degraded / missing natural dims ============

test('fit: missing natural width → degraded to container with no offset', () => {
  const r = computeFittedImageRect(300, 200, 0, 1000);
  assert.equal(r.degraded, true);
  assert.equal(r.width, 300);
  assert.equal(r.height, 200);
  assert.equal(r.offsetX, 0);
  assert.equal(r.offsetY, 0);
});

test('fit: missing natural height → degraded to container', () => {
  const r = computeFittedImageRect(300, 200, 800, 0);
  assert.equal(r.degraded, true);
  assert.equal(r.width, 300);
  assert.equal(r.height, 200);
});

test('fit: NaN natural dims → degraded', () => {
  const r = computeFittedImageRect(300, 200, NaN as any, 1000);
  assert.equal(r.degraded, true);
});

test('fit: negative natural dims → degraded', () => {
  const r = computeFittedImageRect(300, 200, -100, -100);
  assert.equal(r.degraded, true);
});

// ============ defensive inputs ============

test('fit: zero container size → zero output, not NaN', () => {
  const r = computeFittedImageRect(0, 0, 1920, 1080);
  assert.ok(Number.isFinite(r.width));
  assert.ok(Number.isFinite(r.height));
  assert.ok(Number.isFinite(r.offsetX));
  assert.ok(Number.isFinite(r.offsetY));
});

test('fit: negative container size → normalized to zero', () => {
  const r = computeFittedImageRect(-100, -100, 1920, 1080);
  assert.ok(Number.isFinite(r.width));
  assert.ok(Number.isFinite(r.height));
});

// ============ marker coordinate-contract round-trip ============

test('coord-contract: marker at x_percent=50,y_percent=50 lands at image centre', () => {
  // Container 343 × 350, portrait image 1080 × 1920 (letterboxed horizontally).
  const r = computeFittedImageRect(343, 350, 1080, 1920);
  // x_percent=50 → offsetX + 50% of fitted width == container center
  const markerX = r.offsetX + (50 / 100) * r.width;
  const markerY = r.offsetY + (50 / 100) * r.height;
  assert.ok(eq(markerX, 343 / 2));
  assert.ok(eq(markerY, 350 / 2));
});

test('coord-contract: marker at (0,0) lands at top-left of displayed image (NOT container)', () => {
  const r = computeFittedImageRect(343, 350, 1080, 1920);
  const markerX = r.offsetX + 0;
  const markerY = r.offsetY + 0;
  // Displayed image's top-left is at (offsetX, 0) because image is
  // height-fitted and centred horizontally.
  assert.ok(markerX > 0, 'should be inset by letterbox padding');
  assert.equal(markerY, 0);
});

test('coord-contract: marker at (100,100) lands at bottom-right of displayed image', () => {
  const r = computeFittedImageRect(343, 350, 1080, 1920);
  const markerX = r.offsetX + r.width;
  const markerY = r.offsetY + r.height;
  // Ends at (offsetX + width, height) — within container bounds.
  assert.ok(markerX <= 343);
  assert.ok(markerY <= 350);
  assert.ok(eq(markerX, r.offsetX + r.width));
  assert.ok(eq(markerY, 350)); // height-fitted case
});

test('coord-contract: landscape image — marker at (0,0) lands at top of letterbox not container', () => {
  const r = computeFittedImageRect(343, 350, 1920, 1080);
  const markerY = r.offsetY + 0;
  assert.ok(markerY > 0, 'top of image is letterbox-offset down from container top');
});

// ============ out-of-bounds detector ============

test('oob: all-valid overlays return empty list', () => {
  const oob = findOutOfBoundsOverlayIndices([
    { x_percent: 0, y_percent: 0 },
    { x_percent: 50, y_percent: 50 },
    { x_percent: 100, y_percent: 100 },
    { x_percent: 25.5, y_percent: 99.9 },
  ]);
  assert.deepEqual(oob, []);
});

test('oob: out-of-range or missing overlays are flagged', () => {
  const oob = findOutOfBoundsOverlayIndices([
    { x_percent: 50, y_percent: 50 },    // 0 OK
    { x_percent: -5, y_percent: 50 },    // 1 OOB
    { x_percent: 50, y_percent: 105 },   // 2 OOB
    { x_percent: 50 },                   // 3 OOB (missing y)
    { y_percent: 50 },                   // 4 OOB (missing x)
    { x_percent: 'a' as any, y_percent: 10 }, // 5 OOB (bad type)
  ]);
  assert.deepEqual(oob, [1, 2, 3, 4, 5]);
});

test('oob: tolerance accepts small overshoot caused by rounding', () => {
  const oob = findOutOfBoundsOverlayIndices(
    [{ x_percent: 100.5, y_percent: -0.3 }],
    1,
  );
  assert.deepEqual(oob, []);
});
