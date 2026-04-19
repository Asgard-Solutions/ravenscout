// Raven Scout — Tests for media persistence pure logic.
// Run with:  yarn test:unit
//
// This file covers the pure, side-effect-free modules:
//   - storageStrategy (resolver)
//   - huntSerialization (detection, stripping, toPersisted/fromPersisted)
//   - safePersist (budget degradation ladder)
//
// Integration-heavy code (AsyncStorage I/O, IndexedDB adapter, Expo
// FileSystem adapter) is exercised manually in the app. Those adapters
// cannot be unit-tested in Node without a full React Native harness.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveStorageStrategy } from '../storageStrategy';
import {
  isBase64DataUri,
  isLegacyHunt,
  stripBase64Images,
  toPersistedHunt,
  buildRuntimeHunt,
  fromPersistedHunt,
} from '../huntSerialization';
import { applyBudget, MAX_RECORD_BYTES } from '../safePersist';

// ------------------------------ Fixtures ------------------------------

const sampleResult = {
  id: 'hunt_test_1',
  summary: 'tactical analysis',
  overlays: [
    { id: 'ov_1', type: 'stand', label: 'A', x_percent: 50, y_percent: 50 },
  ],
};

const tinyPng = `data:image/png;base64,${Buffer.from('x'.repeat(200)).toString('base64')}`;

function mkRuntime(opts: any = {}) {
  return buildRuntimeHunt({
    id: opts.id || 'h1',
    species: 'deer',
    speciesName: 'Deer',
    date: '2025-01-01',
    timeWindow: 'dawn',
    windDirection: 'N',
    result: opts.result || sampleResult,
    weatherData: opts.weatherData,
    mediaAssets: opts.mediaAssets || [],
    primaryMediaIndex: 0,
    createdAt: '2025-01-01T00:00:00Z',
    storageStrategy: opts.storageStrategy || 'local-uri',
  });
}

// ============================== storageStrategy ==============================

test('storageStrategy — Pro on web → cloud-uri / cloud', () => {
  const r = resolveStorageStrategy({ tier: 'pro', platform: 'web' });
  assert.equal(r.strategy, 'cloud-uri');
  assert.equal(r.preferredBackend, 'cloud');
});

test('storageStrategy — Pro on iOS → cloud-uri / cloud', () => {
  const r = resolveStorageStrategy({ tier: 'pro', platform: 'ios' });
  assert.equal(r.strategy, 'cloud-uri');
  assert.equal(r.preferredBackend, 'cloud');
});

test('storageStrategy — Core on web → local-uri / indexeddb', () => {
  const r = resolveStorageStrategy({ tier: 'core', platform: 'web' });
  assert.equal(r.strategy, 'local-uri');
  assert.equal(r.preferredBackend, 'indexeddb');
});

test('storageStrategy — Trial on ios → local-uri / filesystem', () => {
  const r = resolveStorageStrategy({ tier: 'trial', platform: 'ios' });
  assert.equal(r.strategy, 'local-uri');
  assert.equal(r.preferredBackend, 'filesystem');
});

test('storageStrategy — missing tier defaults to trial behavior (local-uri)', () => {
  const r = resolveStorageStrategy({ tier: null as any, platform: 'web' });
  assert.equal(r.strategy, 'local-uri');
});

test('storageStrategy — case-insensitive tier', () => {
  const r = resolveStorageStrategy({ tier: 'PRO', platform: 'web' });
  assert.equal(r.strategy, 'cloud-uri');
});

// ============================== huntSerialization ==============================

test('isBase64DataUri detects data URIs', () => {
  assert.equal(isBase64DataUri('data:image/png;base64,AAAA'), true);
  assert.equal(isBase64DataUri('DATA:IMAGE/JPEG;base64,AAAA'), true);
  assert.equal(isBase64DataUri('file:///tmp/a.jpg'), false);
  assert.equal(isBase64DataUri('idb://assets/abc'), false);
  assert.equal(isBase64DataUri(null), false);
  assert.equal(isBase64DataUri(undefined), false);
  assert.equal(isBase64DataUri(123), false);
});

test('stripBase64Images removes inline data URIs at any depth', () => {
  const rec = {
    id: 'h1',
    mapImage: 'data:image/jpeg;base64,AAAA',
    mapImages: [
      'data:image/jpeg;base64,AAAA',
      'file:///ok.jpg',
      'data:image/png;base64,BBBB',
      'https://cdn.example.com/ok.jpg',
    ],
    nested: {
      pic: 'data:image/png;base64,ZZZZ',
      label: 'safe',
      deeper: {
        p: 'data:image/webp;base64,YYYY',
      },
    },
  } as any;
  stripBase64Images(rec);
  assert.equal(rec.mapImage, undefined, 'top-level base64 removed');
  assert.deepEqual(rec.mapImages, ['file:///ok.jpg', 'https://cdn.example.com/ok.jpg']);
  assert.equal(rec.nested.pic, undefined, 'nested base64 removed');
  assert.equal(rec.nested.label, 'safe', 'non-base64 preserved');
  assert.equal(rec.nested.deeper.p, undefined, 'deeply nested base64 removed');
});

test('stripBase64Images: idempotent on a clean record', () => {
  const rec = { id: 'h', x: [1, 2, 3], y: 'file:///a.jpg' };
  const before = JSON.stringify(rec);
  stripBase64Images(rec);
  assert.equal(JSON.stringify(rec), before);
});

