/**
 * Tests for the RevenueCat purchases wrapper.
 *
 * The wrapper has two essential responsibilities:
 *   1. Gracefully detect whether `react-native-purchases` is loadable
 *      (it isn't in Expo Go / web / jest by default), and degrade to a
 *      `status: 'unavailable'` result so callers can use the preview-mode
 *      fallback path without crashing.
 *   2. Translate raw RC SDK responses into the structured PurchaseResult
 *      shape the rest of the app expects, including extracting a stable
 *      transaction id for the backend's idempotency contract.
 */

import { Platform } from 'react-native';

describe('purchases wrapper — Expo Go / web fallback', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('reports the SDK as unavailable when the native module is missing', async () => {
    // Make sure the module require fails so the wrapper falls back.
    jest.doMock('react-native-purchases', () => {
      throw new Error('Native module not available in jest');
    }, { virtual: true });

    const mod = require('../src/lib/purchases');

    expect(mod.isPurchasesAvailable()).toBe(false);
    expect(await mod.initPurchases()).toBe(false);

    const subResult = await mod.purchaseProduct('pro_annual');
    expect(subResult).toEqual({ status: 'unavailable' });

    const consumableResult = await mod.purchaseProduct('ravenscout_extra_analytics_5');
    expect(consumableResult).toEqual({ status: 'unavailable' });

    const restoreResult = await mod.restorePurchases();
    expect(restoreResult).toEqual({ status: 'unavailable' });

    // identifyUser / logoutPurchases must not throw and must report false.
    expect(await mod.identifyUser('user_123')).toBe(false);
    await expect(mod.logoutPurchases()).resolves.toBeUndefined();
  });

  it('reports unavailable on web even when the SDK is in node_modules', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'web' });
    const mod = require('../src/lib/purchases');
    expect(mod.isPurchasesAvailable()).toBe(false);
    expect(await mod.initPurchases()).toBe(false);
    expect((await mod.purchaseProduct('any')).status).toBe('unavailable');
    // Reset Platform.OS for the next test.
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
  });
});

describe('purchases wrapper — entitlement & customerInfo helpers', () => {
  beforeEach(() => { jest.resetModules(); });

  function loadModFromFreshRequire() {
    // Pretend the SDK is available so helpers can be reasoned about
    // without going through the require path.
    jest.doMock('react-native-purchases', () => ({
      default: { configure: jest.fn() },
      LOG_LEVEL: { WARN: 'WARN' },
      PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR' },
    }), { virtual: true });
    return require('../src/lib/purchases');
  }

  it('tierFromCustomerInfo prefers pro over core', () => {
    const mod = loadModFromFreshRequire();
    expect(mod.tierFromCustomerInfo({
      entitlements: { active: { pro_entitlement: { isActive: true } } },
    })).toBe('pro');
    expect(mod.tierFromCustomerInfo({
      entitlements: { active: { core_entitlement: { isActive: true } } },
    })).toBe('core');
    expect(mod.tierFromCustomerInfo({ entitlements: { active: {} } })).toBeNull();
    expect(mod.tierFromCustomerInfo(null)).toBeNull();
  });

  it('entitlementsPayload mirrors the backend sync-revenuecat shape', () => {
    const mod = loadModFromFreshRequire();
    const payload = mod.entitlementsPayload({
      entitlements: {
        active: {
          pro_entitlement: {
            isActive: true,
            productIdentifier: 'pro_annual',
            expirationDate: '2026-01-01T00:00:00Z',
          },
        },
      },
    });
    expect(payload).toEqual({
      pro_entitlement: {
        isActive: true,
        productIdentifier: 'pro_annual',
        expirationDate: '2026-01-01T00:00:00Z',
      },
    });
  });

  it('entitlementsPayload returns an empty object for empty / missing entitlements', () => {
    const mod = loadModFromFreshRequire();
    expect(mod.entitlementsPayload({})).toEqual({});
    expect(mod.entitlementsPayload({ entitlements: { active: {} } })).toEqual({});
    expect(mod.entitlementsPayload(null)).toEqual({});
  });
});
