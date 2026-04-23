// Raven Scout — Tests for AnalysisContext persistence precedence + staleness.
// Run with:  yarn test:unit

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveAnalysisBasis,
  isAnalysisContextStale,
  wouldInvalidateContext,
  buildInitialAnalysisContext,
} from '../analysisContext';
import { buildPersistedAnalysis } from '../../media/huntSerialization';
import type {
  AnalysisContext,
  HydratedHuntResult,
  HuntMetadata,
} from '../../media/types';

// ---- fixtures ----
function mkMetadata(partial: Partial<HuntMetadata> = {}): HuntMetadata {
  return {
    species: 'deer',
    speciesName: 'Deer',
    date: '2026-02-10',
    timeWindow: 'dawn',
    windDirection: 'NW',
    temperature: null,
    locationCoords: null,
    ...partial,
  };
}

function mkMedia(id: string, uri = `file:///${id}.jpg`) {
  return {
    asset: { imageId: id, role: 'primary' as const, storageType: 'local-file' as const, uri, mime: 'image/jpeg', createdAt: '2026-02-10T00:00:00Z', width: 1600, height: 1200 },
    displayUri: uri,
    resolved: true,
  };
}

const ctxB: AnalysisContext = {
  schema: 'analysis-context.v1',
  imageId: 'img_B',
  gps: { lat: 39.5, lon: -98.1 },
  imageNaturalWidth: 1600,
  imageNaturalHeight: 1200,
  overlayCalibration: { scale: 1, offsetX: 0, offsetY: 0 },
  overlayStatus: 'valid',
  lockedAt: '2026-02-10T00:00:00Z',
};

function mkHunt(partial: Partial<HydratedHuntResult> = {}): HydratedHuntResult {
  return {
    id: 'hunt_1',
    createdAt: '2026-02-10T00:00:00Z',
    metadata: mkMetadata({ locationCoords: { lat: 40.0, lon: -95.0 } }),
    analysis: {},
    media: [mkMedia('img_A'), mkMedia('img_B')],
    primaryMedia: mkMedia('img_A'),
    primaryDisplayUri: 'file:///img_A.jpg',
    displayUris: ['file:///img_A.jpg', 'file:///img_B.jpg'],
    missingMediaCount: 0,
    fromSessionCache: false,
    warning: null,
    analysisContext: ctxB,
    ...partial,
  };
}

// ============================== resolveAnalysisBasis ==============================

test('resolveAnalysisBasis — analysisContext always overrides hunt-level locationCoords', () => {
  const hunt = mkHunt();
  const basis = resolveAnalysisBasis(hunt);
  assert.equal(basis.source, 'analysis-context');
  assert.equal(basis.imageId, 'img_B');                // NOT primary img_A
  assert.deepEqual(basis.gps, { lat: 39.5, lon: -98.1 }); // NOT hunt default
  assert.equal(basis.imageUri, 'file:///img_B.jpg');
});

test('resolveAnalysisBasis — analysisContext.gps=null overrides hunt.locationCoords (no fallback)', () => {
  const hunt = mkHunt({ analysisContext: { ...ctxB, gps: null } });
  const basis = resolveAnalysisBasis(hunt);
  assert.equal(basis.gps, null, 'explicit null analysis GPS must not fall back to hunt default');
});

test('resolveAnalysisBasis — missing analysisContext falls back to primaryMedia + hunt GPS', () => {
  const hunt = mkHunt({ analysisContext: null });
  const basis = resolveAnalysisBasis(hunt);
  assert.equal(basis.source, 'primary-media-fallback');
  assert.equal(basis.imageId, 'img_A');
  assert.deepEqual(basis.gps, { lat: 40.0, lon: -95.0 });
});

test('resolveAnalysisBasis — context pointing at missing media is STALE', () => {
  const hunt = mkHunt({ media: [mkMedia('img_A')] });   // img_B gone
  const basis = resolveAnalysisBasis(hunt);
  assert.equal(basis.source, 'analysis-context-missing-media');
  assert.equal(basis.overlayStatus, 'stale');
  assert.equal(basis.imageUri, null);      // never render wrong image
  assert.deepEqual(basis.gps, { lat: 39.5, lon: -98.1 }); // keep GPS for map
});

test('resolveAnalysisBasis — null hunt returns safe empty basis', () => {
  const basis = resolveAnalysisBasis(null);
  assert.equal(basis.imageId, null);
  assert.equal(basis.imageUri, null);
  assert.equal(basis.gps, null);
  assert.equal(basis.overlayStatus, 'valid');
  assert.equal(basis.source, 'none');
});

test('resolveAnalysisBasis — explicit stale flag is preserved', () => {
  const hunt = mkHunt({
    analysisContext: { ...ctxB, overlayStatus: 'stale' },
  });
  const basis = resolveAnalysisBasis(hunt);
  assert.equal(basis.overlayStatus, 'stale');
});

// ============================== buildInitialAnalysisContext ==============================

