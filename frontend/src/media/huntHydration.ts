// Raven Scout — HuntHydration service.
//
// Joins the AnalysisStore + MediaStore into a UI-facing shape.
// Everything the results/history screens consume goes through this.
//
// Resolution order when looking up a hunt:
//   1) In-memory session cache (latest analysis + display URIs)
//   2) AnalysisStore (raven_analysis_v1)
//   3) Legacy stores (hunt_history, current_hunt) — migrated to v3 on read

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AnalysisContext,
  HydratedHuntResult,
  HydratedMedia,
  LegacyV1HuntRecord,
  LegacyV2HuntRecord,
  MediaAsset,
  PersistedHuntAnalysis,
  RuntimeHunt,
  StorageStrategy,
} from './types';
import {
  loadAnalysis,
  saveAnalysis,
  LEGACY_CURRENT_HUNT_KEY,
  LEGACY_HUNT_HISTORY_KEY,
} from './analysisStore';
import {
  getMedia,
  resolveAsset,
  saveMediaBatch,
  listMediaForHunt,
} from './mediaStore';
import { indexMediaBatch } from './mediaIndex';
import {
  buildPersistedAnalysis,
  extractMetadata,
  isLegacyV1Hunt,
  isLegacyV2Hunt,
} from './huntSerialization';
import {
  getCurrentHuntEntry,
  setCurrentHunt,
} from '../store/currentHuntStore';
import {
  clearProvisionalHunt,
  provisionalToRuntime,
  readProvisionalHunt,
  writeProvisionalHunt,
} from './provisionalHuntStore';
import { resolveStorageStrategy, type Tier } from './storageStrategy';
import { Platform } from 'react-native';
import { logClientEvent } from '../utils/clientLog';

// ------------------------------ Hydration ------------------------------

async function hydrateMediaRefs(
  mediaRefs: string[],
  sessionUris: Record<string, string> | undefined,
): Promise<{
  media: HydratedMedia[];
  missing: number;
  fromSessionCache: boolean;
}> {
  let fromSessionCache = false;
  let missing = 0;
  const media: HydratedMedia[] = [];
  for (const imageId of mediaRefs) {
    // 1) session cache hit (fresh base64 still in memory from this session)
    const sessionUri = sessionUris?.[imageId];
    if (sessionUri) {
      fromSessionCache = true;
      // Wrap as a lightweight asset-like record for UI use.
      media.push({
        asset: {
          imageId, role: 'primary',
          storageType: 'data-uri-legacy', uri: sessionUri,
          mime: 'image/jpeg', createdAt: new Date().toISOString(),
        },
        displayUri: sessionUri,
        resolved: true,
      });
      continue;
    }

    const asset = await getMedia(imageId);
    if (!asset) {
      missing++;
      media.push({
        asset: {
          imageId, role: 'primary',
          storageType: 'local-file', uri: '', mime: 'image/jpeg',
          createdAt: new Date().toISOString(),
        },
        displayUri: null,
        resolved: false,
      });
      continue;
    }
    const uri = await resolveAsset(asset);
    if (!uri) missing++;
    media.push({
      asset,
      displayUri: uri,
      resolved: !!uri,
    });
  }
  return { media, missing, fromSessionCache };
}

