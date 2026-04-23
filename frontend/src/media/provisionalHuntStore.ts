// Raven Scout — Provisional (hot-cache) hunt store.
//
// A tiny single-entry AsyncStorage bucket for the MOST RECENT
// just-analyzed hunt. Exists as a durable tier-0.5 fallback between
// the in-memory session store (which is lost on tab reshuffle,
// bfcache, or mobile memory pressure) and the full analysisStore
// (which can fail on web previews with no writable filesystem and
// on mobile Chrome with a ~5MB localStorage cap).
//
// IMPORTANT: unlike analysisStore, this bucket is ALLOWED to hold
// base64 display URIs — that's what makes it a usable fallback
// when MediaStore is unavailable. The payload is soft-capped and
// rotated to exactly 1 entry so the store never grows.
//
// Read precedence in hydrateHuntResult:
//   1. in-memory singleton   (fastest, session-scoped)
//   2. provisional store     (this file — survives reload/bfcache)
//   3. analysisStore          (full history, base64-stripped)
//   4. legacy v1/v2 migration
//
// A provisional record is UPGRADED to an analysisStore record by
// the saveHunt pipeline whenever the real persistence succeeds,
// after which the provisional entry is cleared.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedHuntAnalysis, RuntimeHunt } from './types';

export const PROVISIONAL_HUNT_KEY = 'raven_provisional_hunt_v1';

/**
 * Hard ceiling on the serialized provisional payload. Web
 * AsyncStorage is localStorage-backed with a ~5MB per-origin cap,
 * and mobile Chrome's JS heap is tight — we'd rather skip the
 * write (and log why) than OOM the runtime or get a silent
 * QuotaExceededError. Anything above this cap falls back to a
 * lightweight, image-less entry so /results can still hydrate.
 */
export const PROVISIONAL_SIZE_CAP_BYTES = 3 * 1024 * 1024; // 3MB

export interface ProvisionalHuntEntry {
  schema: 'raven.provisional.v1';
  huntId: string;
  createdAt: string;
  /** The full analysis record (includes metadata, analysisContext, etc.). */
  analysis: PersistedHuntAnalysis;
  /**
   * imageId -> base64 data URI. Keyed by the SAME provisional /
   * persisted imageIds used in `analysis.mediaRefs`. May be empty
   * when the full-size entry exceeded PROVISIONAL_SIZE_CAP_BYTES —
   * see `mode` for which path was taken.
   */
  displayUris: Record<string, string>;
  /**
   * Approximate size of the serialized entry — logged on write so
   * quota failures surface with context rather than as mysterious
   * "hunt_not_found".
   */
  approxBytes: number;
  /**
   * Which payload tier was written:
   *   'full'       — analysis + images (preferred, used when under cap)
   *   'lite'       — analysis only, NO images (when full would exceed
   *                  the quota cap; /results will render placeholders)
   */
  mode: 'full' | 'lite';
}

function approxSize(s: string): number {
  return s ? s.length : 0;
}

export async function writeProvisionalHunt(
  huntId: string,
  analysis: PersistedHuntAnalysis,
  displayUris: Record<string, string>,
): Promise<{ ok: boolean; bytes: number; mode: 'full' | 'lite'; error?: string }> {
  // Build the full entry WITHOUT displayUris first — that part is
  // tiny and its serialized size is our floor regardless of image
  // payload. We stringify exactly ONCE per candidate payload to
  // avoid double-allocation on low-memory phones (1.8MB base64 x2
  // concurrent strings was OOMing mobile Chrome).
  const liteEntry: ProvisionalHuntEntry = {
    schema: 'raven.provisional.v1',
    huntId,
    createdAt: new Date().toISOString(),
    analysis,
    displayUris: {},
    approxBytes: 0,
    mode: 'lite',
  };

  // Probe the full payload size cheaply: the lite entry stringified,
  // plus the raw sum of displayUris base64 lengths (close enough;
  // we don't need byte-accurate here).
  let liteStr: string;
  try {
    liteStr = JSON.stringify(liteEntry);
  } catch (err: any) {
    return { ok: false, bytes: 0, mode: 'lite', error: err?.message || String(err) };
  }
  const liteBytes = approxSize(liteStr);
  const imagesBytes = Object.values(displayUris).reduce(
    (acc, v) => acc + (v ? v.length : 0),
    0,
  );
  const fullProbe = liteBytes + imagesBytes;

  // Prefer the FULL entry when it's safely under cap.
  if (fullProbe <= PROVISIONAL_SIZE_CAP_BYTES) {
    const fullEntry: ProvisionalHuntEntry = {
      ...liteEntry,
      displayUris,
      approxBytes: fullProbe,
      mode: 'full',
    };
    let fullStr: string;
    try {
      fullStr = JSON.stringify(fullEntry);
    } catch (err: any) {
      // Extremely unlikely (circular data or host limits). Fall
      // through to the lite write — better to have analysis text
      // on /results than nothing.
      return await writeLite(huntId, liteEntry, liteStr, err?.message);
    }
    try {
      await AsyncStorage.setItem(PROVISIONAL_HUNT_KEY, fullStr);
      return { ok: true, bytes: fullStr.length, mode: 'full' };
    } catch (err: any) {
      // Quota exceeded or adapter failure — fall back to lite.
      return await writeLite(huntId, liteEntry, liteStr, err?.message);
    }
  }

  // Full payload would exceed the cap — don't even try; write lite.
  return await writeLite(
    huntId,
    liteEntry,
    liteStr,
    `full_probe_exceeds_cap: ${fullProbe} > ${PROVISIONAL_SIZE_CAP_BYTES}`,
  );
}

