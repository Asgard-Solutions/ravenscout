// Raven Scout — Tests for cheap image header probing & the
// compression-skip guardrail. Pure logic, no native deps.
//
// Run with:  yarn test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { probeImage, shouldSkipCompression } from '../imageProbe';

// ------------------------------ Fixture builders ------------------------------

function toBase64DataUri(bytes: number[], mime: string): string {
  const buf = Buffer.from(Uint8Array.from(bytes));
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * Build a minimal-but-valid JPEG:
 *   SOI + APP0 (JFIF) + SOF0 carrying width/height + EOI
 * Enough for `probeImage` to pick up dimensions.
 */
function makeJpeg(width: number, height: number, padBytes = 0): string {
  const bytes: number[] = [];
  // SOI
  bytes.push(0xff, 0xd8);
  // APP0 JFIF segment (length 16)
  bytes.push(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00);
  // SOF0 marker
  bytes.push(0xff, 0xc0);
  // Segment length = 17 (0x0011) for 3-component SOF0
  bytes.push(0x00, 0x11);
  // Sample precision
  bytes.push(0x08);
  // Height (big-endian)
  bytes.push((height >> 8) & 0xff, height & 0xff);
  // Width (big-endian)
  bytes.push((width >> 8) & 0xff, width & 0xff);
  // Number of components
  bytes.push(0x03);
  // Component specs (id, sampling, qtable) x3
  bytes.push(0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01);
  // Optional padding (simulates a larger file body) — not a real
  // scan, but `probeImage` only inspects markers before SOF so
  // appended bytes are fine for byte-budget tests.
  for (let i = 0; i < padBytes; i++) bytes.push(0x00);
  // EOI
  bytes.push(0xff, 0xd9);
  return toBase64DataUri(bytes, 'image/jpeg');
}

/** Build a minimal PNG with an IHDR carrying width/height. */
function makePng(width: number, height: number): string {
  const bytes: number[] = [];
  // Signature
  bytes.push(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  // IHDR chunk length (13)
  bytes.push(0x00, 0x00, 0x00, 0x0d);
  // "IHDR"
  bytes.push(0x49, 0x48, 0x44, 0x52);
  // Width (4 bytes BE)
  bytes.push((width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff);
  // Height (4 bytes BE)
  bytes.push((height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff);
  // Bit depth / colour type / compression / filter / interlace
  bytes.push(0x08, 0x02, 0x00, 0x00, 0x00);
  // Fake CRC (probe doesn't validate)
  bytes.push(0x00, 0x00, 0x00, 0x00);
  return toBase64DataUri(bytes, 'image/png');
}

// ------------------------------ probeImage ------------------------------

test('probeImage — decodes JPEG dimensions from a data URI', () => {
  const p = probeImage(makeJpeg(1280, 720));
  assert.ok(p, 'expected probe result');
  assert.equal(p!.format, 'jpeg');
  assert.equal(p!.width, 1280);
  assert.equal(p!.height, 720);
  assert.ok(p!.bytes > 0);
});

test('probeImage — decodes PNG dimensions from a data URI', () => {
  const p = probeImage(makePng(800, 600));
  assert.ok(p, 'expected probe result');
  assert.equal(p!.format, 'png');
  assert.equal(p!.width, 800);
  assert.equal(p!.height, 600);
});

test('probeImage — returns null for unknown/invalid formats', () => {
  assert.equal(probeImage(''), null);
  assert.equal(probeImage('data:text/plain;base64,aGVsbG8='), null);
  // Random bytes with no magic header
  const junk = toBase64DataUri([0x00, 0x01, 0x02, 0x03, 0x04], 'application/octet-stream');
  assert.equal(probeImage(junk), null);
});

test('probeImage — accepts bare base64 (no data: prefix)', () => {
  const dataUri = makeJpeg(640, 480);
  const bare = dataUri.split(',')[1]!;
  const p = probeImage(bare);
  assert.ok(p, 'expected probe result from raw base64');
  assert.equal(p!.width, 640);
  assert.equal(p!.height, 480);
});

// ------------------------------ shouldSkipCompression ------------------------------

test('shouldSkipCompression — skips small JPEG within budget', () => {
  // Small JPEG with ~minimal body → fits the per-MP byte budget easily.
  const input = makeJpeg(1024, 768);
  const r = shouldSkipCompression(input, { maxDim: 1280 });
  assert.equal(r.skip, true, `expected skip=true, got reason=${r.reason}`);
  assert.equal(r.reason, 'within-budget');
});

test('shouldSkipCompression — does NOT skip oversized width', () => {
  const input = makeJpeg(4000, 3000);
  const r = shouldSkipCompression(input, { maxDim: 1280 });
  assert.equal(r.skip, false);
  assert.equal(r.reason, 'oversized');
});

test('shouldSkipCompression — does NOT skip PNG (always recompress to JPEG)', () => {
  const input = makePng(800, 600);
  const r = shouldSkipCompression(input, { maxDim: 1280 });
  assert.equal(r.skip, false);
  assert.equal(r.reason, 'not-jpeg');
});

test('shouldSkipCompression — does NOT skip unprobeable input', () => {
  const r = shouldSkipCompression('not-an-image', { maxDim: 1280 });
  assert.equal(r.skip, false);
  assert.equal(r.reason, 'unprobeable');
  assert.equal(r.probe, null);
});

test('shouldSkipCompression — does NOT skip bytes well above target budget', () => {
  // 640×480 JPEG padded to 5 MB — way over the per-MP byte budget.
  const input = makeJpeg(640, 480, 5_000_000);
  const r = shouldSkipCompression(input, { maxDim: 1280 });
  assert.equal(r.skip, false);
  assert.equal(r.reason, 'oversized-bytes');
});

test('shouldSkipCompression — respects custom targetMaxBytes', () => {
  // 640×480 + 10 KB padding → small file. With a ridiculously tight
  // budget it should fail the byte-budget check.
  const input = makeJpeg(640, 480, 10_000);
  const r = shouldSkipCompression(input, { maxDim: 1280, targetMaxBytes: 1_000 });
  assert.equal(r.skip, false);
  assert.equal(r.reason, 'oversized-bytes');
});