/** Build a HydratedHuntResult from an analysis record + session hints. */
export async function hydrateRuntimeHuntFromAnalysis(
  analysis: PersistedHuntAnalysis,
  sessionUris?: Record<string, string>,
  extraWarning?: string | null,
): Promise<HydratedHuntResult> {
  const { media, missing, fromSessionCache } = await hydrateMediaRefs(
    analysis.mediaRefs || [],
    sessionUris,
  );
  const primary = analysis.primaryMediaRef
    ? media.find(m => m.asset.imageId === analysis.primaryMediaRef)
    : media[0];

  const warnings: string[] = [];
  if (extraWarning) warnings.push(extraWarning);
  if (missing > 0 && analysis.mediaRefs.length > 0) {
    warnings.push('Some images could not be loaded. Analysis is still available.');
  }

  // Defensive: if the saved analysisContext refers to an imageId that
  // no longer resolves to any media, downgrade it to `stale`. The UI
  // layer can still use `analysisContext.gps` as authoritative but
  // should warn the user / prompt re-analysis.
  let ctx: AnalysisContext | null = analysis.analysisContext ?? null;
  if (ctx && ctx.imageId) {
    const stillPresent = media.some(m => m.asset.imageId === ctx!.imageId);
    if (!stillPresent && ctx.overlayStatus !== 'stale') {
      ctx = { ...ctx, overlayStatus: 'stale' };
    }
  }

  return {
    id: analysis.id,
    createdAt: analysis.createdAt,
    metadata: analysis.metadata,
    analysis: analysis.analysis,
    media,
    primaryMedia: primary || null,
    primaryDisplayUri: primary?.displayUri || null,
    displayUris: media.map(m => m.displayUri),
    missingMediaCount: missing,
    fromSessionCache,
    warning: warnings.length ? warnings.join(' ') : null,
    analysisContext: ctx,
  };
}

// ------------------------------ Loader with migration ------------------------------

async function migrateV1ToV3(
  legacy: LegacyV1HuntRecord,
  tier: Tier | null | undefined,
): Promise<PersistedHuntAnalysis> {
  const strategy = resolveStorageStrategy({ tier: tier ?? null, platform: Platform.OS });
  const base64Images: string[] = Array.isArray(legacy.mapImages) && legacy.mapImages.length
    ? (legacy.mapImages.filter(Boolean) as string[])
    : (legacy.mapImage ? [legacy.mapImage] : []);

  const assets = await saveMediaBatch(base64Images, {
    tier, platform: Platform.OS, huntId: legacy.id,
  });

  const metadata = extractMetadata({
    species: legacy.species,
    speciesName: legacy.speciesName,
    date: legacy.date,
    timeWindow: legacy.timeWindow,
    windDirection: legacy.windDirection,
    temperature: legacy.temperature,
    propertyType: legacy.propertyType,
    region: legacy.region,
    weatherData: legacy.weatherData,
    locationCoords: legacy.locationCoords,
  });

  const primaryIdx = Math.max(0, Math.min(assets.length - 1, legacy.primaryMapIndex || 0));
  const analysis = buildPersistedAnalysis({
    id: legacy.id,
    createdAt: legacy.createdAt,
    metadata,
    analysis: legacy.result,
    mediaRefs: assets.map(a => a.imageId),
    primaryMediaRef: assets[primaryIdx]?.imageId || null,
    storageStrategy: strategy.strategy,
  });
  await saveAnalysis(analysis);
  logClientEvent({
    event: 'legacy_hunt_migrated',
    data: {
      hunt_id: legacy.id,
      from: 'v1',
      extracted_count: assets.length,
      strategy: strategy.strategy,
    },
  });
  return analysis;
}

