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
import {
  CORE_ENTITLEMENT_ID,
  PRO_ENTITLEMENT_ID,
  DEFAULT_OFFERING_ID,
  CREDIT_PACKS_OFFERING_ID,
  SUBSCRIPTION_PACKAGE_IDS,
  CREDIT_PACK_PACKAGE_IDS,
  type SubscriptionPackageId,
  type CreditPackPackageId,
} from '../constants/revenuecat';

// Lazy imports — keep RC out of the JS bundle path until we’re sure
// we’re running on a native build that ships the module.
let PurchasesModule: any = null;
let PURCHASE_LOG_LEVEL: any = null;
let PURCHASES_ERROR_CODE: any = null;
let configured = false;

const RC_API_KEY = (() => {
  // Platform-specific keys take precedence (RevenueCat issues one
  // public SDK key per app — `appl_*` for App Store, `goog_*` for
  // Play Store). We fall back to the legacy single-key var so the
  // env stays backward compatible.
  const ios = (process.env.EXPO_PUBLIC_REVENUECAT_KEY_IOS as string | undefined) || '';
  const android = (process.env.EXPO_PUBLIC_REVENUECAT_KEY_ANDROID as string | undefined) || '';
  const fallback = (process.env.EXPO_PUBLIC_REVENUECAT_KEY as string | undefined) || '';
  if (Platform.OS === 'ios' && ios) return ios;
  if (Platform.OS === 'android' && android) return android;
  return fallback;
})();

// A real RevenueCat public SDK key always starts with `appl_` (iOS) or
// `goog_` (Android). Anything else (placeholder, secret REST key,
// truncated paste) will let `Purchases.configure()` succeed silently
// and then make every subsequent server call surface "Error fetching
// customer data" — the exact symptom users were reporting.
function isValidRcKey(key: string): boolean {
  if (!key) return false;
  if (Platform.OS === 'ios') return key.startsWith('appl_');
  if (Platform.OS === 'android') return key.startsWith('goog_');
  // Web / unknown platforms have no native SDK anyway.
  return false;
}

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
  if (!isValidRcKey(RC_API_KEY)) {
    if (__DEV__) {
      const masked = RC_API_KEY ? `${RC_API_KEY.slice(0, 5)}…` : '<empty>';
      console.warn(
        `[purchases] Invalid RevenueCat key for ${Platform.OS} (got "${masked}"). ` +
        'Expected key starting with "appl_" (iOS) or "goog_" (Android). ' +
        'Skipping configure() — purchases will be unavailable until a valid key is set.',
      );
    }
    return false;
  }
  try {
    if (configured) return true;
    // RC's "ConfigurationError: None of the products registered in the
    // RevenueCat dashboard could be fetched from the [Play|App] Store"
    // is logged at ERROR level by the native SDK and ends up as a red
    // LogBox in dev — even though our wrappers handle it gracefully
    // and downstream UI shows a soft "Plans unavailable" message. The
    // root cause is always a store-side / build-track issue (sideloaded
    // APK, no sandbox tester, license-tester not added, etc.) and not
    // anything we can fix from JS. Lower the SDK log level to WARN so
    // it stops yelling at us in dev. We still surface real purchase
    // errors via the wrapper return values.
    if (PURCHASE_LOG_LEVEL) {
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
// Offerings (preferred purchase path — buy by package, never by raw
// store product id, so a single dashboard change can swap the
// underlying products without an app update).
// ---------------------------------------------------------------------

/** Result shape for the offering helpers. */
export type OfferingResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'unavailable' | 'not_configured' | 'no_offerings' | 'offering_missing' | 'error'; message?: string };

/** Fetch all offerings from RevenueCat. */
export async function getOfferings(): Promise<OfferingResult<any>> {
  const Purchases = loadSdk();
  if (!Purchases) return { ok: false, reason: 'unavailable' };
  if (!configured) {
    const ok = await initPurchases();
    if (!ok) return { ok: false, reason: 'not_configured' };
  }
  try {
    const offerings = await Purchases.getOfferings();
    if (!offerings) return { ok: false, reason: 'no_offerings' };
    return { ok: true, value: offerings };
  } catch (e: any) {
    return { ok: false, reason: 'error', message: e?.message || 'getOfferings_threw' };
  }
}

/** Look up a specific offering by id (defaults to current/default). */
export async function getOffering(offeringId: string): Promise<OfferingResult<any>> {
  const r = await getOfferings();
  if (!r.ok) return r;
  const offerings = r.value;
  const offering =
    offerings?.all?.[offeringId] ||
    (offeringId === DEFAULT_OFFERING_ID ? offerings?.current : null);
  if (!offering) {
    return { ok: false, reason: 'offering_missing', message: `Offering "${offeringId}" not configured in RevenueCat.` };
  }
  return { ok: true, value: offering };
}

/** Index a RevenueCat offering's packages by their `identifier`. */
function indexPackages(offering: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const pkg of offering?.availablePackages || []) {
    if (pkg?.identifier) out[pkg.identifier] = pkg;
  }
  return out;
}

/**
 * Fetch the `default` offering and return its 4 subscription packages
 * (Core/Pro × Monthly/Annual) keyed by canonical package id. Missing
 * packages map to `undefined` — callers should render a friendly
 * "plan unavailable" placeholder rather than crashing.
 */
export async function getDefaultPackages(): Promise<
  OfferingResult<Partial<Record<SubscriptionPackageId, any>>>
> {
  const r = await getOffering(DEFAULT_OFFERING_ID);
  if (!r.ok) return r;
  const idx = indexPackages(r.value);
  const out: Partial<Record<SubscriptionPackageId, any>> = {};
  for (const id of SUBSCRIPTION_PACKAGE_IDS) {
    if (idx[id]) out[id] = idx[id];
  }
  return { ok: true, value: out };
}

/**
 * Fetch the `credit_packs` offering and return its 3 consumable
 * packages keyed by canonical package id.
 */
export async function getCreditPackPackages(): Promise<
  OfferingResult<Partial<Record<CreditPackPackageId, any>>>
> {
  const r = await getOffering(CREDIT_PACKS_OFFERING_ID);
  if (!r.ok) return r;
  const idx = indexPackages(r.value);
  const out: Partial<Record<CreditPackPackageId, any>> = {};
  for (const id of CREDIT_PACK_PACKAGE_IDS) {
    if (idx[id]) out[id] = idx[id];
  }
  return { ok: true, value: out };
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
 * `customerInfo` payload. Pro always outranks Core when both are
 * somehow active simultaneously (e.g. mid-upgrade grace period).
 */
export function tierFromCustomerInfo(customerInfo: any): 'pro' | 'core' | null {
  if (!customerInfo?.entitlements?.active) return null;
  const active = customerInfo.entitlements.active;
  // Canonical entitlement ids first.
  if (active[PRO_ENTITLEMENT_ID]?.isActive ?? active[PRO_ENTITLEMENT_ID]) return 'pro';
  if (active[CORE_ENTITLEMENT_ID]?.isActive ?? active[CORE_ENTITLEMENT_ID]) return 'core';
  // Backwards-compat: older builds used `*_entitlement` ids.
  if (active.pro_entitlement) return 'pro';
  if (active.core_entitlement) return 'core';
  // Last-resort fallback for legacy configs that used product ids
  // as entitlement keys. Pro outranks Core when both somehow match.
  let foundCore = false;
  for (const key of Object.keys(active)) {
    const lower = key.toLowerCase();
    if (lower.startsWith('pro')) return 'pro';
    if (lower.startsWith('core')) foundCore = true;
  }
  return foundCore ? 'core' : null;
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
