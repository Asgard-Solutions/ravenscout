/**
 * Raven Scout — plan capability tests.
 *
 * Run with `yarn jest planCapabilities`.
 */
import {
  normalizePlanId,
  getAllowedMapStylesForPlan,
  canUseMapStyle,
  canUploadImages,
  resolveAllowedStyleForPlan,
} from '../src/constants/planCapabilities';

describe('normalizePlanId', () => {
  it('keeps the canonical ids', () => {
    expect(normalizePlanId('free')).toBe('free');
    expect(normalizePlanId('core')).toBe('core');
    expect(normalizePlanId('pro')).toBe('pro');
  });

  it('aliases the legacy "trial" label to free', () => {
    expect(normalizePlanId('trial')).toBe('free');
    expect(normalizePlanId('TRIAL')).toBe('free');
    expect(normalizePlanId('  Trial  ')).toBe('free');
  });

  it('falls back to free for unknown / null / undefined / wrong types', () => {
    expect(normalizePlanId(null)).toBe('free');
    expect(normalizePlanId(undefined)).toBe('free');
    expect(normalizePlanId('')).toBe('free');
    expect(normalizePlanId('enterprise')).toBe('free');
    // @ts-expect-error — runtime hardening for non-string values
    expect(normalizePlanId(42)).toBe('free');
    // @ts-expect-error
    expect(normalizePlanId({})).toBe('free');
  });
});

describe('canUploadImages', () => {
  it('Free can upload images', () => {
    expect(canUploadImages('free')).toBe(true);
    // legacy label maps in
    expect(canUploadImages('trial')).toBe(true);
  });

  it('Core can upload images', () => {
    expect(canUploadImages('core')).toBe(true);
  });

  it('Pro can upload images', () => {
    expect(canUploadImages('pro')).toBe(true);
  });

  it('unknown plans default safely to free upload access', () => {
    expect(canUploadImages(null)).toBe(true);
    expect(canUploadImages('unknown')).toBe(true);
  });
});

describe('getAllowedMapStylesForPlan', () => {
  it('Free has NO map styles (upload-only)', () => {
    expect(getAllowedMapStylesForPlan('free')).toEqual([]);
    expect(getAllowedMapStylesForPlan('trial')).toEqual([]);
  });

  it('Core has Outdoor + Satellite Plain + Topo, in that order', () => {
    expect(getAllowedMapStylesForPlan('core')).toEqual([
      'outdoor', 'satellitePlain', 'topo',
    ]);
  });

  it('Pro has all five styles, in spec order', () => {
    expect(getAllowedMapStylesForPlan('pro')).toEqual([
      'outdoor', 'landscape', 'satelliteHybrid', 'satellitePlain', 'topo',
    ]);
  });

  it('null / unknown plan defaults to Free (empty list)', () => {
    expect(getAllowedMapStylesForPlan(null)).toEqual([]);
    expect(getAllowedMapStylesForPlan('mystery-tier')).toEqual([]);
  });

  it('returns a fresh copy callers can safely mutate', () => {
    const a = getAllowedMapStylesForPlan('pro');
    a.push('topo');
    const b = getAllowedMapStylesForPlan('pro');
    expect(b).toEqual([
      'outdoor', 'landscape', 'satelliteHybrid', 'satellitePlain', 'topo',
    ]);
  });
});

describe('canUseMapStyle', () => {
  it('Free is blocked from every map style (incl. outdoor)', () => {
    expect(canUseMapStyle('free', 'outdoor')).toBe(false);
    expect(canUseMapStyle('free', 'satelliteHybrid')).toBe(false);
    expect(canUseMapStyle('free', 'landscape')).toBe(false);
    expect(canUseMapStyle('free', 'topo')).toBe(false);
  });

  it('Core is allowed Outdoor / Satellite Plain / Topo', () => {
    expect(canUseMapStyle('core', 'outdoor')).toBe(true);
    expect(canUseMapStyle('core', 'satellitePlain')).toBe(true);
    expect(canUseMapStyle('core', 'topo')).toBe(true);
  });

  it('Core is blocked from Pro-only styles (Hybrid + Landscape)', () => {
    expect(canUseMapStyle('core', 'satelliteHybrid')).toBe(false);
    expect(canUseMapStyle('core', 'landscape')).toBe(false);
  });

  it('Pro is allowed every defined style', () => {
    for (const id of ['outdoor', 'landscape', 'satelliteHybrid', 'satellitePlain', 'topo']) {
      expect(canUseMapStyle('pro', id)).toBe(true);
    }
  });

  it('rejects unknown / non-string style ids regardless of plan', () => {
    expect(canUseMapStyle('pro', 'streets')).toBe(false);
    expect(canUseMapStyle('pro', null)).toBe(false);
    expect(canUseMapStyle('pro', undefined)).toBe(false);
    // @ts-expect-error
    expect(canUseMapStyle('pro', 42)).toBe(false);
  });
});

describe('resolveAllowedStyleForPlan', () => {
  it('returns null for Free (no styles)', () => {
    expect(resolveAllowedStyleForPlan('free', 'outdoor')).toBeNull();
    expect(resolveAllowedStyleForPlan('free', null)).toBeNull();
  });

  it('keeps the persisted style when it is allowed', () => {
    expect(resolveAllowedStyleForPlan('core', 'topo')).toBe('topo');
    expect(resolveAllowedStyleForPlan('pro', 'satelliteHybrid')).toBe('satelliteHybrid');
  });

  it('falls back to the first allowed style when persisted is illegal (downgrade case)', () => {
    // Pro user picked Hybrid then downgraded to Core: should land on Outdoor.
    expect(resolveAllowedStyleForPlan('core', 'satelliteHybrid')).toBe('outdoor');
    // Pro user picked Landscape then downgraded to Core: also Outdoor.
    expect(resolveAllowedStyleForPlan('core', 'landscape')).toBe('outdoor');
    // No persisted value at all → default to first allowed.
    expect(resolveAllowedStyleForPlan('core', null)).toBe('outdoor');
    expect(resolveAllowedStyleForPlan('pro', undefined)).toBe('outdoor');
  });

  it('falls back gracefully for unknown style strings', () => {
    expect(resolveAllowedStyleForPlan('core', 'streets')).toBe('outdoor');
    expect(resolveAllowedStyleForPlan('pro', 'mystery')).toBe('outdoor');
  });
});