async function migrateV2ToV3(
  legacy: LegacyV2HuntRecord,
  tier: Tier | null | undefined,
): Promise<PersistedHuntAnalysis> {
  const strategy: StorageStrategy = legacy.storageStrategy
    || resolveStorageStrategy({ tier: tier ?? null, platform: Platform.OS }).strategy;

  // v2 records already carry MediaAsset-like structures. Promote them:
  const assets: MediaAsset[] = (legacy.mediaAssets || []).map((m, i) => ({
    imageId: m.imageId || m.assetId || `legacy_${legacy.id}_${i}`,
    huntId: legacy.id,
    role: i === 0 ? 'primary' : 'context',
    storageType: m.storageType,
    uri: m.uri,
    storageKey: m.storageKey,
    mime: m.mime,
    width: m.width,
    height: m.height,
    bytes: m.bytes,
    createdAt: m.createdAt || new Date().toISOString(),
  }));
  await indexMediaBatch(assets);

  const metadata = extractMetadata({
    species: legacy.species,
    speciesName: legacy.speciesName,
    date: legacy.date,
    timeWindow: legacy.timeWindow,
    windDirection: legacy.windDirection,
    temperature: legacy.temperature,
    propertyType: legacy.propertyType,
    region: legacy.region,
    weatherData: legacy.weatherData,
    locationCoords: legacy.locationCoords,
  });

  const primaryIdx = Math.max(0, Math.min(assets.length - 1, legacy.primaryMediaIndex || 0));
  const analysis = buildPersistedAnalysis({
    id: legacy.id,
    createdAt: legacy.createdAt,
    metadata,
    analysis: legacy.result,
    mediaRefs: assets.map(a => a.imageId),
    primaryMediaRef: assets[primaryIdx]?.imageId || null,
    storageStrategy: strategy,
  });
  await saveAnalysis(analysis);
  logClientEvent({
    event: 'legacy_hunt_migrated',
    data: {
      hunt_id: legacy.id,
      from: 'v2',
      extracted_count: assets.length,
      strategy,
    },
  });
  return analysis;
}

async function readLegacyStoreForHunt(huntId: string): Promise<any | null> {
  try {
    const histRaw = await AsyncStorage.getItem(LEGACY_HUNT_HISTORY_KEY);
    if (histRaw) {
      const list = JSON.parse(histRaw);
      if (Array.isArray(list)) {
        const match = list.find((x: any) => x && x.id === huntId);
        if (match) return match;
      }
    }
  } catch {}
  try {
    const cur = await AsyncStorage.getItem(LEGACY_CURRENT_HUNT_KEY);
    if (cur) {
      const parsed = JSON.parse(cur);
      if (parsed && parsed.id === huntId) return parsed;
    }
  } catch {}
  return null;
}

/**
 * Primary loader used by the results screen. Applies the full
 * priority chain (memory → analysis store → legacy stores with lazy
 * migration) and returns a fully hydrated result.
 */
