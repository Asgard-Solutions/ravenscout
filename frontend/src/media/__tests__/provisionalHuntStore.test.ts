// Raven Scout — provisionalHuntStore (mobile-Chrome session fallback).
//
// Guards the contract: the provisional hot-cache must survive a
// simulated runtime restart (new module init after route transition
// on mobile Chrome) and be readable by the same huntId, so
// /results can hydrate from it when the in-memory singleton has
// been wiped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

// In-memory AsyncStorage polyfill. Install in the require cache
// BEFORE the store is imported so the store picks up our mock.
const _mem = new Map<string, string>();
const MockAsyncStorage = {
  getItem: async (k: string) => (_mem.has(k) ? _mem.get(k)! : null),
  setItem: async (k: string, v: string) => { _mem.set(k, v); },
  removeItem: async (k: string) => { _mem.delete(k); },
  clear: async () => { _mem.clear(); },
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

function sampleAnalysis(huntId = 'hunt-1') {
  return {
    schema: 'hunt.analysis.v1',
    id: huntId,
    metadata: {
      species: 'deer', speciesName: 'Deer',
      date: '2026-02-12', timeWindow: 'dawn',
      windDirection: 'N', huntStyle: 'archery',
    },
    mediaRefs: [`provisional-${huntId}-0`],
    primaryMediaRef: `provisional-${huntId}-0`,
    storageStrategy: 'cloud',
    analysisContext: { imageId: `provisional-${huntId}-0`, gps: null },
    analysis: { id: huntId, overlays: [], setups: [], observations: [] },
  } as any;
}

function freshStore() { _mem.clear(); }

// ================= write → read round-trip =================

test('provisional: write then read returns the same entry', async () => {
  const store: any = await import('../provisionalHuntStore');
  freshStore();
  const uris = { 'provisional-hunt-rt-0': 'data:image/png;base64,AA==' };
  const w = await store.writeProvisionalHunt('hunt-rt', sampleAnalysis('hunt-rt'), uris);
  assert.equal(w.ok, true);
  assert.ok(w.bytes > 0);

  const r = await store.readProvisionalHunt('hunt-rt');
  assert.ok(r);
  assert.equal(r.huntId, 'hunt-rt');
  assert.deepEqual(r.displayUris, uris);
  assert.equal(r.analysis.id, 'hunt-rt');
});

test('provisional: survives "runtime restart" (re-read from fresh module import)', async () => {
  const store1: any = await import('../provisionalHuntStore');
  freshStore();
  await store1.writeProvisionalHunt('hunt-restart', sampleAnalysis('hunt-restart'), {
    'provisional-hunt-restart-0': 'data:image/png;base64,AA==',
  });

  // Drop the loaded-module cache entry so the next import re-runs
  // the module init (simulating mobile Chrome's route-transition
  // JS-runtime wipe). The AsyncStorage polyfill persists across
  // this because it's in a closure, exactly like browser localStorage.
  const storeKey = require_.resolve('../provisionalHuntStore');
  delete (require_.cache as any)[storeKey];

  const store2: any = await import('../provisionalHuntStore?v=b' as any)
    .catch(() => import('../provisionalHuntStore'));
  const r = await store2.readProvisionalHunt('hunt-restart');
  assert.ok(r, 'provisional entry must persist across module re-import');
  assert.equal(r.huntId, 'hunt-restart');
});

// ================= huntId isolation =================

test('provisional: reading wrong huntId returns null (single-entry by design)', async () => {
  const store: any = await import('../provisionalHuntStore');
  freshStore();
  await store.writeProvisionalHunt('hunt-A', sampleAnalysis('hunt-A'), {});
  const r = await store.readProvisionalHunt('hunt-B');
  assert.equal(r, null);
});

test('provisional: writing hunt-B overwrites hunt-A (latest-wins, 1-entry)', async () => {
  const store: any = await import('../provisionalHuntStore');
  freshStore();
  await store.writeProvisionalHunt('hunt-A', sampleAnalysis('hunt-A'), {});
  await store.writeProvisionalHunt('hunt-B', sampleAnalysis('hunt-B'), {});
  assert.equal((await store.readProvisionalHunt('hunt-A')), null);
  assert.ok(await store.readProvisionalHunt('hunt-B'));
});

// ================= clearProvisionalHunt =================

test('provisional: clear by matching huntId removes only that entry', async () => {
  const store: any = await import('../provisionalHuntStore');
  freshStore();
  await store.writeProvisionalHunt('hunt-clear', sampleAnalysis('hunt-clear'), {});
  await store.clearProvisionalHunt('hunt-clear');
  assert.equal(await store.readProvisionalHunt('hunt-clear'), null);
});

test('provisional: clear with non-matching huntId does NOT remove current entry', async () => {
  const store: any = await import('../provisionalHuntStore');
  freshStore();
  await store.writeProvisionalHunt('hunt-keep', sampleAnalysis('hunt-keep'), {});
  await store.clearProvisionalHunt('some-other-id');
  assert.ok(await store.readProvisionalHunt('hunt-keep'));
});

test('provisional: clear with no arg removes any entry', async () => {
  const store: any = await import('../provisionalHuntStore');
  freshStore();
  await store.writeProvisionalHunt('hunt-any', sampleAnalysis('hunt-any'), {});
  await store.clearProvisionalHunt();
  assert.equal(await store.readProvisionalHunt('hunt-any'), null);
});

// ================= runtime adapter =================

test('provisional: provisionalToRuntime merges analysis + displayUris', async () => {
  const store: any = await import('../provisionalHuntStore');
  freshStore();
  const uris = { 'provisional-hunt-rt2-0': 'data:image/png;base64,ZZ==' };
  await store.writeProvisionalHunt('hunt-rt2', sampleAnalysis('hunt-rt2'), uris);
  const entry = await store.readProvisionalHunt('hunt-rt2');
  const runtime = store.provisionalToRuntime(entry);
  assert.equal(runtime.id, 'hunt-rt2');
  assert.deepEqual(runtime.displayUris, uris);
});

// ================= malformed data tolerance =================

test('provisional: malformed stored JSON returns null (never throws)', async () => {
  const store: any = await import('../provisionalHuntStore');
  freshStore();
  _mem.set(store.PROVISIONAL_HUNT_KEY, '{not valid json');
  const r = await store.readProvisionalHunt('any');
  assert.equal(r, null);
});

test('provisional: stored entry with wrong schema returns null', async () => {
  const store: any = await import('../provisionalHuntStore');
  freshStore();
  _mem.set(
    store.PROVISIONAL_HUNT_KEY,
    JSON.stringify({ schema: 'some.other.v7', huntId: 'x' }),
  );
  const r = await store.readProvisionalHunt('x');
  assert.equal(r, null);
});

// ================= size diagnostics =================

test('provisional: reports approximate byte size (large payload surfaces in log)', async () => {
  const store: any = await import('../provisionalHuntStore');
  freshStore();
  const big = 'A'.repeat(100000); // 100KB base64 blob
  const w = await store.writeProvisionalHunt(
    'hunt-big',
    sampleAnalysis('hunt-big'),
    { 'provisional-hunt-big-0': big },
  );
  assert.equal(w.ok, true);
  assert.ok(w.bytes >= 100000, `bytes should include payload, got ${w.bytes}`);
});
