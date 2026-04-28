// Raven Scout — HuntLocationsSection / pendingHuntAssets unit tests.
//
// Pure-function tests \u2014 no React rendering. Validates the validator
// and the AsyncStorage stash helpers that back the New Hunt
// "Known Hunt Locations" feature (Task 4).
//
// Run: yarn test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

// In-memory AsyncStorage polyfill. Same pattern as
// src/media/__tests__/provisionalHuntStore.test.ts: install in the
// require cache BEFORE the consumer module is imported so the
// consumer picks up our mock.
const _mem = new Map<string, string>();
const MockAsyncStorage = {
  getItem: async (k: string) => (_mem.has(k) ? _mem.get(k)! : null),
  setItem: async (k: string, v: string) => {
    _mem.set(k, v);
  },
  removeItem: async (k: string) => {
    _mem.delete(k);
  },
  clear: async () => {
    _mem.clear();
  },
};
const asyncStoragePath = require_.resolve(
  '@react-native-async-storage/async-storage',
);
(require_.cache as any)[asyncStoragePath] = {
  id: asyncStoragePath,
  filename: asyncStoragePath,
  loaded: true,
  exports: { default: MockAsyncStorage, __esModule: true },
};

import { validateAssetForm } from '../../lib/huntAssetValidation';

// Dynamic import inside an async test keeps esbuild's CJS transform
// happy (top-level await isn't supported in that mode).
async function importPendingAssets() {
  return await import('../../media/pendingHuntAssets');
}

// =====================================================================
// validateAssetForm
// =====================================================================

const VALID_FORM = {
  type: 'stand' as const,
  name: 'North Ridge Stand',
  latitude: '32.123456',
  longitude: '-97.123456',
  notes: 'Good for north wind',
};

test('validateAssetForm: valid payload \u2192 no errors', () => {
  assert.deepEqual(validateAssetForm(VALID_FORM), {});
});

test('validateAssetForm: missing name', () => {
  assert.ok(validateAssetForm({ ...VALID_FORM, name: '' }).name);
});

test('validateAssetForm: blank name (whitespace only)', () => {
  assert.ok(validateAssetForm({ ...VALID_FORM, name: '   ' }).name);
});

test('validateAssetForm: name over 120 chars', () => {
  const long = 'x'.repeat(121);
  assert.ok(validateAssetForm({ ...VALID_FORM, name: long }).name);
});

test('validateAssetForm: missing latitude', () => {
  assert.ok(validateAssetForm({ ...VALID_FORM, latitude: '' }).latitude);
});

test('validateAssetForm: missing longitude', () => {
  assert.ok(validateAssetForm({ ...VALID_FORM, longitude: '' }).longitude);
});

test('validateAssetForm: non-numeric latitude', () => {
  assert.ok(validateAssetForm({ ...VALID_FORM, latitude: 'abc' }).latitude);
});

test('validateAssetForm: out-of-range latitude (95 / -91)', () => {
  assert.ok(validateAssetForm({ ...VALID_FORM, latitude: '95' }).latitude);
  assert.ok(validateAssetForm({ ...VALID_FORM, latitude: '-91' }).latitude);
});

test('validateAssetForm: out-of-range longitude (181 / -181)', () => {
  assert.ok(validateAssetForm({ ...VALID_FORM, longitude: '181' }).longitude);
  assert.ok(validateAssetForm({ ...VALID_FORM, longitude: '-181' }).longitude);
});

test('validateAssetForm: invalid type', () => {
  assert.ok(
    validateAssetForm({ ...VALID_FORM, type: 'rocketship' as any }).type,
  );
});

test('validateAssetForm: notes are optional, not validated for length', () => {
  assert.deepEqual(validateAssetForm({ ...VALID_FORM, notes: '' }), {});
});

test('validateAssetForm: latitude / longitude at the exact bounds', () => {
  for (const lat of ['90', '-90', '0']) {
    assert.equal(
      validateAssetForm({ ...VALID_FORM, latitude: lat }).latitude,
      undefined,
      `lat=${lat} should be valid`,
    );
  }
  for (const lng of ['180', '-180', '0']) {
    assert.equal(
      validateAssetForm({ ...VALID_FORM, longitude: lng }).longitude,
      undefined,
      `lng=${lng} should be valid`,
    );
  }
});

