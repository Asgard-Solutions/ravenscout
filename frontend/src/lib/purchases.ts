/**
 * Raven Scout — RevenueCat purchases wrapper.
 *
 * Centralises every interaction with `react-native-purchases` so the
 * rest of the app never imports the SDK directly. The wrapper:
 *
 *   - Loads the SDK lazily and tolerates environments where the
 *     native module is unavailable (Expo Go, web preview, jest).
 *   - Exposes a tiny, opinionated API:
 *       initPurchases() / identifyUser() / logoutPurchases()
 *       purchaseProduct() / purchasePackage()
 *       restorePurchases() / getCustomerInfo()
 *   - Returns a structured result object that distinguishes between
 *     a user-initiated cancel, a store error, and a successful
 *     purchase, so callers can render the right UX without
 *     introspecting RC error codes themselves.
 *   - Surfaces the platform transaction id (StoreKit / Play
 *     billing) that the backend uses as the idempotency key for
 *     `/api/purchases/extra-credits`.
 *
 * The SDK is platform-native and *cannot* run inside Expo Go or the
 * Metro web preview. In those contexts every method resolves with
 * `available: false` so callers can transparently fall back to a
 * deterministic preview-only path.
 */

import { Platform } from 'react-native';

// Lazy imports — keep RC out of the JS bundle path until we’re sure
// we’re running on a native build that ships the module.
let PurchasesModule: any = null;
let PURCHASE_LOG_LEVEL: any = null;
let PURCHASES_ERROR_CODE: any = null;
let configured = false;

const RC_API_KEY =
  (process.env.EXPO_PUBLIC_REVENUECAT_KEY as string | undefined) || '';

function loadSdk(): any | null {
  if (PurchasesModule) return PurchasesModule;
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    PurchasesModule = mod.default || mod;
    PURCHASE_LOG_LEVEL = mod.LOG_LEVEL;
    PURCHASES_ERROR_CODE = mod.PURCHASES_ERROR_CODE;
    return PurchasesModule;
  } catch (e) {
    // Expo Go without the dev-client, jest, or any other env where
    // the native module is missing.
    return null;
  }
}

export function isPurchasesAvailable(): boolean {
  return !!loadSdk();
}

// ---------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------
export type PurchaseStatus =
  | 'success'
  | 'cancelled'
  | 'unavailable'
  | 'error';

export interface PurchaseResult {
  status: PurchaseStatus;
  /** Platform transaction id (StoreKit `transaction_id`, Play
   *  `purchaseToken`, or RC `revenueCatId`). Use as idempotency key. */
  transactionId?: string;
  /** Raw RC `customerInfo` for callers that need to inspect entitlements. */
  customerInfo?: any;
  /** Human-readable error message when status === 'error'. */
  message?: string;
}

// ---------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------
export async function initPurchases(opts?: { appUserId?: string }): Promise<boolean> {
  const Purchases = loadSdk();
  if (!Purchases) return false;
  if (!RC_API_KEY) {
    if (__DEV__) {
      console.warn('[purchases] EXPO_PUBLIC_REVENUECAT_KEY is empty — skipping configure()');
    }
    return false;
  }
  try {
    if (configured) return true;
    if (PURCHASE_LOG_LEVEL && __DEV__) {
      try { Purchases.setLogLevel(PURCHASE_LOG_LEVEL.WARN); } catch { /* noop */ }
    }
    Purchases.configure({
      apiKey: RC_API_KEY,
      ...(opts?.appUserId ? { appUserID: opts.appUserId } : {}),
    });
    configured = true;
    return true;
  } catch (e: any) {
    console.warn('[purchases] configure failed:', e?.message || e);
    return false;
  }
}

export async function identifyUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  const Purchases = loadSdk();
  if (!Purchases) return false;
  try {
    if (!configured) await initPurchases({ appUserId: userId });
    if (typeof Purchases.logIn === 'function') {
      await Purchases.logIn(userId);
    }
    return true;
  } catch (e: any) {
    console.warn('[purchases] logIn failed:', e?.message || e);
    return false;
  }
}

export async function logoutPurchases(): Promise<void> {
  const Purchases = loadSdk();
  if (!Purchases) return;
  try {
    if (typeof Purchases.logOut === 'function') {
      await Purchases.logOut();
    }
  } catch (e) { /* anonymous already — ignore */ }
}

