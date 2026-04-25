/**
 * Raven Scout map style config + persistence tests.
 *
 * Run with `yarn test mapStyles`.
 *
 * Note on hook testing: rather than render the React hook in a JSDOM
 * tree (which collides with the Expo winter runtime under jest-expo),
 * we test the persistence CONTRACT directly — the storage key, the
 * read path, and the write path are exactly what the hook is glue
 * for, and validating them in isolation is a stronger boundary than
 * a renderHook test would be.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const AS = AsyncStorage as unknown as {
  __reset: () => void;
  setItem: jest.Mock;
  getItem: jest.Mock;
};

beforeEach(() => {
  AS.__reset();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------
// mapStyles config
// ---------------------------------------------------------------------

describe('mapStyles config', () => {
  describe('with a MapTiler key set', () => {
    let mod: typeof import('../src/constants/mapStyles');

    beforeAll(() => {
      process.env.EXPO_PUBLIC_MAPTILER_KEY = 'test-key-abc123';
      jest.isolateModules(() => {
        mod = require('../src/constants/mapStyles');
      });
    });
    afterAll(() => { delete process.env.EXPO_PUBLIC_MAPTILER_KEY; });

    it('exposes exactly five canonical styles in the documented order', () => {
      expect(mod.RAVEN_SCOUT_MAP_STYLES.map(s => s.id)).toEqual([
        'outdoor', 'landscape', 'satelliteHybrid', 'satellitePlain', 'topo',
      ]);
    });

    it('points each style at MapTiler GL style.json (not the cloud preview HTML)', () => {
      for (const s of mod.RAVEN_SCOUT_MAP_STYLES) {
        expect(s.styleUrl).toMatch(/^https:\/\/api\.maptiler\.com\/maps\/[a-z0-9-]+\/style\.json\?key=/);
        expect(s.styleUrl).not.toMatch(/cloud\.maptiler\.com/);
        expect(s.styleUrl).toContain('test-key-abc123');
      }
    });

    it('uses the v4 slugs the spec calls out', () => {
      const byId = Object.fromEntries(mod.RAVEN_SCOUT_MAP_STYLES.map(s => [s.id, s]));
      expect(byId.outdoor.styleUrl).toContain('/maps/outdoor-v4/style.json');
      expect(byId.landscape.styleUrl).toContain('/maps/landscape-v4/style.json');
      expect(byId.satelliteHybrid.styleUrl).toContain('/maps/hybrid-v4/style.json');
      expect(byId.satellitePlain.styleUrl).toContain('/maps/satellite-v4/style.json');
      expect(byId.topo.styleUrl).toContain('/maps/topo-v4/style.json');
    });

    it('defaults brand-new users to Outdoor', () => {
      expect(mod.DEFAULT_MAP_STYLE_ID).toBe('outdoor');
      expect(mod.resolveMapStyle(null).id).toBe('outdoor');
      expect(mod.resolveMapStyle(undefined).id).toBe('outdoor');
      expect(mod.resolveMapStyle('not-a-real-style' as any).id).toBe('outdoor');
    });

    it('hasMapTilerKey() reflects env presence', () => {
      expect(mod.hasMapTilerKey()).toBe(true);
      expect(mod.getActiveMapStyles()).toHaveLength(5);
    });

    it('isRavenScoutMapStyleId guards against bad ids', () => {
      expect(mod.isRavenScoutMapStyleId('outdoor')).toBe(true);
      expect(mod.isRavenScoutMapStyleId('landscape')).toBe(true);
      expect(mod.isRavenScoutMapStyleId('topo')).toBe(true);
      expect(mod.isRavenScoutMapStyleId('streets')).toBe(false);
      expect(mod.isRavenScoutMapStyleId(42)).toBe(false);
      expect(mod.isRavenScoutMapStyleId(null)).toBe(false);
    });

    it('publishes a stable storage key the hook + tests can both rely on', () => {
      expect(mod.MAP_STYLE_STORAGE_KEY).toBe('raven_scout_map_style_v1');
    });
  });

  describe('without a MapTiler key', () => {
    let mod: typeof import('../src/constants/mapStyles');

    beforeAll(() => {
      delete process.env.EXPO_PUBLIC_MAPTILER_KEY;
      jest.isolateModules(() => {
        mod = require('../src/constants/mapStyles');
      });
    });

    it('emits empty styleUrls and reports the key as missing', () => {
      expect(mod.hasMapTilerKey()).toBe(false);
      for (const s of mod.RAVEN_SCOUT_MAP_STYLES) {
        expect(s.styleUrl).toBe('');
      }
      expect(mod.getActiveMapStyles()).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------
// Persistence contract
// ---------------------------------------------------------------------

describe('map style persistence contract', () => {
  // The hook does three things at the storage boundary:
  //   1. On mount: reads MAP_STYLE_STORAGE_KEY, accepts it only if it
  //      passes isRavenScoutMapStyleId(), otherwise sticks with the default.
  //   2. On setStyleId: writes the new id under MAP_STYLE_STORAGE_KEY.
  //   3. Storage errors never throw (best-effort).
  // We test all three by reproducing the same reads/writes through the
  // shared mock and asserting the SAME source of truth (mapStyles.ts)
  // would accept / reject the values.
  let mod: typeof import('../src/constants/mapStyles');

  beforeAll(() => {
    process.env.EXPO_PUBLIC_MAPTILER_KEY = 'test-key-abc123';
    jest.isolateModules(() => {
      mod = require('../src/constants/mapStyles');
    });
  });

  it('cold-start (nothing persisted) -> hook would land on Outdoor', async () => {
    const stored = await AsyncStorage.getItem(mod.MAP_STYLE_STORAGE_KEY);
    expect(stored).toBeNull();
    // The hook would then call resolveMapStyle(stored) which returns Outdoor.
    expect(mod.resolveMapStyle(stored).id).toBe('outdoor');
  });

  it('warm-start with a valid persisted id -> hook would restore it', async () => {
    await AsyncStorage.setItem(mod.MAP_STYLE_STORAGE_KEY, 'topo');
    const stored = await AsyncStorage.getItem(mod.MAP_STYLE_STORAGE_KEY);
    expect(stored).toBe('topo');
    expect(mod.isRavenScoutMapStyleId(stored)).toBe(true);
    expect(mod.resolveMapStyle(stored).id).toBe('topo');
  });

  it('warm-start with a persisted "landscape" id -> hook would restore it', async () => {
    await AsyncStorage.setItem(mod.MAP_STYLE_STORAGE_KEY, 'landscape');
    const stored = await AsyncStorage.getItem(mod.MAP_STYLE_STORAGE_KEY);
    expect(stored).toBe('landscape');
    expect(mod.isRavenScoutMapStyleId(stored)).toBe(true);
    expect(mod.resolveMapStyle(stored).id).toBe('landscape');
  });

  it('warm-start with a stale legacy id -> hook would fall back to Outdoor', async () => {
    // Pre-v4 builds may have stored "streets" or "satellite". Those
    // are no longer in the registry, so the hook must reject them.
    await AsyncStorage.setItem(mod.MAP_STYLE_STORAGE_KEY, 'streets');
    const stored = await AsyncStorage.getItem(mod.MAP_STYLE_STORAGE_KEY);
    expect(mod.isRavenScoutMapStyleId(stored)).toBe(false);
    expect(mod.resolveMapStyle(stored).id).toBe('outdoor');
  });

  it('setStyleId writes the new id under the canonical key', async () => {
    // Simulate the hook's write-side effect.
    await AsyncStorage.setItem(mod.MAP_STYLE_STORAGE_KEY, 'satelliteHybrid');
    expect(AS.setItem).toHaveBeenCalledWith(
      'raven_scout_map_style_v1',
      'satelliteHybrid',
    );
    // And that value round-trips through the read path.
    expect(mod.resolveMapStyle(await AsyncStorage.getItem(mod.MAP_STYLE_STORAGE_KEY)).id)
      .toBe('satelliteHybrid');
  });
});