export async function hydrateHuntResult(
  huntId: string,
  tier: Tier | null | undefined,
): Promise<HydratedHuntResult | null> {
  if (!huntId) return null;

  // 1) in-memory session cache
  const mem = getCurrentHuntEntry(huntId);
  if (mem) {
    const rec = mem.record as RuntimeHunt | PersistedHuntAnalysis | any;
    if (rec && rec.schema === 'hunt.analysis.v1') {
      logClientEvent({
        event: 'hunt_hydrate',
        data: { hunt_id: huntId, tier_hit: 'memory' },
      });
      return hydrateRuntimeHuntFromAnalysis(
        rec,
        (rec as RuntimeHunt).displayUris,
        mem.persistFailed
          ? 'Session-only: this hunt was not saved (storage full). Take notes before leaving.'
          : null,
      );
    }
  }

  // 1.5) provisional AsyncStorage hot-cache (survives tab reload,
  // bfcache, mobile memory pressure, and expo-router static SSR
  // route transitions — unlike the in-memory singleton above).
  //
  // This is the tier that makes post-analyze navigation reliable
  // on mobile Chrome / WebView where each route transition can be
  // a fresh JS runtime and the in-memory store is wiped.
  try {
    const provisional = await readProvisionalHunt(huntId);
    if (provisional) {
      logClientEvent({
        event: 'hunt_hydrate',
        data: {
          hunt_id: huntId,
          tier_hit: 'provisional',
          provisional_bytes: provisional.approxBytes,
        },
      });
      const runtime = provisionalToRuntime(provisional);
      return hydrateRuntimeHuntFromAnalysis(
        runtime,
        runtime.displayUris,
        null,
      );
    }
  } catch (err: any) {
    logClientEvent({
      event: 'hunt_hydrate_error',
      data: {
        hunt_id: huntId,
        tier: 'provisional',
        error: err?.message || String(err),
      },
    });
  }

  // 2) analysisStore
  const analysis = await loadAnalysis(huntId);
  if (analysis) {
    logClientEvent({
      event: 'hunt_hydrate',
      data: { hunt_id: huntId, tier_hit: 'analysis_store' },
    });
    return hydrateRuntimeHuntFromAnalysis(analysis);
  }

  // 3) legacy stores (migrate in-place)
  const legacy = await readLegacyStoreForHunt(huntId);
  if (legacy) {
    let migrated: PersistedHuntAnalysis | null = null;
    if (isLegacyV2Hunt(legacy)) {
      migrated = await migrateV2ToV3(legacy, tier);
    } else if (isLegacyV1Hunt(legacy)) {
      migrated = await migrateV1ToV3(legacy, tier);
    }
    if (migrated) {
      // Best-effort cleanup of the legacy entry so it isn't migrated twice.
      try {
        const histRaw = await AsyncStorage.getItem(LEGACY_HUNT_HISTORY_KEY);
        if (histRaw) {
          const list = JSON.parse(histRaw);
          if (Array.isArray(list)) {
            const next = list.filter((x: any) => !(x && x.id === huntId));
            if (next.length !== list.length) {
              await AsyncStorage.setItem(LEGACY_HUNT_HISTORY_KEY, JSON.stringify(next));
            }
          }
        }
        const cur = await AsyncStorage.getItem(LEGACY_CURRENT_HUNT_KEY);
        if (cur) {
          const parsed = JSON.parse(cur);
          if (parsed && parsed.id === huntId) {
            await AsyncStorage.removeItem(LEGACY_CURRENT_HUNT_KEY);
          }
        }
      } catch {}
      return hydrateRuntimeHuntFromAnalysis(migrated);
    }
  }

  logClientEvent({
    event: 'hunt_not_found',
    data: { hunt_id: huntId, reason: 'missing_from_all_sources' },
  });
  return null;
}

// ------------------------------ Save pipeline ------------------------------

export interface SaveHuntInput {
  tier: Tier | null | undefined;
  analysisResult: any;
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  temperature?: string | number | null;
  propertyType?: string;
  region?: string;
  /** Canonical hunt-style id (see src/constants/huntStyles.ts) — NOT display text. */
  huntStyle?: string | null;
  weatherData?: any;
  locationCoords?: { lat: number; lon: number } | null;
  /** Base64 inputs received from camera/map capture/picker. */
  base64Images: string[];
  primaryMediaIndex: number;
  /**
   * Frozen analysis basis for the exact image + GPS used to produce
   * the result. At save time the caller supplies the image's natural
   * dimensions (measured via Image.getSize) and, optionally, the GPS
   * and overlay calibration. We fill in the imageId once the primary
   * media asset has been persisted. When omitted, we synthesize a
   * reasonable context from the other inputs so saved hunts never
   * lose this lock.
   */
  analysisContext?: {
    imageNaturalWidth?: number;
    imageNaturalHeight?: number;
    /** If omitted, falls back to `locationCoords`. */
    gps?: { lat: number; lon: number } | null;
    overlayCalibration?: import('./types').OverlayCalibration | null;
  };
}

export interface SaveHuntOutcome {
  hunt: HydratedHuntResult;
  analysisPersisted: boolean;
  mediaPersisted: number;
  warningMessage: string | null;
}

/**
 * Full save pipeline:
 *   1) Persist image bytes per media asset via MediaStore (tier-aware).
 *   2) Build a PersistedHuntAnalysis (no bytes) and save it.
 *   3) Always stash the runtime in the in-memory session store.
 *   4) Return a hydrated result for immediate UI consumption.
 */