// =====================================================================
// makePendingAsset
// =====================================================================

test('makePendingAsset: mints a unique localId and preserves payload', async () => {
  const { makePendingAsset } = await importPendingAssets();
  const a = makePendingAsset({
    type: 'stand',
    name: 'X',
    latitude: 30,
    longitude: -97,
  });
  assert.match(a.localId, /^pa_/);
  assert.equal(a.type, 'stand');
  assert.equal(a.latitude, 30);
  assert.equal(a.longitude, -97);

  const b = makePendingAsset({
    type: 'stand',
    name: 'Y',
    latitude: 30,
    longitude: -97,
  });
  assert.notEqual(a.localId, b.localId);
});

// =====================================================================
// AsyncStorage stash helpers
// =====================================================================

test('savePendingAssets / loadPendingAssets: round-trips a list', async () => {
  const m = await importPendingAssets();
  _mem.clear();
  const huntId = 'hunt_round_trip_1';
  const a = m.makePendingAsset({ type: 'stand', name: 'A', latitude: 30, longitude: -97 });
  const b = m.makePendingAsset({ type: 'feeder', name: 'B', latitude: 31, longitude: -98 });
  await m.savePendingAssets(huntId, [a, b]);
  const loaded = await m.loadPendingAssets(huntId);
  assert.equal(loaded.length, 2);
  assert.deepEqual(
    loaded.map((x) => x.localId).sort(),
    [a.localId, b.localId].sort(),
  );
});

test('savePendingAssets: empty list clears the stash', async () => {
  const m = await importPendingAssets();
  _mem.clear();
  const huntId = 'hunt_clear_via_save_empty';
  const a = m.makePendingAsset({ type: 'stand', name: 'A', latitude: 30, longitude: -97 });
  await m.savePendingAssets(huntId, [a]);
  assert.equal((await m.loadPendingAssets(huntId)).length, 1);
  await m.savePendingAssets(huntId, []);
  assert.equal((await m.loadPendingAssets(huntId)).length, 0);
});

test('removePendingAssets: drops only the requested localIds', async () => {
  const m = await importPendingAssets();
  _mem.clear();
  const huntId = 'hunt_remove_subset';
  const a = m.makePendingAsset({ type: 'stand', name: 'A', latitude: 30, longitude: -97 });
  const b = m.makePendingAsset({ type: 'feeder', name: 'B', latitude: 31, longitude: -98 });
  const c = m.makePendingAsset({ type: 'camera', name: 'C', latitude: 32, longitude: -99 });
  await m.savePendingAssets(huntId, [a, b, c]);

  await m.removePendingAssets(huntId, [a.localId, c.localId]);
  const remaining = await m.loadPendingAssets(huntId);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].localId, b.localId);
});

test('clearPendingAssets: wipes the entire stash for a hunt', async () => {
  const m = await importPendingAssets();
  _mem.clear();
  const huntId = 'hunt_clear_all';
  const a = m.makePendingAsset({ type: 'stand', name: 'A', latitude: 30, longitude: -97 });
  await m.savePendingAssets(huntId, [a]);
  await m.clearPendingAssets(huntId);
  assert.equal((await m.loadPendingAssets(huntId)).length, 0);
});

test('loadPendingAssets: filters out malformed entries', async () => {
  const m = await importPendingAssets();
  _mem.clear();
  const huntId = 'hunt_malformed';
  const valid = m.makePendingAsset({
    type: 'stand',
    name: 'A',
    latitude: 30,
    longitude: -97,
  });
  const malformed = [
    valid,
    { localId: 'bad1', type: 'stand', name: 'X' }, // missing lat/lng
    { localId: 'bad2', type: 'stand', latitude: 0, longitude: 0 }, // missing name
    null,
    'string',
  ];
  // Bypass savePendingAssets so we can plant malformed entries directly.
  _mem.set('rs:pendingHuntAssets:' + huntId, JSON.stringify(malformed));
  const loaded = await m.loadPendingAssets(huntId);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].localId, valid.localId);
});

test('loadPendingAssets: returns [] when stash key is absent', async () => {
  const m = await importPendingAssets();
  _mem.clear();
  const out = await m.loadPendingAssets('hunt_never_stashed');
  assert.deepEqual(out, []);
});
