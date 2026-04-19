// Raven Scout — High-level hunt persistence API.
//
// This is the ONLY module setup.tsx / results.tsx / history.tsx should
// call. It encapsulates:
//   - tier-aware strategy resolution
//   - image ingestion (base64 → media adapter → MediaAsset refs)
//   - stripping base64 from the persisted record
//   - budget-aware AsyncStorage writes
//   - lazy migration of legacy records on load
//   - in-memory hunt fallback (integrates with currentHuntStore)
//   - diagnostic events via clientLog

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { logClientEvent } from '../utils/clientLog';
import {
  getCurrentHuntEntry,
  setCurrentHunt,
} from '../store/currentHuntStore';
import { resolveStorageStrategy, type Tier } from './storageStrategy';
import {
  buildRuntimeHunt,
  fromPersistedHunt,
  isLegacyHunt,
  stripBase64Images,
  toPersistedHunt,
  type BuildRuntimeHuntInput,
} from './huntSerialization';
import { extractAndStoreImages } from './mediaStore';
import { applyBudget, MAX_HISTORY_BYTES } from './safePersist';
import { migrateLegacyHunt } from './huntMigration';
import type { PersistedHunt, RuntimeHunt } from './types';

const HISTORY_KEY = 'hunt_history';
const CURRENT_KEY = 'current_hunt';
const HISTORY_LIMIT = 3;

// ------------------------------ Save ------------------------------

export interface SaveHuntInput {
  tier: Tier | null | undefined;
  /** Core analysis payload returned by /api/analyze-hunt */
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
  /** Base64 data URIs captured from map / camera / picker. */
  base64Images: string[];
  primaryMediaIndex: number;
}

export interface SaveHuntResult {
  hunt: RuntimeHunt;
  persistedOk: boolean;
  degradations: string[];
  warningMessage: string | null;
  approxBytes: number;
}

export async function saveHunt(input: SaveHuntInput): Promise<SaveHuntResult> {
  const strategy = resolveStorageStrategy({
    tier: input.tier ?? null,
    platform: Platform.OS,
  });

  // 1) Ingest images into the correct media backend — base64 goes to
  //    file/idb/cloud and we keep only MediaAsset references plus a
  //    display URI (for the current session only).
  const { assets, displayUris } = await extractAndStoreImages(
    input.base64Images,
    strategy,
  );

  const primaryIndex = Math.max(0, Math.min(assets.length - 1, input.primaryMediaIndex || 0));

  const runtime = buildRuntimeHunt({
    id: input.analysisResult?.id,
    species: input.species,
    speciesName: input.speciesName,
    date: input.date,
    timeWindow: input.timeWindow,
    windDirection: input.windDirection,
    temperature: input.temperature,
    propertyType: input.propertyType,
    region: input.region,
    result: input.analysisResult,
    weatherData: input.weatherData,
    locationCoords: input.locationCoords ?? null,
    createdAt: new Date().toISOString(),
    mediaAssets: assets,
    mediaDisplayUris: displayUris,
    primaryMediaIndex: primaryIndex,
    storageStrategy: strategy.strategy,
  } as BuildRuntimeHuntInput);

  // 2) Always stash runtime hunt in-memory FIRST (session-safe).
  setCurrentHunt(runtime.id, runtime, { persistFailed: false });

  // 3) Serialize → strip base64 → apply storage budget.
  const persistable = toPersistedHunt(runtime);
  const budgeted = applyBudget(persistable);
  const degradations = budgeted.degradations.filter(s => s !== 'noop');

  // 4) Write to AsyncStorage — prepend to history, keep HISTORY_LIMIT.
  let persistedOk = false;
  let writeError: string | null = null;
  try {
    const existingRaw = await AsyncStorage.getItem(HISTORY_KEY).catch(() => null);
    let history: PersistedHunt[] = [];
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) history = parsed;
      } catch {}
    }
    // Replace an old entry with the same id if present.
    history = history.filter(h => h && (h as any).id !== budgeted.record.id);
    history.unshift(budgeted.record);
    if (history.length > HISTORY_LIMIT) history = history.slice(0, HISTORY_LIMIT);

    // If the whole history overflows, drop oldest until it fits.
    let serialized = JSON.stringify(history);
    while (serialized.length > MAX_HISTORY_BYTES && history.length > 1) {
      history.pop();
      serialized = JSON.stringify(history);
    }
    await AsyncStorage.setItem(HISTORY_KEY, serialized);
    persistedOk = true;
  } catch (err: any) {
    writeError = err?.message || String(err);
  }

  // 5) If history write failed, try current_hunt with just this record.
  if (!persistedOk) {
    try {
      await AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
      await AsyncStorage.setItem(CURRENT_KEY, budgeted.serialized);
      persistedOk = true;
    } catch (err: any) {
      writeError = `${writeError} | fallback: ${err?.message || err}`;
    }
  }

  // 6) Update in-memory store with the final persistFailed flag.
  setCurrentHunt(runtime.id, runtime, {
    persistFailed: !persistedOk,
    persistError: writeError,
  });

  // 7) Telemetry.
  if (!persistedOk || degradations.length > 0) {
    logClientEvent({
      event: !persistedOk ? 'storage_write_failed' : 'persist_degraded',
      data: {
        hunt_id: runtime.id,
        strategy: strategy.strategy,
        backend: strategy.preferredBackend,
        approx_bytes: budgeted.bytes,
        degradations,
        error: writeError,
        image_count: assets.length,
      },
    });
  }

  const warningMessage = !persistedOk
    ? 'Session-only: this hunt was not saved (storage full). Take notes before leaving.'
    : degradations.length > 0
      ? 'Saved analysis. Some images may not be available in history.'
      : null;

  return {
    hunt: runtime,
    persistedOk,
    degradations,
    warningMessage,
    approxBytes: budgeted.bytes,
  };
}

