/**
 * Raven Scout — analytics API client unit tests.
 */

// AsyncStorage in-memory shim — must be registered BEFORE the
// SUT module is required. Jest hoists jest.mock() above any
// other top-level code, so the store has to live on a global the
// factory can reach without a closure capture.
(global as any).__rsAsyncStore = (global as any).__rsAsyncStore || {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async (k: string, v: string) => { (global as any).__rsAsyncStore[k] = v; }),
    getItem: jest.fn(async (k: string) => (global as any).__rsAsyncStore[k] ?? null),
    removeItem: jest.fn(async (k: string) => { delete (global as any).__rsAsyncStore[k]; }),
    clear: jest.fn(async () => { (global as any).__rsAsyncStore = {}; }),
  },
}));

import { consumeOneAnalysis, grantExtraCreditsPurchase } from '../src/api/analyticsApi';

const origFetch = (global as any).fetch;
beforeEach(() => { (global as any).__rsAsyncStore = {}; });
afterAll(() => { (global as any).fetch = origFetch; });

function mockFetchOnce(spec: { status: number; json?: any }, capture?: { value?: any }) {
  (global as any).fetch = jest.fn(async (...args: any[]) => {
    if (capture) capture.value = args[1];
    return {
      ok: spec.status >= 200 && spec.status < 300,
      status: spec.status,
      json: async () => (spec.json ?? {}),
      text: async () => JSON.stringify(spec.json ?? {}),
    };
  });
}

describe('analyticsApi.consumeOneAnalysis', () => {
  it('throws an error tagged code=out_of_credits on HTTP 402', async () => {
    (global as any).__rsAsyncStore['session_token'] = 'tok123';
    mockFetchOnce({
      status: 402,
      json: { detail: { code: 'out_of_credits', message: 'Out of analytics.' } },
    });
    await expect(consumeOneAnalysis()).rejects.toMatchObject({ code: 'out_of_credits' });
  });

  it('returns the parsed body on 200', async () => {
    (global as any).__rsAsyncStore['session_token'] = 'tok123';
    mockFetchOnce({
      status: 200,
      json: { ok: true, charged: 'monthly', usage: { plan: 'pro', monthlyAnalyticsRemaining: 39 } },
    });
    const r = await consumeOneAnalysis();
    expect(r.charged).toBe('monthly');
    expect(r.usage.plan).toBe('pro');
  });
});

describe('analyticsApi.grantExtraCreditsPurchase', () => {
  it('posts pack_id + transaction_id and includes the bearer token', async () => {
    (global as any).__rsAsyncStore['session_token'] = 'tok123';
    const cap: any = {};
    mockFetchOnce({
      status: 200,
      json: {
        ok: true, duplicate: false, credits_granted: 5,
        extra_analytics_credits: 5, pack_id: 'ravenscout_extra_analytics_5',
      },
    }, cap);
    const r = await grantExtraCreditsPurchase('ravenscout_extra_analytics_5', 'tx_42');
    expect(r.credits_granted).toBe(5);
    expect(cap.value.method).toBe('POST');
    expect(JSON.parse(cap.value.body)).toEqual({
      pack_id: 'ravenscout_extra_analytics_5', transaction_id: 'tx_42',
    });
    expect(cap.value.headers.Authorization).toBe('Bearer tok123');
  });

  it('reports duplicate=true on idempotent replay (server-driven)', async () => {
    (global as any).__rsAsyncStore['session_token'] = 'tok123';
    mockFetchOnce({
      status: 200,
      json: {
        ok: true, duplicate: true, credits_granted: 0,
        extra_analytics_credits: 5, pack_id: 'ravenscout_extra_analytics_5',
      },
    });
    const r = await grantExtraCreditsPurchase('ravenscout_extra_analytics_5', 'tx_42');
    expect(r.duplicate).toBe(true);
    expect(r.credits_granted).toBe(0);
  });
});
