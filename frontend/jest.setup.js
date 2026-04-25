/**
 * Global Jest setup. Runs once before any test file.
 * - Provides a working in-memory mock for AsyncStorage so any
 *   consumer (incl. our `useMapStylePreference` hook) just works.
 * - Polyfills the `__DEV__` global Metro defines at runtime.
 */
/* eslint-disable @typescript-eslint/no-var-requires, no-undef */

global.__DEV__ = false;

jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k, v) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k) => { delete store[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { store = {}; return Promise.resolve(); }),
      __reset: () => { store = {}; },
    },
  };
});

// Suppress the noisy "JEST environment doesn't have window.matchMedia"
// warnings RN emits during component-render tests.
if (typeof window !== 'undefined') {
  window.matchMedia = window.matchMedia || (() => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}