// ------------------------------ Load ------------------------------

export interface LoadHuntResult {
  hunt: RuntimeHunt;
  source: 'memory' | 'history' | 'current' | 'migrated-legacy';
  warningMessage: string | null;
}

async function readHistory(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readCurrent(): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeHistory(history: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Best-effort — budget guard should have prevented this.
  }
}

/**
 * Load a hunt by id using the priority:
 *   1) in-memory current hunt
 *   2) hunt_history
 *   3) current_hunt
 *
 * Legacy base64 records are migrated on access and the migrated record
 * is written back transparently.
 */
export async function loadHunt(
  id: string,
  tier: Tier | null | undefined,
): Promise<LoadHuntResult | null> {
  if (!id) return null;

  // 1) in-memory
  const memory = getCurrentHuntEntry(id);
  if (memory) {
    const rec = memory.record as RuntimeHunt;
    return {
      hunt: rec,
      source: 'memory',
      warningMessage: memory.persistFailed
        ? 'Session-only: this hunt was not saved (storage full). Take notes before leaving.'
        : null,
    };
  }

  const strategy = resolveStorageStrategy({
    tier: tier ?? null,
    platform: Platform.OS,
  });

  // 2) history
  const history = await readHistory();
  const histIdx = history.findIndex((h: any) => h && h.id === id);
  if (histIdx >= 0) {
    const rec = history[histIdx];
    if (isLegacyHunt(rec)) {
      const { hunt: migrated, extractedCount, bytesFreed } = await migrateLegacyHunt(rec, strategy);
      history[histIdx] = migrated;
      await writeHistory(history);
      logClientEvent({
        event: 'legacy_hunt_migrated',
        data: {
          hunt_id: id,
          extracted_count: extractedCount,
          bytes_freed: bytesFreed,
          source: 'history',
          strategy: strategy.strategy,
        },
      });
      return {
        hunt: fromPersistedHunt(migrated),
        source: 'migrated-legacy',
        warningMessage: null,
      };
    }
    return {
      hunt: fromPersistedHunt(rec as PersistedHunt),
      source: 'history',
      warningMessage: null,
    };
  }

  // 3) current_hunt
  const current = await readCurrent();
  if (current && current.id === id) {
    if (isLegacyHunt(current)) {
      const { hunt: migrated, extractedCount, bytesFreed } = await migrateLegacyHunt(current, strategy);
      try {
        await AsyncStorage.setItem(CURRENT_KEY, JSON.stringify(stripBase64Images(migrated)));
      } catch {}
      logClientEvent({
        event: 'legacy_hunt_migrated',
        data: {
          hunt_id: id,
          extracted_count: extractedCount,
          bytes_freed: bytesFreed,
          source: 'current',
          strategy: strategy.strategy,
        },
      });
      return {
        hunt: fromPersistedHunt(migrated),
        source: 'migrated-legacy',
        warningMessage: null,
      };
    }
    return {
      hunt: fromPersistedHunt(current as PersistedHunt),
      source: 'current',
      warningMessage: null,
    };
  }

  logClientEvent({
    event: 'hunt_not_found',
    data: { hunt_id: id, reason: 'missing_from_all_sources' },
  });
  return null;
}

// ------------------------------ History listing ------------------------------

export interface HistoryEntryLite {
  id: string;
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  createdAt: string;
  primaryAssetId?: string;
  primaryThumbnail?: string;  // tiny preview when available
}

/**
 * Return lightweight history entries suitable for the list UI. Migrates
 * legacy records in-place as they're encountered.
 */
export async function listHistory(
  tier: Tier | null | undefined,
): Promise<HistoryEntryLite[]> {
  const strategy = resolveStorageStrategy({
    tier: tier ?? null,
    platform: Platform.OS,
  });

  const history = await readHistory();
  const out: HistoryEntryLite[] = [];
  let mutated = false;
  for (let i = 0; i < history.length; i++) {
    let rec = history[i];
    if (!rec) continue;
    if (isLegacyHunt(rec)) {
      try {
        const { hunt: migrated, extractedCount, bytesFreed } = await migrateLegacyHunt(rec, strategy);
        history[i] = migrated;
        rec = migrated;
        mutated = true;
        logClientEvent({
          event: 'legacy_hunt_migrated',
          data: {
            hunt_id: rec.id,
            extracted_count: extractedCount,
            bytes_freed: bytesFreed,
            source: 'list',
            strategy: strategy.strategy,
          },
        });
      } catch {
        // skip migration failure; still display metadata
      }
    }
    const p = rec as PersistedHunt;
    const primary = p.mediaAssets?.[p.primaryMediaIndex ?? 0];
    out.push({
      id: p.id,
      species: p.species,
      speciesName: p.speciesName,
      date: p.date,
      timeWindow: p.timeWindow,
      windDirection: p.windDirection,
      createdAt: p.createdAt,
      primaryAssetId: primary?.assetId,
      primaryThumbnail: primary?.thumbnail,
    });
  }
  if (mutated) await writeHistory(history);
  return out;
}

export async function deleteHuntById(id: string): Promise<void> {
  const history = await readHistory();
  const next = history.filter((h: any) => h && h.id !== id);
  if (next.length !== history.length) await writeHistory(next);
  const current = await readCurrent();
  if (current && current.id === id) {
    try {
      await AsyncStorage.removeItem(CURRENT_KEY);
    } catch {}
  }
}