export async function saveHunt(input: SaveHuntInput): Promise<SaveHuntOutcome> {
  const strategy = resolveStorageStrategy({
    tier: input.tier ?? null,
    platform: Platform.OS,
  });
  const huntId = input.analysisResult?.id as string;

  // --- size diagnostics (logged before any I/O so we always see
  // them even when a later step fails silently). base64 images
  // often dominate payload — we flag >4MB aggregates since mobile
  // Chrome's localStorage cap is ~5MB per origin and the rest of
  // the app needs room to breathe.
  const imageBytesPer = (input.base64Images || []).map(b => (b ? b.length : 0));
  const totalImageBytes = imageBytesPer.reduce((a, b) => a + b, 0);
  logClientEvent({
    event: 'save_hunt_started',
    data: {
      hunt_id: huntId,
      tier: input.tier ?? null,
      platform: Platform.OS,
      strategy: strategy.strategy,
      image_count: imageBytesPer.length,
      image_bytes_total: totalImageBytes,
      image_bytes_max: Math.max(0, ...imageBytesPer),
      large_payload: totalImageBytes > 4 * 1024 * 1024,
    },
  });

  // ------------------------------------------------------------------
  // STEP 0 — Seat a provisional record in TWO places before any
  // disk/cloud I/O so /results can ALWAYS find this hunt:
  //
  //   a) in-memory singleton (fast path; session-scoped)
  //   b) AsyncStorage provisional hot-cache (durable; survives
  //      tab reshuffle, bfcache, mobile memory pressure, and
  //      expo-router static-SSR route transitions — the
  //      in-memory singleton alone was unreliable on mobile).
  //
  // We later OVERWRITE the in-memory entry and CLEAR the
  // AsyncStorage provisional entry if the full pipeline succeeds.
  // ------------------------------------------------------------------
  const provisionalMetadata = extractMetadata({
    species: input.species,
    speciesName: input.speciesName,
    date: input.date,
    timeWindow: input.timeWindow,
    windDirection: input.windDirection,
    temperature: input.temperature,
    propertyType: input.propertyType,
    region: input.region,
    huntStyle: input.huntStyle ?? null,
    weatherData: input.weatherData,
    locationCoords: input.locationCoords,
  });

  const provisionalMediaRefs: string[] = input.base64Images.map(
    (_b, i) => `provisional-${huntId}-${i}`,
  );
  const provisionalSessionUris: Record<string, string> = {};
  input.base64Images.forEach((b64, i) => {
    if (b64) provisionalSessionUris[provisionalMediaRefs[i]] = b64;
  });
  const provisionalPrimaryIdx = Math.max(
    0,
    Math.min(provisionalMediaRefs.length - 1, input.primaryMediaIndex || 0),
  );
  const provisionalPrimaryRef = provisionalMediaRefs[provisionalPrimaryIdx] ?? null;
  const provisionalAnalysis = buildPersistedAnalysis({
    id: huntId,
    metadata: provisionalMetadata,
    analysis: input.analysisResult,
    mediaRefs: provisionalMediaRefs,
    primaryMediaRef: provisionalPrimaryRef,
    storageStrategy: strategy.strategy,
    analysisContext: buildInitialAnalysisContext({
      primaryMediaRef: provisionalPrimaryRef,
      ctxInput: input.analysisContext,
      fallbackGps: input.locationCoords ?? null,
    }),
  });
  const provisionalRuntime: RuntimeHunt = {
    ...provisionalAnalysis,
    displayUris: provisionalSessionUris,
  };
  setCurrentHunt(huntId, provisionalRuntime, {
    persistFailed: true,
    persistError: 'provisional (pre-persist)',
  });

  // Durable provisional cache — critical for mobile Chrome.
  const provisionalWrite = await writeProvisionalHunt(
    huntId,
    provisionalAnalysis,
    provisionalSessionUris,
  );
  logClientEvent({
    event: 'save_hunt_provisional_seated',
    data: {
      hunt_id: huntId,
      ok: provisionalWrite.ok,
      bytes: provisionalWrite.bytes,
      error: provisionalWrite.error ?? null,
      quota_warning: provisionalWrite.bytes > 4 * 1024 * 1024,
    },
  });

  // ------------------------------------------------------------------
  // STEP 1 — Persist images via MediaStore. Any per-image failure is
  // already logged + non-fatal inside saveMediaBatch, so this won't
  // throw on its own. We still defend against a surprise adapter
  // regression with a try/catch so we can gracefully keep the
  // provisional session entry in place.
  // ------------------------------------------------------------------
  let assets: import('./types').MediaAsset[] = [];
  try {
    assets = await saveMediaBatch(input.base64Images, {
      tier: input.tier, platform: Platform.OS, huntId,
    });
  } catch (err: any) {
    logClientEvent({
      event: 'persist_degraded',
      data: {
        hunt_id: huntId,
        reason: 'saveMediaBatch_threw_unexpectedly',
        error: err?.message || String(err),
      },
    });
    assets = [];
  }

  const primaryIdx = Math.max(0, Math.min(assets.length - 1, input.primaryMediaIndex || 0));
  const mediaRefs = assets.map(a => a.imageId);
  const primaryMediaRef = assets[primaryIdx]?.imageId ?? null;

  const metadata = provisionalMetadata;

  const analysis = buildPersistedAnalysis({
    id: huntId,
    metadata,
    analysis: input.analysisResult,
    mediaRefs,
    primaryMediaRef,
    storageStrategy: strategy.strategy,
    analysisContext: buildInitialAnalysisContext({
      primaryMediaRef,
      ctxInput: input.analysisContext,
      fallbackGps: input.locationCoords ?? null,
    }),
  });

  // ------------------------------------------------------------------
  // STEP 2 — Persist the analysis record. saveAnalysis returns false
  // on failure (AsyncStorage quota / JSON errors) — never throws —
  // but we still try/catch for belt-and-suspenders.
  // ------------------------------------------------------------------
  let analysisPersisted = false;
  try {
    analysisPersisted = await saveAnalysis(analysis);
  } catch (err: any) {
    analysisPersisted = false;
    logClientEvent({
      event: 'storage_write_failed',
      data: {
        hunt_id: huntId,
        store: 'analysis',
        reason: 'saveAnalysis_threw',
        error: err?.message || String(err),
      },
    });
  }

  // ------------------------------------------------------------------
  // STEP 3 — REPLACE the provisional session entry with the real one.
  // If media persistence failed we fall back to the provisional
  // base64 uris so the screen still renders — keyed to whichever
  // asset refs actually exist (real > provisional).
  // ------------------------------------------------------------------
  const sessionUris: Record<string, string> = {};
  if (assets.length > 0) {
    assets.forEach((a, i) => {
      if (input.base64Images[i]) sessionUris[a.imageId] = input.base64Images[i];
    });
  } else {
    // No assets persisted — carry the provisional uris forward so the
    // results screen still has images to show.
    Object.assign(sessionUris, provisionalSessionUris);
  }
  const runtimeAnalysis =
    assets.length > 0 ? analysis : provisionalAnalysis;
  const runtime: RuntimeHunt = { ...runtimeAnalysis, displayUris: sessionUris };
  setCurrentHunt(huntId, runtime, {
    persistFailed: !analysisPersisted,
    persistError: analysisPersisted ? null : 'analysisStore write failed',
  });

  // Cleanup provisional hot-cache once the real record has landed.
  // On failure, keep it in place so /results still has a fallback.
  if (analysisPersisted) {
    await clearProvisionalHunt(huntId);
  }

  logClientEvent({
    event: 'save_hunt_completed',
    data: {
      hunt_id: huntId,
      analysis_persisted: analysisPersisted,
      media_assets_persisted: assets.length,
      media_assets_expected: input.base64Images.length,
      provisional_retained: !analysisPersisted,
    },
  });

  // 4) Diagnostics.
  if (!analysisPersisted) {
    logClientEvent({
      event: 'storage_write_failed',
      data: {
        hunt_id: huntId,
        store: 'analysis',
        strategy: strategy.strategy,
        image_count: input.base64Images.length,
      },
    });
  } else if (assets.length < input.base64Images.length) {
    logClientEvent({
      event: 'persist_degraded',
      data: {
        hunt_id: huntId,
        reason: 'some_media_failed',
        expected: input.base64Images.length,
        actual: assets.length,
      },
    });
  }

  const hydrated = await hydrateRuntimeHuntFromAnalysis(
    analysis,
    sessionUris,
    !analysisPersisted
      ? 'Session-only: this hunt was not saved (storage full). Take notes before leaving.'
      : assets.length < input.base64Images.length
        ? 'Saved analysis. Some images may not be available in history.'
        : null,
  );

  return {
    hunt: hydrated,
    analysisPersisted,
    mediaPersisted: assets.length,
    warningMessage: hydrated.warning,
  };
}

