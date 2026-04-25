/**
 * Raven Scout — plan-tier capability config.
 *
 * Single source of truth for "what can this user do?" decisions tied
 * to their subscription tier. Today this gates:
 *   - image upload + analysis access
 *   - which MapTiler base styles are selectable
 *
 * Canonical plan IDs:
 *   - 'free'   — entry tier (the backend sometimes labels this "trial";
 *                we normalize so the rest of the app never has to care)
 *   - 'core'   — paid: $7.99 / $79.99
 *   - 'pro'    — paid: $14.99 / $149.99
 *
 * Canonical map style IDs are the same ids used in the map registry
 * (`src/constants/mapStyles.ts`). Note: those are written in camelCase
 * (`satelliteHybrid`, `satellitePlain`) for historical compatibility
 * with the persisted AsyncStorage values; the spec's snake_case
 * naming maps 1:1:
 *
 *   spec id             →  runtime id
 *   ---------------------------------
 *   outdoor             →  outdoor
 *   satellite_plain     →  satellitePlain
 *   satellite_hybrid    →  satelliteHybrid
 *   landscape           →  landscape
 *   topo                →  topo
 *
 * Adding a new tier capability: extend the matrix below — do NOT
 * sprinkle tier checks elsewhere.
 */
import type { RavenScoutMapStyleId } from './mapStyles';

export type PlanId = 'free' | 'core' | 'pro';

/**
 * Normalize anything the rest of the app might hand us — null,
 * undefined, the legacy "trial" label, or a typo — into a known
 * PlanId. Defaults to 'free' so an unknown user never accidentally
 * gets paid features.
 */
export function normalizePlanId(input: string | null | undefined): PlanId {
  if (typeof input !== 'string') return 'free';
  const v = input.toLowerCase().trim();
  if (v === 'pro') return 'pro';
  if (v === 'core') return 'core';
  // 'free' and the legacy 'trial' both map to free.
  if (v === 'free' || v === 'trial') return 'free';
  // Unknown / future tiers: fail closed.
  return 'free';
}

/**
 * Plan → ordered list of allowed map style ids. The order here is
 * the order the switcher renders, so the user always sees a
 * deliberate progression (Outdoor first, Topo last).
 *
 * Free intentionally has NO map styles — Free users get the upload
 * & analysis workflow only; the map style switcher is hidden and an
 * upsell prompt takes its place.
 */
const PLAN_MAP_STYLES: Record<PlanId, ReadonlyArray<RavenScoutMapStyleId>> = {
  free: [],
  core: ['outdoor', 'satellitePlain', 'topo'],
  pro: ['outdoor', 'landscape', 'satelliteHybrid', 'satellitePlain', 'topo'],
};

/**
 * Plan → image upload / analysis access. Every paid AND free tier
 * can use the upload workflow today; the actual usage cap is enforced
 * by the backend's per-tier monthly counter, not here.
 */
const PLAN_UPLOAD_ACCESS: Record<PlanId, boolean> = {
  free: true,
  core: true,
  pro: true,
};

/**
 * Returns the ordered list of map style ids available to the given
 * plan. Always returns a fresh copy so callers can safely mutate /
 * filter without affecting the canonical config.
 */
export function getAllowedMapStylesForPlan(
  planId: string | null | undefined,
): RavenScoutMapStyleId[] {
  const plan = normalizePlanId(planId);
  return [...PLAN_MAP_STYLES[plan]];
}

/**
 * True when the given plan is allowed to render the given map style.
 * Use this for both "should I show this chip" and "is the persisted
 * preference still legal" checks.
 */
export function canUseMapStyle(
  planId: string | null | undefined,
  styleId: string | null | undefined,
): boolean {
  if (typeof styleId !== 'string') return false;
  const plan = normalizePlanId(planId);
  return PLAN_MAP_STYLES[plan].includes(styleId as RavenScoutMapStyleId);
}

/**
 * True when the given plan can upload images for AI analysis. The
 * per-tier monthly quota is enforced server-side; this gate is only
 * for "is the upload UI even available to this account".
 */
export function canUploadImages(
  planId: string | null | undefined,
): boolean {
  return PLAN_UPLOAD_ACCESS[normalizePlanId(planId)];
}

/**
 * Resolve a persisted style id against the user's plan. If the
 * persisted id is allowed, return it. Otherwise fall back to the
 * first allowed style for the plan (graceful downgrade — e.g. a
 * Pro user who picked "satelliteHybrid" then downgraded to Core
 * lands on "outdoor" instead of an empty map).
 *
 * Returns null when the plan has zero allowed styles (Free) — the
 * UI should hide the switcher in that case.
 */
export function resolveAllowedStyleForPlan(
  planId: string | null | undefined,
  persistedStyleId: string | null | undefined,
): RavenScoutMapStyleId | null {
  const allowed = getAllowedMapStylesForPlan(planId);
  if (allowed.length === 0) return null;
  if (typeof persistedStyleId === 'string' && allowed.includes(persistedStyleId as RavenScoutMapStyleId)) {
    return persistedStyleId as RavenScoutMapStyleId;
  }
  return allowed[0];
}
