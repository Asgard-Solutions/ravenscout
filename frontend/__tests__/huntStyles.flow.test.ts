/**
 * @jest-environment node
 *
 * Locks in the natural-progression hunt-style flow:
 *   Step 1: Weapon  ->  Archery / Rifle / Shotgun
 *   Step 2: Method  ->  Blind / Saddle / Spot & Stalk
 *
 * Also pins the shotgun-as-its-own-canonical-id contract so we don't
 * accidentally fold it back into rifle on the frontend.
 */
import {
  HUNT_STYLES,
  HUNT_WEAPONS,
  HUNT_METHODS,
  CANONICAL_HUNT_STYLE_IDS,
  isCanonicalHuntStyleId,
  normalizeHuntStyleId,
  getHuntStyleLabel,
} from '../src/constants/huntStyles';

describe('hunt-style natural progression', () => {
  it('weapon group is exactly [archery, rifle, shotgun]', () => {
    expect(HUNT_WEAPONS.map(s => s.id)).toEqual(['archery', 'rifle', 'shotgun']);
  });

  it('method group is exactly [blind, saddle, spot_and_stalk]', () => {
    expect(HUNT_METHODS.map(s => s.id)).toEqual(['blind', 'saddle', 'spot_and_stalk']);
  });

  it('weapon and method groups are disjoint', () => {
    const w = new Set(HUNT_WEAPONS.map(s => s.id));
    for (const m of HUNT_METHODS) {
      expect(w.has(m.id)).toBe(false);
    }
  });

  it('every weapon and method id has a label and lives in HUNT_STYLES', () => {
    for (const opt of [...HUNT_WEAPONS, ...HUNT_METHODS]) {
      expect(getHuntStyleLabel(opt.id)).toBe(opt.label);
      expect(HUNT_STYLES.find(s => s.id === opt.id)).toBeTruthy();
    }
  });
});

describe('shotgun is its own canonical id (not folded into rifle)', () => {
  it('shotgun is in the canonical list', () => {
    expect(CANONICAL_HUNT_STYLE_IDS).toContain('shotgun');
    expect(isCanonicalHuntStyleId('shotgun')).toBe(true);
  });

  it('common shotgun aliases all normalize to "shotgun"', () => {
    expect(normalizeHuntStyleId('shotgun')).toBe('shotgun');
    expect(normalizeHuntStyleId('Shotgun')).toBe('shotgun');
    expect(normalizeHuntStyleId('slug gun')).toBe('shotgun');
    expect(normalizeHuntStyleId('slug')).toBe('shotgun');
  });

  it('rifle aliases stay on rifle', () => {
    expect(normalizeHuntStyleId('rifle')).toBe('rifle');
    expect(normalizeHuntStyleId('centerfire')).toBe('rifle');
    expect(normalizeHuntStyleId('muzzleloader')).toBe('rifle');
    expect(normalizeHuntStyleId('blackpowder')).toBe('rifle');
  });

  it('archery aliases stay on archery', () => {
    expect(normalizeHuntStyleId('bow')).toBe('archery');
    expect(normalizeHuntStyleId('crossbow')).toBe('archery');
    expect(normalizeHuntStyleId('compound bow')).toBe('archery');
  });
});