async function writeLite(
  huntId: string,
  liteEntry: ProvisionalHuntEntry,
  liteStr: string,
  upstreamReason?: string,
): Promise<{ ok: boolean; bytes: number; mode: 'full' | 'lite'; error?: string }> {
  void huntId; // used for log context at caller
  const finalize = (e: ProvisionalHuntEntry, s: string) => ({
    entry: e,
    str: s.slice(0, s.length), // no-op; explicit reference
  });
  const withBytes = { ...liteEntry, approxBytes: liteStr.length, mode: 'lite' as const };
  const { str } = finalize(withBytes, JSON.stringify(withBytes));
  try {
    await AsyncStorage.setItem(PROVISIONAL_HUNT_KEY, str);
    return {
      ok: true,
      bytes: str.length,
      mode: 'lite',
      error: upstreamReason,
    };
  } catch (err: any) {
    return {
      ok: false,
      bytes: str.length,
      mode: 'lite',
      error: `${upstreamReason ?? ''} | lite_write_failed: ${err?.message || String(err)}`.trim(),
    };
  }
}

export async function readProvisionalHunt(
  huntId: string,
): Promise<ProvisionalHuntEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(PROVISIONAL_HUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== 'raven.provisional.v1') return null;
    if (parsed.huntId !== huntId) return null;
    return parsed as ProvisionalHuntEntry;
  } catch {
    return null;
  }
}

export async function clearProvisionalHunt(matchingHuntId?: string): Promise<void> {
  try {
    if (matchingHuntId) {
      const raw = await AsyncStorage.getItem(PROVISIONAL_HUNT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.huntId !== matchingHuntId) return;
    }
    await AsyncStorage.removeItem(PROVISIONAL_HUNT_KEY);
  } catch {
    /* no-op */
  }
}

/** Adapt a provisional entry into a RuntimeHunt for hydration use. */
export function provisionalToRuntime(entry: ProvisionalHuntEntry): RuntimeHunt {
  return {
    ...entry.analysis,
    displayUris: entry.displayUris,
  };
}

/**
 * Fast provisional seat used by the analyze-hunt flow — runs AFTER
 * the LLM response and BEFORE navigation to /results. Guarantees
 * that even if the setup.tsx component is torn down during later
 * work (mobile Chrome backgrounding, route remount, SSR hydration
 * churn), /results can still find and render the hunt.
 *
 * This is a deliberately minimal write: analysis + primary image
 * displayUri only. The full persistence pipeline (saveHunt) is run
 * separately and asynchronously — if it succeeds, it clears this
 * entry; if it fails, the entry stays in place as the fallback.
 */
export async function seatProvisionalFromAnalyze(args: {
  huntId: string;
  analysisResult: any;
  metadata: Parameters<typeof import('./huntSerialization').extractMetadata>[0];
  base64Images: string[];
  primaryMediaIndex: number;
  tier: 'trial' | 'core' | 'pro' | null | undefined;
  analysisContext: any;
  locationCoords?: { lat: number; lon: number } | null;
}): Promise<{ ok: boolean; bytes: number; mode: 'full' | 'lite'; error?: string }> {
  const {
    buildPersistedAnalysis,
    extractMetadata,
  } = await import('./huntSerialization');
  const { buildInitialAnalysisContext } = await import('../utils/analysisContext');
  const { resolveStorageStrategy } = await import('./storageStrategy');

  const strategy = resolveStorageStrategy({
    tier: args.tier ?? null,
    platform: 'web', // seat is platform-agnostic; strategy is a hint on the record
  });
  const metadata = extractMetadata(args.metadata);
  const mediaRefs = args.base64Images.map((_b, i) => `provisional-${args.huntId}-${i}`);
  const sessionUris: Record<string, string> = {};
  args.base64Images.forEach((b64, i) => {
    if (b64) sessionUris[mediaRefs[i]] = b64;
  });
  const primaryIdx = Math.max(
    0,
    Math.min(mediaRefs.length - 1, args.primaryMediaIndex || 0),
  );
  const primaryRef = mediaRefs[primaryIdx] ?? null;
  const analysis = buildPersistedAnalysis({
    id: args.huntId,
    metadata,
    analysis: args.analysisResult,
    mediaRefs,
    primaryMediaRef: primaryRef,
    storageStrategy: strategy.strategy,
    analysisContext: buildInitialAnalysisContext({
      primaryMediaRef: primaryRef,
      ctxInput: args.analysisContext,
      fallbackGps: args.locationCoords ?? null,
    }),
  });
  return await writeProvisionalHunt(args.huntId, analysis, sessionUris);
}

