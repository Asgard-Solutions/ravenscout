// Raven Scout \u2014 pendingMapImageMeta unit tests (Task 5).
//
// Pure-function tests via the project's existing node:test + tsx
// harness. Validates:
//   * makeUploadMeta default shape
//   * buildSavedMapImagePayload for both source variants
//   * AsyncStorage round-trip + clear semantics
//   * defensive filter against malformed entries
//
// Run: yarn test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

const _mem = new Map<string, string>();
const MockAsyncStorage = {
  getItem: async (k: string) => (_mem.has(k) ? _mem.get(k)! : null),
  setItem: async (k: string, v: string) => {
    _mem.set(k, v);
  },
  removeItem: async (k: string) => {
    _mem.delete(k);
  },
};
const asPath = require_.resolve('@react-native-async-storage/async-storage');
(require_.cache as any)[asPath] = {
  id: asPath,
  filename: asPath,
  loaded: true,
  exports: { default: MockAsyncStorage, __esModule: true },
};

async function importModule() {
  return await import('../pendingMapImageMeta');
}

const STORAGE_KEY_PREFIX = 'rs:pendingMapImageMeta:';

// ---------- makeUploadMeta ----------

test('makeUploadMeta: shape matches contract for known dims', async () => {
  const m = await importModule();
  const meta = m.makeUploadMeta({ width: 800, height: 600 });
  assert.equal(meta.source, 'upload');
  assert.equal(meta.supportsGeoPlacement, false);
  assert.equal(meta.originalWidth, 800);
  assert.equal(meta.originalHeight, 600);
  assert.equal(meta.northLat, null);
  assert.equal(meta.southLat, null);
  assert.equal(meta.westLng, null);
  assert.equal(meta.eastLng, null);
  assert.equal(meta.zoom, null);
  assert.equal(meta.style, null);
});

test('makeUploadMeta: tolerates null dims', async () => {
  const m = await importModule();
  const meta = m.makeUploadMeta(null);
  assert.equal(meta.originalWidth, null);
  assert.equal(meta.originalHeight, null);
  assert.equal(meta.supportsGeoPlacement, false);
});

// ---------- buildSavedMapImagePayload ----------

test('buildSavedMapImagePayload: maptiler entry produces the full payload', async () => {
  const m = await importModule();
  const meta = {
    source: 'maptiler' as const,
    supportsGeoPlacement: true as const,
    originalWidth: 1024,
    originalHeight: 768,
    northLat: 45.0,
    southLat: 44.0,
    westLng: -93.5,
    eastLng: -92.5,
    centerLat: 44.5,
    centerLng: -93.0,
    zoom: 14.5,
    bearing: 10,
    pitch: 20,
    style: 'outdoors-v2',
  };
  const payload = m.buildSavedMapImagePayload('img_xyz', 'hunt_xyz', meta);
  assert.equal(payload.image_id, 'img_xyz');
  assert.equal(payload.hunt_id, 'hunt_xyz');
  assert.equal(payload.source, 'maptiler');
  assert.equal(payload.supports_geo_placement, true);
  assert.equal(payload.original_width, 1024);
  assert.equal(payload.original_height, 768);
  assert.equal(payload.north_lat, 45.0);
  assert.equal(payload.east_lng, -92.5);
  assert.equal(payload.zoom, 14.5);
  assert.equal(payload.style, 'outdoors-v2');
});

test('buildSavedMapImagePayload: upload entry zeroes out geo fields', async () => {
  const m = await importModule();
  const meta = m.makeUploadMeta({ width: 600, height: 400 });
  const payload = m.buildSavedMapImagePayload('img_u', 'hunt_u', meta);
  assert.equal(payload.source, 'upload');
  assert.equal(payload.supports_geo_placement, false);
  assert.equal(payload.original_width, 600);
  assert.equal(payload.original_height, 400);
  assert.equal(payload.north_lat, null);
  assert.equal(payload.south_lat, null);
  assert.equal(payload.west_lng, null);
  assert.equal(payload.east_lng, null);
  assert.equal(payload.style, null);
});

// ---------- save / load / clear ----------

test('saveMapImageMetaList / loadMapImageMetaList: round-trips an array with nulls', async () => {
  const m = await importModule();
  _mem.clear();
  const huntId = 'hunt_meta_rt';
  const upload = m.makeUploadMeta({ width: 100, height: 200 });
  const list = [upload, null, upload];
  await m.saveMapImageMetaList(huntId, list);
  const loaded = await m.loadMapImageMetaList(huntId);
  assert.equal(loaded.length, 3);
  assert.equal(loaded[0]?.source, 'upload');
  assert.equal(loaded[1], null);
  assert.equal(loaded[2]?.source, 'upload');
});

test('saveMapImageMetaList: empty list clears the stash', async () => {
  const m = await importModule();
  _mem.clear();
  const huntId = 'hunt_meta_clear';
  const upload = m.makeUploadMeta(null);
  await m.saveMapImageMetaList(huntId, [upload]);
  assert.equal((await m.loadMapImageMetaList(huntId)).length, 1);
  await m.saveMapImageMetaList(huntId, []);
  assert.equal((await m.loadMapImageMetaList(huntId)).length, 0);
});

test('saveMapImageMetaList: list of all-null clears the stash', async () => {
  const m = await importModule();
  _mem.clear();
  const huntId = 'hunt_meta_all_null';
  await m.saveMapImageMetaList(huntId, [null, null]);
  assert.equal((await m.loadMapImageMetaList(huntId)).length, 0);
});

test('clearMapImageMetaList: wipes the stash', async () => {
  const m = await importModule();
  _mem.clear();
  const huntId = 'hunt_meta_clear_all';
  await m.saveMapImageMetaList(huntId, [m.makeUploadMeta(null)]);
  await m.clearMapImageMetaList(huntId);
  assert.equal((await m.loadMapImageMetaList(huntId)).length, 0);
});

test('loadMapImageMetaList: defensively rejects unknown source', async () => {
  const m = await importModule();
  _mem.clear();
  const huntId = 'hunt_meta_bad';
  // Plant an entry with an invalid source directly.
  _mem.set(
    STORAGE_KEY_PREFIX + huntId,
    JSON.stringify([
      m.makeUploadMeta(null),
      { source: 'google_maps', supportsGeoPlacement: true },
      { wat: 1 },
      null,
    ]),
  );
  const loaded = await m.loadMapImageMetaList(huntId);
  // Length is preserved \u2014 every malformed entry maps to null so
  // the index alignment with mediaRefs survives.
  assert.equal(loaded.length, 4);
  assert.equal(loaded[0]?.source, 'upload');
  assert.equal(loaded[1], null);
  assert.equal(loaded[2], null);
  assert.equal(loaded[3], null);
});

test('loadMapImageMetaList: returns [] when key absent', async () => {
  const m = await importModule();
  _mem.clear();
  const out = await m.loadMapImageMetaList('hunt_meta_missing');
  assert.deepEqual(out, []);
});
