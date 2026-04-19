// Raven Scout — Tests for v3 split persistence pure logic (mobile).
// Run with:  yarn test:unit
//
// SUPPORTED RUNTIME: native mobile (iOS / Android). There are no web
// paths in the production storage layer; these tests verify tier →
// strategy resolution + reference-only persisted shapes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveStorageStrategy } from '../storageStrategy';
import {
  isBase64DataUri,
  isLegacyV1Hunt,
  isLegacyV2Hunt,
  stripBase64Images,
  extractMetadata,
  buildPersistedAnalysis,
} from '../huntSerialization';

// ------------------------------ Fixtures ------------------------------

const sampleResult = {
  id: 'hunt_test_1',
  summary: 'tactical analysis',
  overlays: [
    { id: 'ov_1', type: 'stand', label: 'A', x_percent: 50, y_percent: 50 },
  ],
};

const tinyPng = `data:image/png;base64,${Buffer.from('x'.repeat(200)).toString('base64')}`;

function mkMetadata() {
  return extractMetadata({
    species: 'deer',
    speciesName: 'Deer',
    date: '2025-01-01',
    timeWindow: 'dawn',
    windDirection: 'N',
  });
}

// ============================== storageStrategy ==============================

test('storageStrategy — Pro → cloud-uri / cloud (stubbed)', () => {
  const r = resolveStorageStrategy({ tier: 'pro' });
  assert.equal(r.strategy, 'cloud-uri');
  assert.equal(r.preferredBackend, 'cloud');
});

test('storageStrategy — Core → local-uri / filesystem', () => {
  const r = resolveStorageStrategy({ tier: 'core' });
  assert.equal(r.strategy, 'local-uri');
  assert.equal(r.preferredBackend, 'filesystem');
});

test('storageStrategy — Trial → local-uri / filesystem', () => {
  const r = resolveStorageStrategy({ tier: 'trial' });
  assert.equal(r.strategy, 'local-uri');
  assert.equal(r.preferredBackend, 'filesystem');
});

test('storageStrategy — case-insensitive tier', () => {
  assert.equal(resolveStorageStrategy({ tier: 'PRO' }).strategy, 'cloud-uri');
});

test('storageStrategy — missing tier defaults to trial behavior', () => {
  const r = resolveStorageStrategy({ tier: null as any });
  assert.equal(r.strategy, 'local-uri');
  assert.equal(r.preferredBackend, 'filesystem');
});

test('storageStrategy — platform argument is accepted but ignored', () => {
  // Even with platform='web' (not a production runtime), the resolver
  // still returns the same tier-based mapping. This confirms tier is
  // the only dimension.
  const a = resolveStorageStrategy({ tier: 'pro', platform: 'web' });
  const b = resolveStorageStrategy({ tier: 'pro', platform: 'ios' });
  assert.equal(a.strategy, b.strategy);
  assert.equal(a.preferredBackend, b.preferredBackend);
});

test('storageStrategy — no backend ever resolves to indexeddb', () => {
  for (const tier of ['trial', 'core', 'pro']) {
    const r = resolveStorageStrategy({ tier });
    assert.notEqual(r.preferredBackend, 'indexeddb' as any,
      `tier=${tier}: indexeddb backend is quarantined`);
  }
});

// ============================== detection / stripping ==============================

test('isBase64DataUri detects data URIs', () => {
  assert.equal(isBase64DataUri('data:image/png;base64,AAAA'), true);
  assert.equal(isBase64DataUri('file:///tmp/a.jpg'), false);
  assert.equal(isBase64DataUri('null'), false);
  assert.equal(isBase64DataUri(null), false);
  assert.equal(isBase64DataUri(undefined), false);
});

test('stripBase64Images removes inline data URIs at any depth', () => {
  const rec = {
    id: 'h1',
    mapImage: 'data:image/jpeg;base64,AAAA',
    mapImages: [
      'data:image/jpeg;base64,AAAA',
      'file:///ok.jpg',
      'https://cdn.example.com/ok.jpg',
    ],
    nested: { pic: 'data:image/png;base64,ZZZZ', label: 'safe', deep: { p: tinyPng } },
  } as any;
  stripBase64Images(rec);
  assert.equal(rec.mapImage, undefined);
  assert.deepEqual(rec.mapImages, ['file:///ok.jpg', 'https://cdn.example.com/ok.jpg']);
  assert.equal(rec.nested.pic, undefined);
  assert.equal(rec.nested.label, 'safe');
  assert.equal(rec.nested.deep.p, undefined);
});

test('stripBase64Images: idempotent on a clean record', () => {
  const rec = { id: 'h', x: [1, 2, 3], y: 'file:///a.jpg' };
  const before = JSON.stringify(rec);
  stripBase64Images(rec);
  assert.equal(JSON.stringify(rec), before);
});

// ============================== legacy detection ==============================