// ---------------------------------------------------------------------
// Customer / entitlements
// ---------------------------------------------------------------------
export async function getCustomerInfo(): Promise<any | null> {
  const Purchases = loadSdk();
  if (!Purchases) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (e: any) {
    console.warn('[purchases] getCustomerInfo failed:', e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function isCancelError(err: any): boolean {
  if (!err) return false;
  if (err.userCancelled === true) return true;
  if (PURCHASES_ERROR_CODE && err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return true;
  // RC also reports cancellations via string codes on RN.
  const code = String(err.code || '').toUpperCase();
  if (code.includes('PURCHASE_CANCELLED')) return true;
  return false;
}

function extractTransactionId(customerInfo: any, productId?: string): string | undefined {
  if (!customerInfo) return undefined;

  // Non-subscription transactions (consumable packs).
  const nonSubs: any[] = customerInfo.nonSubscriptionTransactions || [];
  if (productId) {
    const match = [...nonSubs]
      .reverse()
      .find((t) => t?.productIdentifier === productId);
    if (match) {
      return (
        match.transactionIdentifier ||
        match.storeTransactionIdentifier ||
        match.revenueCatId ||
        match.purchaseDate
      );
    }
  }
  if (nonSubs.length > 0) {
    const last = nonSubs[nonSubs.length - 1];
    return (
      last.transactionIdentifier ||
      last.storeTransactionIdentifier ||
      last.revenueCatId ||
      last.purchaseDate
    );
  }

  // Subscriptions: prefer originalPurchaseDate / latestExpirationDate as
  // a stable per-user marker.
  const subInfo = customerInfo.allPurchasedProductIdentifiers || [];
  if (subInfo.length > 0) {
    return customerInfo.originalAppUserId
      ? `sub:${customerInfo.originalAppUserId}:${subInfo[subInfo.length - 1]}`
      : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------
// Purchase flows
// ---------------------------------------------------------------------

/**
 * Purchase a product by its store identifier (e.g. an extra-credit
 * pack like `ravenscout_extra_analytics_5` or a subscription product
 * like `pro_monthly`). RevenueCat fetches the product metadata for
 * us behind the scenes.
 */
export async function purchaseProduct(productId: string): Promise<PurchaseResult> {
  const Purchases = loadSdk();
  if (!Purchases) return { status: 'unavailable' };
  if (!configured) await initPurchases();

  try {
    let customerInfo: any;

    if (typeof Purchases.purchaseProduct === 'function') {
      const res = await Purchases.purchaseProduct(productId);
      customerInfo = res?.customerInfo || res;
    } else if (typeof Purchases.getProducts === 'function' && typeof Purchases.purchaseStoreProduct === 'function') {
      // Fallback: fetch the StoreProduct first, then purchase.
      const products = await Purchases.getProducts([productId]);
      if (!products || products.length === 0) {
        return { status: 'error', message: `Product not available: ${productId}` };
      }
      const res = await Purchases.purchaseStoreProduct(products[0]);
      customerInfo = res?.customerInfo || res;
    } else {
      return { status: 'unavailable' };
    }

    return {
      status: 'success',
      transactionId: extractTransactionId(customerInfo, productId),
      customerInfo,
    };
  } catch (e: any) {
    if (isCancelError(e)) return { status: 'cancelled' };
    return { status: 'error', message: e?.message || 'Purchase failed' };
  }
}

/**
 * Purchase a pre-fetched RevenueCat package (when offerings are
 * already loaded). Preferred for subscription paywalls because the
 * `Package` object carries `presentedOfferingContext` for analytics.
 */
export async function purchasePackage(pkg: any): Promise<PurchaseResult> {
  const Purchases = loadSdk();
  if (!Purchases) return { status: 'unavailable' };
  if (!configured) await initPurchases();
  try {
    const res = await Purchases.purchasePackage(pkg);
    const customerInfo = res?.customerInfo || res;
    return {
      status: 'success',
      transactionId: extractTransactionId(customerInfo, pkg?.product?.identifier),
      customerInfo,
    };
  } catch (e: any) {
    if (isCancelError(e)) return { status: 'cancelled' };
    return { status: 'error', message: e?.message || 'Purchase failed' };
  }
}

/**
 * Restore previously-purchased subscriptions and consumables linked
 * to the current Apple ID / Google Account. Returns the resulting
 * `customerInfo` so callers can sync entitlements with the backend.
 */
export async function restorePurchases(): Promise<{
  status: 'success' | 'unavailable' | 'error';
  customerInfo?: any;
  message?: string;
}> {
  const Purchases = loadSdk();
  if (!Purchases) return { status: 'unavailable' };
  if (!configured) await initPurchases();
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { status: 'success', customerInfo };
  } catch (e: any) {
    return { status: 'error', message: e?.message || 'Restore failed' };
  }
}

/**
 * Convenience helper used by the subscription paywall: returns the
 * highest-tier active subscription (`pro` > `core` > `null`) from a
 * `customerInfo` payload.
 */
export function tierFromCustomerInfo(customerInfo: any): 'pro' | 'core' | null {
  if (!customerInfo?.entitlements?.active) return null;
  const active = customerInfo.entitlements.active;
  if (active.pro || active.pro_entitlement) return 'pro';
  if (active.core || active.core_entitlement) return 'core';
  // Some configs use the raw product id as the entitlement id.
  for (const key of Object.keys(active)) {
    if (key.startsWith('pro')) return 'pro';
    if (key.startsWith('core')) return 'core';
  }
  return null;
}

/**
 * Build the entitlements payload shape that the backend
 * `/api/subscription/sync-revenuecat` endpoint expects.
 */
export function entitlementsPayload(customerInfo: any): Record<string, any> {
  if (!customerInfo?.entitlements?.active) return {};
  const out: Record<string, any> = {};
  for (const [id, ent] of Object.entries<any>(customerInfo.entitlements.active)) {
    out[id] = {
      isActive: !!ent?.isActive,
      productIdentifier: ent?.productIdentifier || '',
      expirationDate: ent?.expirationDate || null,
    };
  }
  return out;
}
