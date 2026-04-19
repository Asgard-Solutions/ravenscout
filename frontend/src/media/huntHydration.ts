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
      return hydrateRuntimeHuntFromAnalysis(
        rec,
        (rec as RuntimeHunt).displayUris,
        mem.persistFailed
          ? 'Session-only: this hunt was not saved (storage full). Take notes before leaving.'
          : null,
      );
    }
  }

  // 2) analysisStore
  const analysis = await loadAnalysis(huntId);
  if (analysis) {
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
  weatherData?: any;
  locationCoords?: { lat: number; lon: number } | null;
  /** Base64 inputs received from camera/map capture/picker. */
  base64Images: string[];
  primaryMediaIndex: number;
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

  // 1) Persist images via MediaStore.
  const assets = await saveMediaBatch(input.base64Images, {
    tier: input.tier, platform: Platform.OS, huntId,
  });

  const primaryIdx = Math.max(0, Math.min(assets.length - 1, input.primaryMediaIndex || 0));
  const mediaRefs = assets.map(a => a.imageId);
  const primaryMediaRef = assets[primaryIdx]?.imageId ?? null;

  const metadata = extractMetadata({
    species: input.species,
    speciesName: input.speciesName,
    date: input.date,
    timeWindow: input.timeWindow,
    windDirection: input.windDirection,
    temperature: input.temperature,
    propertyType: input.propertyType,
    region: input.region,
    weatherData: input.weatherData,
    locationCoords: input.locationCoords,
  });

  const analysis = buildPersistedAnalysis({
    id: huntId,
    metadata,
    analysis: input.analysisResult,
    mediaRefs,
    primaryMediaRef,
    storageStrategy: strategy.strategy,
  });

  // 2) Persist analysis record.
  const analysisPersisted = await saveAnalysis(analysis);

  // 3) In-memory runtime hunt: keep session URIs for instant display.
  const sessionUris: Record<string, string> = {};
  assets.forEach((a, i) => {
    if (input.base64Images[i]) sessionUris[a.imageId] = input.base64Images[i];
  });
  const runtime: RuntimeHunt = { ...analysis, displayUris: sessionUris };
  setCurrentHunt(huntId, runtime, {
    persistFailed: !analysisPersisted,
    persistError: analysisPersisted ? null : 'analysisStore write failed',
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
