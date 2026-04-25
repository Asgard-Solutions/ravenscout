/**
 * Raven Scout map style config tests (Jest-compatible).
 *
 * The Expo project doesn't currently have a Jest runner wired in, so
 * these tests are written in Jest format and ready to run as soon as
 * `jest` + `jest-expo` are added. They double as living documentation
 * of the contract every screen relies on.
 *
 * To run locally once Jest is set up:
 *   yarn add -D jest jest-expo @types/jest
 *   yarn jest mapStyles
 */
/* eslint-disable @typescript-eslint/no-var-requires */

describe('mapStyles config', () => {
  describe('with a MapTiler key set', () => {
    beforeAll(() => {
      process.env.EXPO_PUBLIC_MAPTILER_KEY = 'test-key-abc123';
      jest.resetModules();
    });
    afterAll(() => {
      delete process.env.EXPO_PUBLIC_MAPTILER_KEY;
      jest.resetModules();
    });

    it('exposes exactly four canonical styles in the documented order', () => {
      const { RAVEN_SCOUT_MAP_STYLES } = require('../src/constants/mapStyles');
      expect(RAVEN_SCOUT_MAP_STYLES.map((s: any) => s.id)).toEqual([
        'outdoor',
        'satelliteHybrid',
        'satellitePlain',
        'topo',
      ]);
    });

    it('points each style at MapTiler GL style.json (not the cloud preview HTML)', () => {
      const { RAVEN_SCOUT_MAP_STYLES } = require('../src/constants/mapStyles');
      for (const s of RAVEN_SCOUT_MAP_STYLES) {
        expect(s.styleUrl).toMatch(/^https:\/\/api\.maptiler\.com\/maps\/[a-z0-9-]+\/style\.json\?key=/);
        expect(s.styleUrl).not.toMatch(/cloud\.maptiler\.com/);
        expect(s.styleUrl).toContain('test-key-abc123');
      }
    });

    it('uses the v4 slugs the spec calls out', () => {
      const { RAVEN_SCOUT_MAP_STYLES } = require('../src/constants/mapStyles');
      const byId: Record<string, any> = Object.fromEntries(
        RAVEN_SCOUT_MAP_STYLES.map((s: any) => [s.id, s]),
      );
      expect(byId.outdoor.styleUrl).toContain('/maps/outdoor-v4/style.json');
      expect(byId.satelliteHybrid.styleUrl).toContain('/maps/hybrid-v4/style.json');
      expect(byId.satellitePlain.styleUrl).toContain('/maps/satellite-v4/style.json');
      expect(byId.topo.styleUrl).toContain('/maps/topo-v4/style.json');
    });

    it('defaults brand-new users to Outdoor', () => {
      const { DEFAULT_MAP_STYLE_ID, resolveMapStyle } = require('../src/constants/mapStyles');
      expect(DEFAULT_MAP_STYLE_ID).toBe('outdoor');
      // Unknown / null / undefined all resolve to the default.
      expect(resolveMapStyle(null).id).toBe('outdoor');
      expect(resolveMapStyle(undefined).id).toBe('outdoor');
      expect(resolveMapStyle('not-a-real-style').id).toBe('outdoor');
    });

    it('hasMapTilerKey() reflects env presence', () => {
      const { hasMapTilerKey, getActiveMapStyles } = require('../src/constants/mapStyles');
      expect(hasMapTilerKey()).toBe(true);
      expect(getActiveMapStyles()).toHaveLength(4);
    });

    it('isRavenScoutMapStyleId guards against bad ids', () => {
      const { isRavenScoutMapStyleId } = require('../src/constants/mapStyles');
      expect(isRavenScoutMapStyleId('outdoor')).toBe(true);
      expect(isRavenScoutMapStyleId('topo')).toBe(true);
      expect(isRavenScoutMapStyleId('streets')).toBe(false); // legacy id, no longer supported
      expect(isRavenScoutMapStyleId(42)).toBe(false);
      expect(isRavenScoutMapStyleId(null)).toBe(false);
    });
  });

  describe('without a MapTiler key', () => {
    beforeAll(() => {
      delete process.env.EXPO_PUBLIC_MAPTILER_KEY;
      jest.resetModules();
    });

    it('emits empty styleUrls and reports the key as missing', () => {
      const { hasMapTilerKey, getActiveMapStyles, RAVEN_SCOUT_MAP_STYLES } =
        require('../src/constants/mapStyles');
      expect(hasMapTilerKey()).toBe(false);
      // The catalog still exists (so the registry shape is stable),
      // but every styleUrl is an empty string the caller must guard on.
      for (const s of RAVEN_SCOUT_MAP_STYLES) {
        expect(s.styleUrl).toBe('');
      }
      // The active-styles helper hides the switcher entirely in this case.
      expect(getActiveMapStyles()).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------
// useMapStylePreference — mocked AsyncStorage
// ---------------------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
      __reset: () => { store = {}; },
    },
  };
});

describe('useMapStylePreference (persistence)', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_MAPTILER_KEY = 'test-key-abc123';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AS = require('@react-native-async-storage/async-storage').default;
    AS.__reset();
  });

  it('starts on Outdoor when nothing has been persisted yet', async () => {
    const { renderHook, waitFor } = require('@testing-library/react-native');
    const { useMapStylePreference } = require('../src/hooks/useMapStylePreference');

    const { result } = renderHook(() => useMapStylePreference());
    await waitFor(() => expect(result.current.hydrating).toBe(false));
    expect(result.current.styleId).toBe('outdoor');
  });

  it('restores a previously persisted style on launch', async () => {
    const AS = require('@react-native-async-storage/async-storage').default;
    await AS.setItem('raven_scout_map_style_v1', 'topo');
    jest.resetModules();
    const { renderHook, waitFor } = require('@testing-library/react-native');
    const { useMapStylePreference } = require('../src/hooks/useMapStylePreference');

    const { result } = renderHook(() => useMapStylePreference());
    await waitFor(() => expect(result.current.hydrating).toBe(false));
    expect(result.current.styleId).toBe('topo');
  });

  it('persists every change so the next launch picks it up', async () => {
    const { renderHook, act, waitFor } = require('@testing-library/react-native');
    const { useMapStylePreference } = require('../src/hooks/useMapStylePreference');
    const AS = require('@react-native-async-storage/async-storage').default;

    const { result } = renderHook(() => useMapStylePreference());
    await waitFor(() => expect(result.current.hydrating).toBe(false));
    act(() => result.current.setStyleId('satelliteHybrid'));
    expect(result.current.styleId).toBe('satelliteHybrid');
    // Allow the microtask that performs the write to flush.
    await Promise.resolve();
    expect(AS.setItem).toHaveBeenCalledWith(
      'raven_scout_map_style_v1',
      'satelliteHybrid',
    );
  });

  it('falls back to Outdoor when a stale / unknown id is persisted', async () => {
    const AS = require('@react-native-async-storage/async-storage').default;
    await AS.setItem('raven_scout_map_style_v1', 'streets'); // legacy id
    jest.resetModules();
    const { renderHook, waitFor } = require('@testing-library/react-native');
    const { useMapStylePreference } = require('../src/hooks/useMapStylePreference');

    const { result } = renderHook(() => useMapStylePreference());
    await waitFor(() => expect(result.current.hydrating).toBe(false));
    expect(result.current.styleId).toBe('outdoor');
  });
});