test('isLegacyHunt identifies pre-v2 records', () => {
  assert.equal(
    isLegacyHunt({ id: '1', mapImages: ['data:image/jpeg;base64,AA'] }),
    true,
    'array of base64',
  );
  assert.equal(
    isLegacyHunt({ id: '2', mapImage: 'data:image/jpeg;base64,AA' }),
    true,
    'scalar base64',
  );
  assert.equal(
    isLegacyHunt({
      id: '3',
      schema: 'hunt.persisted.v2',
      mediaAssets: [{ assetId: 'a', storageType: 'cloud', uri: '', mime: 'image/jpeg', createdAt: '' }],
    }),
    false,
    'v2 marker or mediaAssets disqualifies',
  );
  assert.equal(isLegacyHunt(null), false);
  assert.equal(isLegacyHunt(undefined), false);
  assert.equal(isLegacyHunt('string'), false);
});

test('toPersistedHunt strips any lingering base64 before persistence', () => {
  const runtime = mkRuntime({
    // Pretend something leaked base64 into the analysis result.
    result: {
      id: 'r1',
      summary: 'x',
      sneakyImage: tinyPng,
      overlays: [
        { id: 'ov', type: 'stand', x_percent: 50, y_percent: 50, evidence_img: tinyPng },
      ],
    },
  });
  const persisted = toPersistedHunt(runtime);
  const json = JSON.stringify(persisted);
  assert.ok(!/data:image\/[a-z]+;base64,/i.test(json), 'persisted JSON must not contain base64');
  assert.equal(persisted.schema, 'hunt.persisted.v2');
});

test('toPersistedHunt drops runtime-only display URIs', () => {
  const runtime = mkRuntime({
    mediaAssets: [{
      assetId: 'a1', storageType: 'indexeddb', uri: 'idb://assets/a1',
      mime: 'image/jpeg', createdAt: 'now',
    }],
  });
  (runtime as any).mediaDisplayUris = ['blob://localhost/ephemeral'];
  const persisted = toPersistedHunt(runtime);
  assert.equal((persisted as any).mediaDisplayUris, undefined);
  assert.equal(persisted.mediaAssets[0].uri, 'idb://assets/a1');
});

test('fromPersistedHunt restores runtime shape with blank display URIs', () => {
  const runtime = mkRuntime({
    mediaAssets: [
      { assetId: 'a1', storageType: 'indexeddb', uri: 'idb://a/a1', mime: 'image/jpeg', createdAt: 'n' },
      { assetId: 'a2', storageType: 'indexeddb', uri: 'idb://a/a2', mime: 'image/jpeg', createdAt: 'n' },
    ],
  });
  const persisted = toPersistedHunt(runtime);
  const revived = fromPersistedHunt(persisted);
  assert.equal(revived.mediaAssets.length, 2);
  assert.equal(revived.mediaDisplayUris?.length, 2);
  assert.equal(revived.mediaDisplayUris?.[0], null);
});

// ============================== safePersist ==============================

test('applyBudget: no-op when under budget', () => {
  const runtime = mkRuntime();
  const persisted = toPersistedHunt(runtime);
  const r = applyBudget(persisted, MAX_RECORD_BYTES);
  assert.deepEqual(r.degradations, ['noop']);
  assert.equal(r.overBudget, false);
});

test('applyBudget: drops thumbnails first', () => {
  const runtime = mkRuntime({
    mediaAssets: [
      { assetId: 'a', storageType: 'indexeddb', uri: 'idb://a/a', mime: 'image/jpeg',
        createdAt: 'n', thumbnail: 'A'.repeat(200_000) },  // non-base64 blob
    ],
  });
  const persisted = toPersistedHunt(runtime);
  const r = applyBudget(persisted, 100_000);
  assert.ok(r.degradations.includes('drop-thumbnails'));
  assert.equal(r.record.mediaAssets[0].thumbnail, undefined);
});

test('applyBudget: drops weather next', () => {
  const giantWeather = Array.from({ length: 400 }, (_, i) => ({ i, text: 'x'.repeat(5_000) }));
  const runtime = mkRuntime({ weatherData: giantWeather });
  const persisted = toPersistedHunt(runtime);
  const r = applyBudget(persisted, 100_000);
  assert.ok(r.degradations.includes('drop-weather'));
  assert.equal((r.record as any).weatherData, undefined);
});

test('applyBudget: falls back to metadata-only for impossibly large records', () => {
  const giantResult = {
    id: 'r', summary: 'x',
    overlays: Array.from({ length: 200 }, (_, i) => ({
      id: `ov_${i}`, type: 'stand', x_percent: 50, y_percent: 50,
      reasoning: 'x'.repeat(20_000),
    })),
  };
  const runtime = mkRuntime({ result: giantResult });
  const persisted = toPersistedHunt(runtime);
  const r = applyBudget(persisted, 50_000);
  assert.ok(r.degradations.includes('metadata-only'));
  assert.equal(r.record.mediaAssets.length, 0);
});

test('applyBudget: stamps metadata-only strategy on fallback', () => {
  const huge = { id: 'r', summary: 'x', overlays: [], blob: 'x'.repeat(1_000_000) };
  const runtime = mkRuntime({ result: huge });
  const persisted = toPersistedHunt(runtime);
  const r = applyBudget(persisted, 100_000);
  if (r.degradations.includes('metadata-only')) {
    assert.equal(r.record.storageStrategy, 'metadata-only');
  }
});

// ============================== integration invariant ==============================

test('invariant: toPersistedHunt + applyBudget never emits base64 for any tier', () => {
  for (const tier of ['trial', 'core', 'pro']) {
    const strategy = resolveStorageStrategy({ tier, platform: 'web' });
    const runtime = mkRuntime({
      storageStrategy: strategy.strategy,
      result: { ...sampleResult, evidence: tinyPng },
    });
    const persisted = toPersistedHunt(runtime);
    const budgeted = applyBudget(persisted);
    assert.ok(
      !/data:image\/[a-z]+;base64,/i.test(budgeted.serialized),
      `tier=${tier}: persisted output must never contain base64`,
    );
  }
});