// ------------------------------ History ------------------------------

export interface HistoryEntryLite {
  id: string;
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  createdAt: string;
  primaryMediaRef: string | null;
}

/**
 * Returns history entries (lightweight) — does NOT resolve display
 * URIs. Call `resolveMediaUri(primaryMediaRef)` from the UI if you
 * want thumbnails.
 */
export async function listHistory(
  tier: Tier | null | undefined,
): Promise<HistoryEntryLite[]> {
  // Opportunistic: migrate any legacy entries we encounter in the old
  // hunt_history key first, then return the analysis store list.
  try {
    const histRaw = await AsyncStorage.getItem(LEGACY_HUNT_HISTORY_KEY);
    if (histRaw) {
      const list = JSON.parse(histRaw);
      if (Array.isArray(list)) {
        for (const legacy of list) {
          if (!legacy || !legacy.id) continue;
          const already = await loadAnalysis(legacy.id);
          if (already) continue;
          if (isLegacyV2Hunt(legacy)) {
            await migrateV2ToV3(legacy, tier);
          } else if (isLegacyV1Hunt(legacy)) {
            await migrateV1ToV3(legacy, tier);
          }
        }
        await AsyncStorage.removeItem(LEGACY_HUNT_HISTORY_KEY);
      }
    }
  } catch {}

  const { listAnalysisHistory } = await import('./analysisStore');
  const all = await listAnalysisHistory();
  return all.map(a => ({
    id: a.id,
    species: a.metadata.species,
    speciesName: a.metadata.speciesName,
    date: a.metadata.date,
    timeWindow: a.metadata.timeWindow,
    windDirection: a.metadata.windDirection,
    createdAt: a.createdAt,
    primaryMediaRef: a.primaryMediaRef,
  }));
}

export async function deleteHuntById(id: string): Promise<void> {
  const { deleteAnalysis } = await import('./analysisStore');
  const { removeMediaForHunt } = await import('./mediaStore');
  await deleteAnalysis(id);
  await removeMediaForHunt(id);
}

// ------------------------------ AnalysisContext helpers ------------------------------

// The pure builder lives in `/src/utils/analysisContext.ts` so tests
// can import it without dragging in AsyncStorage. We re-export for
// callers that already import from huntHydration.
export { buildInitialAnalysisContext } from '../utils/analysisContext';

/**
 * Mark a hunt's overlays as stale. Called when the user changes the
 * basis of the analysis (switches primary image, moves GPS, edits
 * calibration anchors). Idempotent — safe to call repeatedly.
 */
export async function markOverlayStale(huntId: string): Promise<boolean> {
  const analysis = await loadAnalysis(huntId);
  if (!analysis || !analysis.analysisContext) return false;
  if (analysis.analysisContext.overlayStatus === 'stale') return true;
  const updated: PersistedHuntAnalysis = {
    ...analysis,
    analysisContext: {
      ...analysis.analysisContext,
      overlayStatus: 'stale',
    },
  };
  return saveAnalysis(updated);
}