test('isLegacyV1Hunt detects pre-v2 records', () => {
  assert.equal(
    isLegacyV1Hunt({ id: '1', mapImages: ['data:image/jpeg;base64,AA'] }),
    true,
  );
  assert.equal(
    isLegacyV1Hunt({ id: '2', mapImage: 'data:image/jpeg;base64,AA' }),
    true,
  );
  assert.equal(isLegacyV1Hunt({ id: '3', schema: 'hunt.analysis.v1', mediaRefs: [] }), false);
  assert.equal(isLegacyV1Hunt({ id: '4', schema: 'hunt.persisted.v2', mediaAssets: [] }), false);
  assert.equal(isLegacyV1Hunt(null), false);
});

test('isLegacyV2Hunt detects v2 combined records', () => {
  assert.equal(
    isLegacyV2Hunt({
      id: '1',
      schema: 'hunt.persisted.v2',
      mediaAssets: [{ imageId: 'x', storageType: 'local-file', uri: 'file:///x', mime: 'image/jpeg', createdAt: '' }],
    }),
    true,
  );
  assert.equal(isLegacyV2Hunt({ id: '1', schema: 'hunt.persisted.v2' }), false);
  assert.equal(isLegacyV2Hunt({ id: '1', schema: 'hunt.analysis.v1' }), false);
});

// ============================== buildPersistedAnalysis ==============================

test('buildPersistedAnalysis: produces v3 schema with no base64', () => {
  const analysis = buildPersistedAnalysis({
    id: 'h1',
    metadata: mkMetadata(),
    analysis: { ...sampleResult, evidence_img: tinyPng },
    mediaRefs: ['img_1', 'img_2'],
    primaryMediaRef: 'img_1',
    storageStrategy: 'local-uri',
  });
  assert.equal(analysis.schema, 'hunt.analysis.v1');
  assert.equal(analysis.mediaRefs.length, 2);
  assert.equal(analysis.primaryMediaRef, 'img_1');
  assert.ok(!/data:image\/[a-z]+;base64,/i.test(JSON.stringify(analysis)),
    'persisted analysis must not contain base64');
});

test('buildPersistedAnalysis: generates a createdAt when not provided', () => {
  const analysis = buildPersistedAnalysis({
    id: 'h2',
    metadata: mkMetadata(),
    analysis: {},
    mediaRefs: [],
    primaryMediaRef: null,
    storageStrategy: 'cloud-uri',
  });
  assert.ok(analysis.createdAt);
  assert.ok(new Date(analysis.createdAt).getTime() > 0);
});

test('buildPersistedAnalysis: stores NO MediaAsset inline', () => {
  const analysis = buildPersistedAnalysis({
    id: 'h3',
    metadata: mkMetadata(),
    analysis: { foo: 'bar' },
    mediaRefs: ['img_a'],
    primaryMediaRef: 'img_a',
    storageStrategy: 'local-uri',
  });
  const json = JSON.stringify(analysis);
  assert.ok(!/\"storageType\":/.test(json), 'analysis record must not embed MediaAsset shapes');
  assert.ok(!/\"uri\":/.test(json));
  assert.ok(!/\"storageKey\":/.test(json));
});

// ============================== metadata extraction ==============================

test('extractMetadata: keeps only metadata fields', () => {
  const metadata = extractMetadata({
    species: 'deer', speciesName: 'Deer',
    date: '2025-01-01', timeWindow: 'dawn', windDirection: 'N',
    temperature: '45F', propertyType: 'ag', region: 'midwest',
    locationCoords: { lat: 40, lon: -90 },
    weatherData: { temp: 45 },
  });
  assert.equal(metadata.species, 'deer');
  assert.equal(metadata.temperature, '45F');
  assert.deepEqual(metadata.locationCoords, { lat: 40, lon: -90 });
  assert.deepEqual(metadata.weatherData, { temp: 45 });
});

test('extractMetadata: defaults null for missing optional fields', () => {
  const metadata = extractMetadata({
    species: 'deer', speciesName: 'Deer',
    date: '2025-01-01', timeWindow: 'dawn', windDirection: 'N',
  });
  assert.equal(metadata.temperature, null);
  assert.equal(metadata.locationCoords, null);
});

// ============================== invariant: separation ==============================

test('invariant: buildPersistedAnalysis for every tier yields reference-only record', () => {
  for (const tier of ['trial', 'core', 'pro']) {
    const strategy = resolveStorageStrategy({ tier });
    const analysis = buildPersistedAnalysis({
      id: `h_${tier}`,
      metadata: mkMetadata(),
      analysis: { ...sampleResult, leak: tinyPng },
      mediaRefs: ['img_1'],
      primaryMediaRef: 'img_1',
      storageStrategy: strategy.strategy,
    });
    const json = JSON.stringify(analysis);
    assert.ok(!/data:image\/[a-z]+;base64,/i.test(json),
      `tier=${tier}: persisted analysis must not contain base64`);
    assert.deepEqual(analysis.mediaRefs, ['img_1']);
  }
});
