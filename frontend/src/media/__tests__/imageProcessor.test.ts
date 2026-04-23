// Raven Scout — Tests for image-processor profile selection.
// Run with:  yarn test:unit
//
// Pure logic only — actual ImageManipulator calls require a native
// runtime and are exercised manually through the app.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFILE_PRO,
  PROFILE_CORE,
  PROFILE_THUMBNAIL,
  profileForTier,
} from '../imageProfiles';

test('profileForTier — pro returns full-resolution profile', () => {
  const p = profileForTier('pro');
  // Lowered from 2048 → 1600 in Feb 2026 to cap mobile-Chrome bitmap
  // memory on tall panoramic screenshots. See imageProfiles.ts.
  assert.equal(p.maxDim, 1600);
  assert.equal(p.quality, 0.85);
  assert.deepEqual(p, PROFILE_PRO);
});

test('profileForTier — core returns compressed profile', () => {
  const p = profileForTier('core');
  assert.equal(p.maxDim, 1280);
  assert.equal(p.quality, 0.70);
  assert.deepEqual(p, PROFILE_CORE);
});

test('profileForTier — trial defaults to core profile', () => {
  assert.deepEqual(profileForTier('trial'), PROFILE_CORE);
});

test('profileForTier — case-insensitive', () => {
  assert.deepEqual(profileForTier('PRO'), PROFILE_PRO);
  assert.deepEqual(profileForTier('Core'), PROFILE_CORE);
});

test('profileForTier — unknown / null defaults to core profile', () => {
  assert.deepEqual(profileForTier(null), PROFILE_CORE);
  assert.deepEqual(profileForTier(undefined), PROFILE_CORE);
  assert.deepEqual(profileForTier('weird'), PROFILE_CORE);
});

test('thumbnail profile is small and aggressive', () => {
  assert.ok(PROFILE_THUMBNAIL.maxDim <= 200);
  assert.ok(PROFILE_THUMBNAIL.quality <= 0.6);
});

test('pro profile produces larger output than core', () => {
  // Loose property: more pixels at higher quality
  assert.ok(PROFILE_PRO.maxDim > PROFILE_CORE.maxDim);
  assert.ok(PROFILE_PRO.quality > PROFILE_CORE.quality);
});
