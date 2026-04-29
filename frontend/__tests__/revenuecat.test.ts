/**
 * Tests for the centralized RevenueCat constants and helpers.
 *
 * Guarantees:
 *   - The canonical offering / package / entitlement ids match the
 *     contract in `/app/backend/server.py`.
 *   - The credit-pack alias map covers every platform-specific id
 *     the backend accepts.
 *   - The deprecated `pro_annual:*` Android product ids never leak
 *     back into the codebase (regression guard).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_OFFERING_ID,
  CREDIT_PACKS_OFFERING_ID,
  CORE_MONTHLY_PACKAGE_ID,
  CORE_ANNUAL_PACKAGE_ID,
  PRO_MONTHLY_PACKAGE_ID,
  PRO_ANNUAL_PACKAGE_ID,
  CREDITS_5_PACKAGE_ID,
  CREDITS_10_PACKAGE_ID,
  CREDITS_15_PACKAGE_ID,
  CORE_ENTITLEMENT_ID,
  PRO_ENTITLEMENT_ID,
  TIER_PRIORITY,
  CREDIT_PACK_CREDITS,
  CREDIT_PACK_LABEL,
  CREDIT_PACK_ALIASES,
  canonicalCreditPackId,
  packageIdFor,
  SUBSCRIPTION_PACKAGE_IDS,
  CREDIT_PACK_PACKAGE_IDS,
} from '../src/constants/revenuecat';

describe('revenuecat constants — offerings / packages / entitlements', () => {
  it('exposes the two canonical offering ids', () => {
    expect(DEFAULT_OFFERING_ID).toBe('default');
    expect(CREDIT_PACKS_OFFERING_ID).toBe('credit_packs');
  });

  it('exposes the four canonical subscription package ids', () => {
    expect(CORE_MONTHLY_PACKAGE_ID).toBe('core_monthly');
    expect(CORE_ANNUAL_PACKAGE_ID).toBe('core_annual');
    expect(PRO_MONTHLY_PACKAGE_ID).toBe('pro_monthly');
    expect(PRO_ANNUAL_PACKAGE_ID).toBe('pro_annual');
    expect(SUBSCRIPTION_PACKAGE_IDS).toEqual([
      'core_monthly',
      'core_annual',
      'pro_monthly',
      'pro_annual',
    ]);
  });

  it('exposes the three canonical credit-pack package ids', () => {
    expect(CREDITS_5_PACKAGE_ID).toBe('credits_5');
    expect(CREDITS_10_PACKAGE_ID).toBe('credits_10');
    expect(CREDITS_15_PACKAGE_ID).toBe('credits_15');
    expect(CREDIT_PACK_PACKAGE_IDS).toEqual(['credits_5', 'credits_10', 'credits_15']);
  });

  it('uses the canonical core / pro entitlement ids with Pro as the higher tier', () => {
    expect(CORE_ENTITLEMENT_ID).toBe('core');
    expect(PRO_ENTITLEMENT_ID).toBe('pro');
    // Pro must come first in the priority list.
    expect(TIER_PRIORITY[0]).toBe('pro');
    expect(TIER_PRIORITY[1]).toBe('core');
  });
});

describe('revenuecat constants — packageIdFor', () => {
  it('returns the right RC package id for every tier × cycle combo', () => {
    expect(packageIdFor('core', 'monthly')).toBe('core_monthly');
    expect(packageIdFor('core', 'annual')).toBe('core_annual');
    expect(packageIdFor('pro', 'monthly')).toBe('pro_monthly');
    expect(packageIdFor('pro', 'annual')).toBe('pro_annual');
  });
});

describe('revenuecat constants — credit pack credit amounts', () => {
  it('grants 5 / 10 / 15 credits respectively for each canonical pack', () => {
    expect(CREDIT_PACK_CREDITS.credits_5).toBe(5);
    expect(CREDIT_PACK_CREDITS.credits_10).toBe(10);
    expect(CREDIT_PACK_CREDITS.credits_15).toBe(15);
  });

  it('uses the user-facing pack labels required by the spec', () => {
    expect(CREDIT_PACK_LABEL.credits_5).toBe('5 Hunt Analytics Credits');
    expect(CREDIT_PACK_LABEL.credits_10).toBe('10 Hunt Analytics Credits');
    expect(CREDIT_PACK_LABEL.credits_15).toBe('15 Hunt Analytics Credits');
  });
});

describe('revenuecat constants — cross-platform credit pack aliases', () => {
  it('maps every supported platform id to its canonical pack', () => {
    // Canonical / iOS App Store product ids.
    expect(canonicalCreditPackId('credits_5')).toBe('credits_5');
    expect(canonicalCreditPackId('credits_10')).toBe('credits_10');
    expect(canonicalCreditPackId('credits_15')).toBe('credits_15');
    // Google Play product ids.
    expect(canonicalCreditPackId('analytics_pack_5')).toBe('credits_5');
    expect(canonicalCreditPackId('analytics_pack_10')).toBe('credits_10');
    expect(canonicalCreditPackId('analytics_pack_15')).toBe('credits_15');
    // Legacy v1.0 product ids.
    expect(canonicalCreditPackId('ravenscout_extra_analytics_5')).toBe('credits_5');
    expect(canonicalCreditPackId('ravenscout_extra_analytics_10')).toBe('credits_10');
    expect(canonicalCreditPackId('ravenscout_extra_analytics_15')).toBe('credits_15');
  });

  it('returns null for unknown ids', () => {
    expect(canonicalCreditPackId('not_a_real_pack')).toBeNull();
    expect(canonicalCreditPackId('')).toBeNull();
  });

  it('exposes nine aliases total (3 canonical + 3 Play + 3 legacy)', () => {
    expect(Object.keys(CREDIT_PACK_ALIASES).sort()).toEqual([
      'analytics_pack_10',
      'analytics_pack_15',
      'analytics_pack_5',
      'credits_10',
      'credits_15',
      'credits_5',
      'ravenscout_extra_analytics_10',
      'ravenscout_extra_analytics_15',
      'ravenscout_extra_analytics_5',
    ]);
  });
});

describe('revenuecat constants — Pro outranks Core in tierFromCustomerInfo', () => {
  beforeEach(() => { jest.resetModules(); });

  function loadPurchases() {
    jest.doMock('react-native-purchases', () => ({
      default: { configure: jest.fn() },
      LOG_LEVEL: { WARN: 'WARN' },
      PURCHASES_ERROR_CODE: {},
    }), { virtual: true });
    return require('../src/lib/purchases');
  }

  it('prefers `pro` over `core` when both entitlements are active', () => {
    const mod = loadPurchases();
    expect(mod.tierFromCustomerInfo({
      entitlements: {
        active: {
          core: { isActive: true, productIdentifier: 'core_monthly_v2' },
          pro: { isActive: true, productIdentifier: 'pro_annual_v2' },
        },
      },
    })).toBe('pro');
  });

  it('returns `core` when only core is active', () => {
    const mod = loadPurchases();
    expect(mod.tierFromCustomerInfo({
      entitlements: { active: { core: { isActive: true, productIdentifier: 'core_annual_v2' } } },
    })).toBe('core');
  });

  it('returns null for empty / missing entitlements (free tier)', () => {
    const mod = loadPurchases();
    expect(mod.tierFromCustomerInfo({ entitlements: { active: {} } })).toBeNull();
    expect(mod.tierFromCustomerInfo(null)).toBeNull();
  });

  it('does NOT classify a credit-pack purchase as Core or Pro', () => {
    const mod = loadPurchases();
    // Credit-pack consumables never produce an active subscription
    // entitlement — their data lives under
    // `customerInfo.nonSubscriptionTransactions`. So a customerInfo
    // payload with only consumable history should be reported as null.
    expect(mod.tierFromCustomerInfo({
      entitlements: { active: {} },
      nonSubscriptionTransactions: [
        { productIdentifier: 'credits_5' },
        { productIdentifier: 'analytics_pack_10' },
      ],
    })).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Regression guard: make sure the pre-cleanup Android product ids
// don't leak back into the source tree.
// ---------------------------------------------------------------------
describe('revenuecat regression guard — old `pro_annual:*` Android ids', () => {
  const FORBIDDEN = [
    'pro_annual:core-monthly-base',
    'pro_annual:core-annual-base',
    'pro_annual:pro-monthly-base',
    'pro_annual:pro-annual-base',
  ];

  function* walk(dir: string): Generator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // Skip node_modules / build / git noise.
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.expo' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === '.metro-cache' ||
        entry.name.startsWith('.')
      ) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walk(full);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        yield full;
      }
    }
  }

  it('does not appear in any source file under /app/frontend', () => {
    const root = path.join(__dirname, '..');
    const guardFile = path.resolve(__filename);
    const offenders: string[] = [];
    for (const file of walk(root)) {
      // Skip this guard file itself — it has to mention the forbidden
      // strings to test for them.
      if (path.resolve(file) === guardFile) continue;
      const text = fs.readFileSync(file, 'utf-8');
      for (const id of FORBIDDEN) {
        if (text.includes(id)) {
          offenders.push(`${file} :: ${id}`);
        }
      }
    }
    if (offenders.length) {
      // Print the actual offenders so triage is easy.
      // eslint-disable-next-line no-console
      console.error('Forbidden product ids found:\n' + offenders.join('\n'));
    }
    expect(offenders).toEqual([]);
  });
});
