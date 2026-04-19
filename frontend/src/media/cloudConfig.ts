// Raven Scout — Cloud media runtime configuration.
//
// Tiny module-level holder that the CloudMediaStore consults for:
//   1. the backend base URL (used to call presign endpoints)
//   2. the current session token (used in `Authorization: Bearer …`)
//
// A default token provider reads `session_token` from AsyncStorage so
// the cloud adapter works transparently without any explicit wiring.
// Callers can override via `configureCloudMedia()` (e.g. for tests or
// to plug a different auth source).

export type TokenProvider = () => string | null | Promise<string | null>;

const DEFAULT_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL as string) || '';

// Lazy + guarded AsyncStorage import. We avoid a top-level
// `import '@react-native-async-storage/async-storage'` so that Node
// unit tests (which exercise this module directly) don't require the
// RN native module at module-load time.
async function readSessionTokenFromAsyncStorage(): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-async-storage/async-storage');
    const AsyncStorage = mod?.default ?? mod;
    if (!AsyncStorage || typeof AsyncStorage.getItem !== 'function') return null;
    return await AsyncStorage.getItem('session_token');
  } catch {
    return null;
  }
}

let _baseUrl: string = DEFAULT_BASE;
let _tokenProvider: TokenProvider = readSessionTokenFromAsyncStorage;
let _disabled = false;

export interface CloudMediaOptions {
  baseUrl?: string;
  getToken?: TokenProvider;
  /** If true, CloudMediaStore skips all network calls and falls through
   *  to its local fallback adapter (useful for tests / offline dev). */
  disabled?: boolean;
}

export function configureCloudMedia(opts: CloudMediaOptions): void {
  if (typeof opts.baseUrl === 'string') _baseUrl = opts.baseUrl;
  if (typeof opts.getToken === 'function') _tokenProvider = opts.getToken;
  if (typeof opts.disabled === 'boolean') _disabled = opts.disabled;
}

export function getBackendBaseUrl(): string {
  return _baseUrl;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const t = await _tokenProvider();
    return t || null;
  } catch {
    return null;
  }
}

export function isCloudMediaDisabled(): boolean {
  return _disabled;
}

/** Test-only reset hook. */
export function _resetCloudConfigForTests(): void {
  _baseUrl = DEFAULT_BASE;
  _tokenProvider = readSessionTokenFromAsyncStorage;
  _disabled = false;
}
