// Raven Scout — Hunt-style canonical-id contract tests (frontend).
//
// Run with:  yarn test:unit (add this file to the test:unit runner)
//
// These tests lock down three invariants:
//   1. The canonical id inventory matches backend `species_prompts/hunt_styles.py`.
//   2. `normalizeHuntStyleId` accepts common aliases + returns null on garbage.
//   3. `extractMetadata` persists huntStyle as a canonical id (never display text).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HUNT_STYLES,
  CANONICAL_HUNT_STYLE_IDS,
  isCanonicalHuntStyleId,
  getHuntStyleLabel,
  normalizeHuntStyleId,
} from '../constants/huntStyles';
import { extractMetadata } from '../media/huntSerialization';

// ------------------------------ canonical inventory ------------------------------

test('hunt styles: exactly six canonical ids, matching backend', () => {
  const expected = [
    'archery', 'rifle', 'blind', 'saddle', 'public_land', 'spot_and_stalk',
  ];
  assert.equal(CANONICAL_HUNT_STYLE_IDS.length, 6);
  for (const id of expected) {
    assert.ok(CANONICAL_HUNT_STYLE_IDS.includes(id as any), `missing canonical id: ${id}`);
  }
});

test('hunt styles: every option has non-empty label, shortLabel, hint, icon', () => {
  for (const opt of HUNT_STYLES) {
    assert.ok(opt.label && opt.label.trim(), `${opt.id} missing label`);
    assert.ok(opt.shortLabel && opt.shortLabel.trim(), `${opt.id} missing shortLabel`);
    assert.ok(opt.hint && opt.hint.trim(), `${opt.id} missing hint`);
    assert.ok(opt.icon && opt.icon.trim(), `${opt.id} missing icon`);
  }
});

test('isCanonicalHuntStyleId: accepts canonical ids only', () => {
  assert.equal(isCanonicalHuntStyleId('archery'), true);
  assert.equal(isCanonicalHuntStyleId('public_land'), true);
  assert.equal(isCanonicalHuntStyleId('BOW'), false);
  assert.equal(isCanonicalHuntStyleId('Archery'), false);
  assert.equal(isCanonicalHuntStyleId(''), false);
  assert.equal(isCanonicalHuntStyleId(null), false);
  assert.equal(isCanonicalHuntStyleId(undefined), false);
  assert.equal(isCanonicalHuntStyleId(42), false);
});

test('getHuntStyleLabel: returns display label for canonical id, null otherwise', () => {
  assert.equal(getHuntStyleLabel('archery'), 'Archery');
  assert.equal(getHuntStyleLabel('rifle'), 'Rifle');
  assert.equal(getHuntStyleLabel('public_land'), 'Public Land');
  assert.equal(getHuntStyleLabel('spot_and_stalk'), 'Spot & Stalk');
  assert.equal(getHuntStyleLabel(null), null);
  assert.equal(getHuntStyleLabel(undefined), null);
  assert.equal(getHuntStyleLabel('bogus'), null);
});

// ------------------------------ normalization ------------------------------

test('normalizeHuntStyleId: canonical pass-through', () => {
  for (const id of CANONICAL_HUNT_STYLE_IDS) {
    assert.equal(normalizeHuntStyleId(id), id);
  }
});

test('normalizeHuntStyleId: common aliases map to canonical ids', () => {
  const cases: Array<[string, string]> = [
    ['bow', 'archery'],
    ['Bow Hunting', 'archery'],
    ['Compound Bow', 'archery'],
    ['crossbow', 'archery'],
    ['shotgun', 'rifle'],
    ['Muzzleloader', 'rifle'],
    ['Ground Blind', 'blind'],
    ['tower blind', 'blind'],
    ['tree saddle', 'saddle'],
    ['saddle hunting', 'saddle'],
    ['Public Land', 'public_land'],
    ['public-land', 'public_land'],
    ['WMA', 'public_land'],
    ['BLM', 'public_land'],
    ['spot and stalk', 'spot_and_stalk'],
    ['still hunt', 'spot_and_stalk'],
    ['glassing', 'spot_and_stalk'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeHuntStyleId(input), expected, `input=${input}`);
  }
});

test('normalizeHuntStyleId: garbage inputs return null', () => {
  for (const bad of ['', '   ', 'totally bogus', 'deer', null, undefined, 42, {}, [], true]) {
    assert.equal(normalizeHuntStyleId(bad as any), null, `should be null for ${String(bad)}`);
  }
});

// ------------------------------ persistence contract ------------------------------

test('extractMetadata: persists huntStyle field (canonical id pass-through)', () => {
  const metadata = extractMetadata({
    species: 'deer', speciesName: 'Deer',
    date: '2025-01-01', timeWindow: 'dawn', windDirection: 'N',
    huntStyle: 'archery',
  });
  assert.equal(metadata.huntStyle, 'archery');
});

test('extractMetadata: huntStyle defaults to null when unset', () => {
  const metadata = extractMetadata({
    species: 'deer', speciesName: 'Deer',
    date: '2025-01-01', timeWindow: 'dawn', windDirection: 'N',
  });
  assert.equal(metadata.huntStyle, null);
});

test('extractMetadata: preserves every canonical hunt-style id round-trip', () => {
  for (const id of CANONICAL_HUNT_STYLE_IDS) {
    const metadata = extractMetadata({
      species: 'deer', speciesName: 'Deer',
      date: '2025-01-01', timeWindow: 'dawn', windDirection: 'N',
      huntStyle: id,
    });
    assert.equal(metadata.huntStyle, id, `round-trip failed for ${id}`);
  }
});

test('extractMetadata: does NOT populate huntStyle from other fields', () => {
  // Region / species / weatherData must never bleed into huntStyle.
  const metadata = extractMetadata({
    species: 'deer', speciesName: 'Deer',
    date: '2025-01-01', timeWindow: 'dawn', windDirection: 'N',
    region: 'Archery only unit',  // looks like a style hint but isn't
    propertyType: 'saddle',        // garbage value in propertyType
    weatherData: { foo: 'rifle' },
  });
  assert.equal(metadata.huntStyle, null);
});
