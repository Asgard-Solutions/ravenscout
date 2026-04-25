/**
 * Jest config for the Raven Scout Expo app.
 *
 * Uses the official `jest-expo` preset which applies the right
 * Babel + Metro + JSX transforms for our React Native build.
 */
module.exports = {
  preset: 'jest-expo',

  // Jest-authored suites only. The legacy `node --test` files under
  // src/**/__tests__ are run via `yarn test:unit` and use `import.meta`
  // / `node:test`, which Jest's Hermes preset can't transform.
  testMatch: [
    '<rootDir>/__tests__/**/*.test.[jt]s?(x)',
  ],

  setupFiles: ['<rootDir>/jest.setup.js'],

  // Extend jest-expo's transformIgnorePatterns to allow our own files
  // to flow through the Babel pipeline (covers our TypeScript imports
  // from RN-ecosystem packages that ship ESM).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
};
