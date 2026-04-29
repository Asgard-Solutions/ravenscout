/**
 * Raven Scout — RevenueCat configuration constants.
 *
 * Single source of truth for offering / package / entitlement
 * identifiers shared across the paywall, the credit-pack purchase
 * flow, the RevenueCat wrapper, and the backend sync code. ANY
 * change to the RC dashboard structure should be reflected here
 * FIRST and only here — no other file in `src/` is allowed to
 * hard-code these strings.
 *
 * Keep in sync with the matching constants in
 *   /app/backend/server.py  (REVENUECAT_ENTITLEMENT_MAP,
 *                            EXTRA_CREDIT_PACKS, _PACK_ID_ALIASES)
 *
 * RevenueCat dashboard reference:
 *   Offerings:
 *     - default       (subscriptions: Core / Pro × Monthly / Annual)
 *     - credit_packs  (consumables: 5 / 10 / 15 hunt-analytics packs)
 *   Entitlements:
 *     - core
 *     - pro
 */

// ---------------------------------------------------------------------
// Offering IDs
// ---------------------------------------------------------------------
export const DEFAULT_OFFERING_ID = 'default';
export const CREDIT_PACKS_OFFERING_ID = 'credit_packs';

// ---------------------------------------------------------------------
// Subscription package identifiers (under the `default` offering)
// ---------------------------------------------------------------------
export const CORE_MONTHLY_PACKAGE_ID = 'core_monthly';
export const CORE_ANNUAL_PACKAGE_ID = 'core_annual';
export const PRO_MONTHLY_PACKAGE_ID = 'pro_monthly';
export const PRO_ANNUAL_PACKAGE_ID = 'pro_annual';

export const SUBSCRIPTION_PACKAGE_IDS = [
  CORE_MONTHLY_PACKAGE_ID,
  CORE_ANNUAL_PACKAGE_ID,
  PRO_MONTHLY_PACKAGE_ID,
  PRO_ANNUAL_PACKAGE_ID,
] as const;

export type SubscriptionPackageId = (typeof SUBSCRIPTION_PACKAGE_IDS)[number];

// ---------------------------------------------------------------------
// Credit-pack package identifiers (under the `credit_packs` offering)
// ---------------------------------------------------------------------
export const CREDITS_5_PACKAGE_ID = 'credits_5';
export const CREDITS_10_PACKAGE_ID = 'credits_10';
export const CREDITS_15_PACKAGE_ID = 'credits_15';

export const CREDIT_PACK_PACKAGE_IDS = [
  CREDITS_5_PACKAGE_ID,
  CREDITS_10_PACKAGE_ID,
  CREDITS_15_PACKAGE_ID,
] as const;

export type CreditPackPackageId = (typeof CREDIT_PACK_PACKAGE_IDS)[number];

/** How many hunt-analytics credits each pack grants. */
export const CREDIT_PACK_CREDITS: Record<CreditPackPackageId, number> = {
  [CREDITS_5_PACKAGE_ID]: 5,
  [CREDITS_10_PACKAGE_ID]: 10,
  [CREDITS_15_PACKAGE_ID]: 15,
};

/** User-facing label for each credit pack. */
export const CREDIT_PACK_LABEL: Record<CreditPackPackageId, string> = {
  [CREDITS_5_PACKAGE_ID]: '5 Hunt Analytics Credits',
  [CREDITS_10_PACKAGE_ID]: '10 Hunt Analytics Credits',
  [CREDITS_15_PACKAGE_ID]: '15 Hunt Analytics Credits',
};

// ---------------------------------------------------------------------
// Entitlement IDs (must match the RevenueCat dashboard exactly)
// ---------------------------------------------------------------------
export const CORE_ENTITLEMENT_ID = 'core';
export const PRO_ENTITLEMENT_ID = 'pro';

/**
 * Pro outranks Core. The paywall, profile screen, and feature gates
 * always check for Pro first and fall back to Core. Anything not
 * listed maps to the implicit "free" tier.
 */
export const TIER_PRIORITY = [PRO_ENTITLEMENT_ID, CORE_ENTITLEMENT_ID] as const;

// ---------------------------------------------------------------------
// Tier label / package-id mapping
// ---------------------------------------------------------------------
export type Tier = 'core' | 'pro';
export type BillingCycle = 'monthly' | 'annual';

/** Return the RC package id for a given tier × billing cycle. */
export function packageIdFor(tier: Tier, cycle: BillingCycle): SubscriptionPackageId {
  if (tier === 'pro') return cycle === 'annual' ? PRO_ANNUAL_PACKAGE_ID : PRO_MONTHLY_PACKAGE_ID;
  return cycle === 'annual' ? CORE_ANNUAL_PACKAGE_ID : CORE_MONTHLY_PACKAGE_ID;
}

// ---------------------------------------------------------------------
// Cross-platform credit-pack product alias lookup.
//
// The backend is the source of truth for credit-grant amounts (it
// resolves any of these aliases on its own), but the client uses
// this map to render the right pack label when it only has the raw
// store product id (e.g. when restoring a purchase made on a
// different device).
// ---------------------------------------------------------------------
export const CREDIT_PACK_ALIASES: Record<string, CreditPackPackageId> = {
  // Canonical RC package ids (also the iOS App Store product ids).
  credits_5: CREDITS_5_PACKAGE_ID,
  credits_10: CREDITS_10_PACKAGE_ID,
  credits_15: CREDITS_15_PACKAGE_ID,
  // Google Play consumable product ids.
  analytics_pack_5: CREDITS_5_PACKAGE_ID,
  analytics_pack_10: CREDITS_10_PACKAGE_ID,
  analytics_pack_15: CREDITS_15_PACKAGE_ID,
  // Legacy product ids still honoured by the backend for any in-flight
  // restores from older builds.
  ravenscout_extra_analytics_5: CREDITS_5_PACKAGE_ID,
  ravenscout_extra_analytics_10: CREDITS_10_PACKAGE_ID,
  ravenscout_extra_analytics_15: CREDITS_15_PACKAGE_ID,
};

/** Resolve any platform-specific product id to its canonical pack id. */
export function canonicalCreditPackId(anyId: string): CreditPackPackageId | null {
  return CREDIT_PACK_ALIASES[anyId] ?? null;
}
