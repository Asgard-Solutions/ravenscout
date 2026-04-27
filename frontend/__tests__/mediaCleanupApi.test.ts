/**
 * Tests for the orphan S3 media cleanup API client.
 *
 * Covers:
 *   * URL construction (with and without `older_than_seconds`)
 *   * Auth header injection from AsyncStorage
 *   * Throwing variant surfaces backend error responses
 *   * Safe variant swallows every error and returns null
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage is imported only so the test file's import graph
// matches the api client's; the actual writes happen against the
// post-resetModules() instance inside each test.
void AsyncStorage;

const BACKEND = 'https://api.example.test';describe('mediaCleanupApi', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_BACKEND_URL = BACKEND;
    jest.restoreAllMocks();
  });

  it('cleanupOrphanMedia POSTs to the right URL with auth header', async () => {
    // After resetModules() the AsyncStorage instance the api client
    // imports is a fresh one, so we have to write to that same
    // instance after we require it.
    const AS = require('@react-native-async-storage/async-storage').default;
    await AS.setItem('session_token', 'tok-abc');

    const fetchMock = jest.spyOn(global as any, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        scanned: 3,
        deleted: 2,
        kept_committed: 1,
        failed: [],
        older_than_seconds: 86400,
      }),
    } as any);

    const { cleanupOrphanMedia } = require('../src/api/mediaCleanupApi');
    const result = await cleanupOrphanMedia();
    expect(result.deleted).toBe(2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`${BACKEND}/api/media/cleanup-orphans`);
    expect(calledOpts.method).toBe('POST');
    expect((calledOpts.headers as any).Authorization).toBe('Bearer tok-abc');
  });

  it('cleanupOrphanMedia adds older_than_seconds to the URL when provided', async () => {
    const fetchMock = jest.spyOn(global as any, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, scanned: 0, deleted: 0, kept_committed: 0, failed: [], older_than_seconds: 3600 }),
    } as any);
    const { cleanupOrphanMedia } = require('../src/api/mediaCleanupApi');
    await cleanupOrphanMedia(3600.7); // floored to 3600
    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('older_than_seconds=3600');
  });

  it('cleanupOrphanMedia throws on non-2xx and surfaces the body', async () => {
    jest.spyOn(global as any, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Pro tier required',
    } as any);
    const { cleanupOrphanMedia } = require('../src/api/mediaCleanupApi');
    await expect(cleanupOrphanMedia()).rejects.toThrow(/403/);
  });

  it('cleanupOrphanMediaSafe returns null on any error and never throws', async () => {
    jest.spyOn(global as any, 'fetch').mockRejectedValue(new Error('network down'));
    const { cleanupOrphanMediaSafe } = require('../src/api/mediaCleanupApi');
    const result = await cleanupOrphanMediaSafe();
    expect(result).toBeNull();
  });

  it('cleanupOrphanMediaSafe returns null on non-2xx without throwing', async () => {
    jest.spyOn(global as any, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    } as any);
    const { cleanupOrphanMediaSafe } = require('../src/api/mediaCleanupApi');
    const result = await cleanupOrphanMediaSafe();
    expect(result).toBeNull();
  });
});
