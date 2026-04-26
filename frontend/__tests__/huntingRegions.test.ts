/**
 * @jest-environment node
 */
import {
  HUNTING_REGION_IDS,
  HUNTING_REGION_LABELS,
  US_STATES,
  STATE_TO_HUNTING_REGIONS,
  defaultRegionForState,
  regionsForState,
  getStateByCode,
  getStateByName,
  resolveStateFromGeocode,
} from '../src/constants/huntingRegions';

describe('huntingRegions constants', () => {
  it('defines all 5 region ids with labels', () => {
    expect(HUNTING_REGION_IDS).toHaveLength(5);
    for (const id of HUNTING_REGION_IDS) {
      expect(HUNTING_REGION_LABELS[id]).toBeTruthy();
    }
  });

  it('lists 51 US states (including DC)', () => {
    expect(US_STATES).toHaveLength(51);
    const codes = US_STATES.map(s => s.code);
    expect(new Set(codes).size).toBe(51);
    expect(codes).toContain('OK');
    expect(codes).toContain('TX');
    expect(codes).toContain('DC');
  });

  it('every supported state in STATE_TO_HUNTING_REGIONS maps to a known region id', () => {
    for (const [code, ids] of Object.entries(STATE_TO_HUNTING_REGIONS)) {
      expect(US_STATES.some(s => s.code === code)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(HUNTING_REGION_IDS).toContain(id);
      }
    }
  });

  it('every state in US_STATES has at least one region', () => {
    for (const s of US_STATES) {
      expect(regionsForState(s.code).length).toBeGreaterThan(0);
    }
  });

  it('Oklahoma is in Plains', () => {
    expect(defaultRegionForState('OK')).toBe('plains');
    expect(regionsForState('OK')).toEqual(['plains']);
  });

  it('Texas is in Southeast US (temporary unified mapping)', () => {
    expect(defaultRegionForState('TX')).toBe('southeast_us');
  });

  it('Mountain West states resolve to mountain_west', () => {
    for (const code of ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY']) {
      expect(defaultRegionForState(code)).toBe('mountain_west');
    }
  });

  it('returns null/[] for unknown codes', () => {
    expect(defaultRegionForState('ZZ')).toBeNull();
    expect(regionsForState('ZZ')).toEqual([]);
    expect(defaultRegionForState(null)).toBeNull();
    expect(defaultRegionForState(undefined)).toBeNull();
  });

  it('getStateByCode is case-insensitive', () => {
    expect(getStateByCode('ok')?.name).toBe('Oklahoma');
    expect(getStateByCode('OK')?.name).toBe('Oklahoma');
  });

  it('getStateByName is case-insensitive', () => {
    expect(getStateByName('oklahoma')?.code).toBe('OK');
    expect(getStateByName('Oklahoma')?.code).toBe('OK');
  });

  it('resolveStateFromGeocode handles full names AND 2-letter codes', () => {
    expect(resolveStateFromGeocode('Oklahoma')?.code).toBe('OK');
    expect(resolveStateFromGeocode('OK')?.code).toBe('OK');
    expect(resolveStateFromGeocode('  texas ')?.code).toBe('TX');
    expect(resolveStateFromGeocode('Notastate')).toBeNull();
    expect(resolveStateFromGeocode(null)).toBeNull();
    expect(resolveStateFromGeocode('')).toBeNull();
  });
});
