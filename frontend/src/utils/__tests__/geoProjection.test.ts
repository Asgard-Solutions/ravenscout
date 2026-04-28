// Raven Scout — geoProjection conversion-contract tests.
//
// Run: yarn test:unit  (uses node:test + tsx, like the other tests in
// this folder).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GeoProjectionError,
  latLngToPixel,
  pixelToLatLng,
  scaleOriginalPixelToRenderedPixel,
  scaleRenderedPixelToOriginalPixel,
  type GeoBounds,
  type ImageDimensions,
} from '../geoProjection';

// ----- shared fixtures -----

const BOUNDS: GeoBounds = {
  northLat: 45.0,
  southLat: 44.0,
  westLng: -93.5,
  eastLng: -92.5,
};
const IMG: ImageDimensions = { width: 1000, height: 800 };

// helper: floats are not exact under chained ops.
function approx(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

// =====================================================================
// latLngToPixel
// =====================================================================

test('latLngToPixel: image center maps to center pixel', () => {
  const centerLat = (BOUNDS.northLat + BOUNDS.southLat) / 2; // 44.5
  const centerLng = (BOUNDS.westLng + BOUNDS.eastLng) / 2;   // -93.0
  const p = latLngToPixel({
    latitude: centerLat,
    longitude: centerLng,
    bounds: BOUNDS,
    originalDimensions: IMG,
  });
  assert.ok(approx(p.x, IMG.width / 2));
  assert.ok(approx(p.y, IMG.height / 2));
});

test('latLngToPixel: north/west corner maps to (0, 0)', () => {
  const p = latLngToPixel({
    latitude: BOUNDS.northLat,
    longitude: BOUNDS.westLng,
    bounds: BOUNDS,
    originalDimensions: IMG,
  });
  assert.ok(approx(p.x, 0));
  assert.ok(approx(p.y, 0));
});

test('latLngToPixel: south/east corner maps to (width, height)', () => {
  const p = latLngToPixel({
    latitude: BOUNDS.southLat,
    longitude: BOUNDS.eastLng,
    bounds: BOUNDS,
    originalDimensions: IMG,
  });
  assert.ok(approx(p.x, IMG.width));
  assert.ok(approx(p.y, IMG.height));
});

test('latLngToPixel: rejects out-of-range latitude', () => {
  assert.throws(
    () =>
      latLngToPixel({
        latitude: 95,
        longitude: -93,
        bounds: BOUNDS,
        originalDimensions: IMG,
      }),
    GeoProjectionError,
  );
});

test('latLngToPixel: rejects out-of-range longitude', () => {
  assert.throws(
    () =>
      latLngToPixel({
        latitude: 44.5,
        longitude: 181,
        bounds: BOUNDS,
        originalDimensions: IMG,
      }),
    GeoProjectionError,
  );
});

test('latLngToPixel: rejects NaN latitude', () => {
  assert.throws(
    () =>
      latLngToPixel({
        latitude: Number.NaN,
        longitude: -93,
        bounds: BOUNDS,
        originalDimensions: IMG,
      }),
    GeoProjectionError,
  );
});

test('latLngToPixel: rejects null bounds', () => {
  assert.throws(
    () =>
      latLngToPixel({
        latitude: 44.5,
        longitude: -93,
        bounds: null as unknown as GeoBounds,
        originalDimensions: IMG,
      }),
    GeoProjectionError,
  );
});

test('latLngToPixel: rejects zero width', () => {
  assert.throws(
    () =>
      latLngToPixel({
        latitude: 44.5,
        longitude: -93,
        bounds: BOUNDS,
        originalDimensions: { width: 0, height: 800 },
      }),
    GeoProjectionError,
  );
});

test('latLngToPixel: rejects zero height', () => {
  assert.throws(
    () =>
      latLngToPixel({
        latitude: 44.5,
        longitude: -93,
        bounds: BOUNDS,
        originalDimensions: { width: 1000, height: 0 },
      }),
    GeoProjectionError,
  );
});

test('latLngToPixel: rejects inverted lat bounds', () => {
  assert.throws(
    () =>
      latLngToPixel({
        latitude: 44.5,
        longitude: -93,
        bounds: { northLat: 44, southLat: 45, westLng: -93.5, eastLng: -92.5 },
        originalDimensions: IMG,
      }),
    GeoProjectionError,
  );
});

test('latLngToPixel: rejects east <= west bounds', () => {
  assert.throws(
    () =>
      latLngToPixel({
        latitude: 44.5,
        longitude: -93,
        bounds: { northLat: 45, southLat: 44, westLng: -92, eastLng: -93 },
        originalDimensions: IMG,
      }),
    GeoProjectionError,
  );
});

test('latLngToPixel: outside-box, no clamp → produces extrapolated pixel', () => {
  const p = latLngToPixel({
    latitude: 46, // north of northLat
    longitude: -93,
    bounds: BOUNDS,
    originalDimensions: IMG,
  });
  // y = (45 - 46) / (45 - 44) * 800 = -800
  assert.ok(approx(p.y, -800));
});

test('latLngToPixel: outside-box, clamp:true → snaps to edge', () => {
  const p = latLngToPixel({
    latitude: 46,        // north of northLat
    longitude: -91,      // east of eastLng
    bounds: BOUNDS,
    originalDimensions: IMG,
    clamp: true,
  });
  assert.equal(p.x, IMG.width);
  assert.equal(p.y, 0);
});

test('latLngToPixel: clamp does not silence INVALID lat input', () => {
  // 95° is still outside the legal latitude range — clamp must NOT
  // turn that into a 422-bypass.
  assert.throws(
    () =>
      latLngToPixel({
        latitude: 95,
        longitude: -93,
        bounds: BOUNDS,
        originalDimensions: IMG,
        clamp: true,
      }),
    GeoProjectionError,
  );
});

// =====================================================================
// pixelToLatLng
// =====================================================================

test('pixelToLatLng: pixel center maps to center lat/lng', () => {
  const ll = pixelToLatLng({
    x: IMG.width / 2,
    y: IMG.height / 2,
    bounds: BOUNDS,
    originalDimensions: IMG,
  });
  assert.ok(approx(ll.latitude, (BOUNDS.northLat + BOUNDS.southLat) / 2));
  assert.ok(approx(ll.longitude, (BOUNDS.westLng + BOUNDS.eastLng) / 2));
});

test('pixelToLatLng: (0,0) maps to north/west corner', () => {
  const ll = pixelToLatLng({
    x: 0,
    y: 0,
    bounds: BOUNDS,
    originalDimensions: IMG,
  });
  assert.ok(approx(ll.latitude, BOUNDS.northLat));
  assert.ok(approx(ll.longitude, BOUNDS.westLng));
});

test('pixelToLatLng: (width,height) maps to south/east corner', () => {
  const ll = pixelToLatLng({
    x: IMG.width,
    y: IMG.height,
    bounds: BOUNDS,
    originalDimensions: IMG,
  });
  assert.ok(approx(ll.latitude, BOUNDS.southLat));
  assert.ok(approx(ll.longitude, BOUNDS.eastLng));
});

test('pixelToLatLng: round-trip with latLngToPixel preserves the point', () => {
  const lat = 44.6789;
  const lng = -92.9123;
  const p = latLngToPixel({
    latitude: lat,
    longitude: lng,
    bounds: BOUNDS,
    originalDimensions: IMG,
  });
  const back = pixelToLatLng({
    x: p.x,
    y: p.y,
    bounds: BOUNDS,
    originalDimensions: IMG,
  });
  assert.ok(approx(back.latitude, lat));
  assert.ok(approx(back.longitude, lng));
});

test('pixelToLatLng: rejects non-finite x', () => {
  assert.throws(
    () =>
      pixelToLatLng({
        x: Number.NaN,
        y: 100,
        bounds: BOUNDS,
        originalDimensions: IMG,
      }),
    GeoProjectionError,
  );
});

test('pixelToLatLng: out-of-range pixel, no clamp → extrapolates', () => {
  const ll = pixelToLatLng({
    x: IMG.width * 2, // way past east edge
    y: IMG.height / 2,
    bounds: BOUNDS,
    originalDimensions: IMG,
  });
  // longitude should be westLng + 2 * (eastLng - westLng) = -91.5
  assert.ok(approx(ll.longitude, -91.5));
});

test('pixelToLatLng: out-of-range pixel, clamp:true → snaps to bounds', () => {
  const ll = pixelToLatLng({
    x: IMG.width * 2,
    y: -IMG.height,
    bounds: BOUNDS,
    originalDimensions: IMG,
    clamp: true,
  });
  assert.equal(ll.longitude, BOUNDS.eastLng);
  // y < 0 means north of northLat — but clamp pulls back.
  assert.equal(ll.latitude, BOUNDS.northLat);
});

test('pixelToLatLng: rejects null bounds', () => {
  assert.throws(
    () =>
      pixelToLatLng({
        x: 0,
        y: 0,
        bounds: null as unknown as GeoBounds,
        originalDimensions: IMG,
      }),
    GeoProjectionError,
  );
});

test('pixelToLatLng: rejects zero dimensions', () => {
  assert.throws(
    () =>
      pixelToLatLng({
        x: 0,
        y: 0,
        bounds: BOUNDS,
        originalDimensions: { width: 0, height: 0 },
      }),
    GeoProjectionError,
  );
});

// =====================================================================
// scaleOriginalPixelToRenderedPixel
// =====================================================================

test('original→rendered: uniform scale doubles the coordinates', () => {
  const r = scaleOriginalPixelToRenderedPixel({
    x: 100,
    y: 200,
    originalDimensions: { width: 1000, height: 800 },
    renderedDimensions: { width: 2000, height: 1600 },
  });
  assert.ok(approx(r.renderedX, 200));
  assert.ok(approx(r.renderedY, 400));
});

test('original→rendered: non-uniform scale per axis', () => {
  const r = scaleOriginalPixelToRenderedPixel({
    x: 500,
    y: 400,
    originalDimensions: { width: 1000, height: 800 },
    renderedDimensions: { width: 500, height: 200 },
  });
  assert.ok(approx(r.renderedX, 250));
  assert.ok(approx(r.renderedY, 100));
});

test('original→rendered: rejects zero rendered dims', () => {
  assert.throws(
    () =>
      scaleOriginalPixelToRenderedPixel({
        x: 100,
        y: 200,
        originalDimensions: { width: 1000, height: 800 },
        renderedDimensions: { width: 0, height: 0 },
      }),
    GeoProjectionError,
  );
});

test('original→rendered: rejects non-finite x', () => {
  assert.throws(
    () =>
      scaleOriginalPixelToRenderedPixel({
        x: Number.POSITIVE_INFINITY,
        y: 200,
        originalDimensions: { width: 1000, height: 800 },
        renderedDimensions: { width: 500, height: 400 },
      }),
    GeoProjectionError,
  );
});

// =====================================================================
// scaleRenderedPixelToOriginalPixel
// =====================================================================

test('rendered→original: halves rendered coords back to original', () => {
  const r = scaleRenderedPixelToOriginalPixel({
    renderedX: 200,
    renderedY: 400,
    originalDimensions: { width: 1000, height: 800 },
    renderedDimensions: { width: 2000, height: 1600 },
  });
  assert.ok(approx(r.x, 100));
  assert.ok(approx(r.y, 200));
});

test('rendered→original → round-trip preserves the point', () => {
  const orig: ImageDimensions = { width: 1234, height: 567 };
  const rend: ImageDimensions = { width: 320, height: 240 };
  const start = { x: 678.9, y: 123.4 };
  const r = scaleOriginalPixelToRenderedPixel({
    ...start,
    originalDimensions: orig,
    renderedDimensions: rend,
  });
  const back = scaleRenderedPixelToOriginalPixel({
    renderedX: r.renderedX,
    renderedY: r.renderedY,
    originalDimensions: orig,
    renderedDimensions: rend,
  });
  assert.ok(approx(back.x, start.x, 1e-9));
  assert.ok(approx(back.y, start.y, 1e-9));
});

test('rendered→original: rejects zero original dims', () => {
  assert.throws(
    () =>
      scaleRenderedPixelToOriginalPixel({
        renderedX: 100,
        renderedY: 100,
        originalDimensions: { width: 0, height: 800 },
        renderedDimensions: { width: 500, height: 400 },
      }),
    GeoProjectionError,
  );
});

test('rendered→original: rejects null dims', () => {
  assert.throws(
    () =>
      scaleRenderedPixelToOriginalPixel({
        renderedX: 100,
        renderedY: 100,
        originalDimensions: null as unknown as ImageDimensions,
        renderedDimensions: { width: 500, height: 400 },
      }),
    GeoProjectionError,
  );
});