test('buildInitialAnalysisContext — locks to saved primaryMediaRef', () => {
  const ctx = buildInitialAnalysisContext({
    primaryMediaRef: 'img_XYZ',
    ctxInput: { imageNaturalWidth: 2000, imageNaturalHeight: 1500, gps: { lat: 1, lon: 2 } },
    fallbackGps: { lat: 99, lon: 99 },
  });
  assert.ok(ctx);
  assert.equal(ctx.imageId, 'img_XYZ');
  assert.equal(ctx.imageNaturalWidth, 2000);
  assert.equal(ctx.imageNaturalHeight, 1500);
  assert.deepEqual(ctx.gps, { lat: 1, lon: 2 });     // explicit wins
  assert.equal(ctx.overlayStatus, 'valid');
  assert.ok(ctx.lockedAt);
});

test('buildInitialAnalysisContext — falls back to hunt GPS when ctxInput.gps undefined', () => {
  const ctx = buildInitialAnalysisContext({
    primaryMediaRef: 'img_1',
    ctxInput: { imageNaturalWidth: 100, imageNaturalHeight: 100 },
    fallbackGps: { lat: 40, lon: -90 },
  });
  assert.deepEqual(ctx?.gps, { lat: 40, lon: -90 });
});

test('buildInitialAnalysisContext — explicit null analysis GPS is kept null', () => {
  const ctx = buildInitialAnalysisContext({
    primaryMediaRef: 'img_1',
    ctxInput: { gps: null, imageNaturalWidth: 100, imageNaturalHeight: 100 },
    fallbackGps: { lat: 40, lon: -90 },
  });
  assert.equal(ctx?.gps, null);
});

test('buildInitialAnalysisContext — returns null when no primary media', () => {
  const ctx = buildInitialAnalysisContext({
    primaryMediaRef: null,
    ctxInput: undefined,
    fallbackGps: null,
  });
  assert.equal(ctx, null);
});

// ============================== persistence round-trip (v3.1 schema) ==============================

test('buildPersistedAnalysis — embeds the analysisContext', () => {
  const ctx = buildInitialAnalysisContext({
    primaryMediaRef: 'img_B',
    ctxInput: { imageNaturalWidth: 1600, imageNaturalHeight: 1200, gps: { lat: 39.5, lon: -98.1 } },
    fallbackGps: null,
  });
  const analysis = buildPersistedAnalysis({
    id: 'hunt_1',
    metadata: mkMetadata({ locationCoords: { lat: 40, lon: -95 } }), // hunt default
    analysis: {},
    mediaRefs: ['img_A', 'img_B'],
    primaryMediaRef: 'img_B',
    storageStrategy: 'local-uri',
    analysisContext: ctx,
  });
  assert.ok(analysis.analysisContext);
  assert.equal(analysis.analysisContext!.imageId, 'img_B');
  assert.deepEqual(analysis.analysisContext!.gps, { lat: 39.5, lon: -98.1 });
  // Hunt-level default is separately preserved.
  assert.deepEqual(analysis.metadata.locationCoords, { lat: 40, lon: -95 });
});

test('buildPersistedAnalysis — backwards compatible when analysisContext omitted', () => {
  const analysis = buildPersistedAnalysis({
    id: 'hunt_1',
    metadata: mkMetadata(),
    analysis: {},
    mediaRefs: ['img_A'],
    primaryMediaRef: 'img_A',
    storageStrategy: 'local-uri',
  });
  assert.equal(analysis.analysisContext, null);
});

// ============================== staleness detection ==============================

test('isAnalysisContextStale — true when explicit flag set', () => {
  assert.equal(
    isAnalysisContextStale({ ...ctxB, overlayStatus: 'stale' }, [mkMedia('img_B')]),
    true,
  );
});

test('isAnalysisContextStale — true when imageId not in media', () => {
  assert.equal(isAnalysisContextStale(ctxB, [mkMedia('img_A')]), true);
});

test('isAnalysisContextStale — false when imageId present + valid', () => {
  assert.equal(isAnalysisContextStale(ctxB, [mkMedia('img_B')]), false);
});

test('isAnalysisContextStale — null context is not stale (nothing to invalidate)', () => {
  assert.equal(isAnalysisContextStale(null, [mkMedia('img_A')]), false);
});

// ============================== wouldInvalidateContext ==============================

test('wouldInvalidateContext — switching imageId invalidates', () => {
  assert.equal(wouldInvalidateContext(ctxB, { imageId: 'img_OTHER' }), true);
});

test('wouldInvalidateContext — same imageId does not invalidate', () => {
  assert.equal(wouldInvalidateContext(ctxB, { imageId: 'img_B' }), false);
});

test('wouldInvalidateContext — changing GPS invalidates', () => {
  assert.equal(wouldInvalidateContext(ctxB, { gps: { lat: 1, lon: 1 } }), true);
  assert.equal(wouldInvalidateContext(ctxB, { gps: null }), true);
});

test('wouldInvalidateContext — changing calibration invalidates', () => {
  assert.equal(
    wouldInvalidateContext(ctxB, { overlayCalibration: { scale: 2, offsetX: 0, offsetY: 0 } }),
    true,
  );
});

test('wouldInvalidateContext — null context never invalidates (no prior lock)', () => {
  assert.equal(wouldInvalidateContext(null, { imageId: 'img_X' }), false);
});
