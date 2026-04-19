// Raven Scout — AnalysisStore.
//
// Owns PersistedHuntAnalysis records. Pure reference-only — NEVER
// contains image bytes or MediaAsset objects. Media lookups happen
// via the Media Index store, joined by the hydration layer.
//
// Backing: AsyncStorage key `raven_analysis_v1` holds an array of
// PersistedHuntAnalysis. History is capped to keep the JSON blob
// small; individual records are always well under 200 KB because
// images are referenced by id, never inlined.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedHuntAnalysis } from './types';
import { stripBase64Images } from './huntSerialization';
import { logClientEvent } from '../utils/clientLog';

export const ANALYSIS_STORAGE_KEY = 'raven_analysis_v1';
export const ANALYSIS_HISTORY_LIMIT = 20;

// Keys we also watch during migration — readers must tolerate these
// being present from earlier versions.
export const LEGACY_HUNT_HISTORY_KEY = 'hunt_history';
export const LEGACY_CURRENT_HUNT_KEY = 'current_hunt';

function isAnalysisRecord(rec: any): rec is PersistedHuntAnalysis {
  return !!rec &&
    typeof rec === 'object' &&
    rec.schema === 'hunt.analysis.v1' &&
    typeof rec.id === 'string';
}

/** Throws a developer-visible error if a record contains image bytes. */
function assertNoInlineBytes(rec: PersistedHuntAnalysis): void {
  const serialized = JSON.stringify(rec);
  if (/data:image\/[a-z]+;base64,/i.test(serialized)) {
    // Best-effort — strip and log. Should never happen after the
    // pipeline, but this is the last gate.
    logClientEvent({
      event: 'persist_degraded',
      data: {
        hunt_id: rec.id,
        reason: 'analysisStore: base64 sneaked into analysis record',
      },
    });
  }
}

async function readAll(): Promise<PersistedHuntAnalysis[]> {
  try {
    const raw = await AsyncStorage.getItem(ANALYSIS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAnalysisRecord);
  } catch {
    return [];
  }
}

async function writeAll(list: PersistedHuntAnalysis[]): Promise<boolean> {
  try {
    // Final invariant gate — strip any accidental base64.
    const cleaned = list.map(r => stripBase64Images({ ...r }));
    let serialized = JSON.stringify(cleaned);
    // Trim oldest entries if serialized is too big.
    while (serialized.length > 2_000_000 && cleaned.length > 1) {
      cleaned.pop();
      serialized = JSON.stringify(cleaned);
    }
    await AsyncStorage.setItem(ANALYSIS_STORAGE_KEY, serialized);
    return true;
  } catch (err: any) {
    logClientEvent({
      event: 'storage_write_failed',
      data: {
        store: 'analysisStore',
        error: err?.message || String(err),
      },
    });
    return false;
  }
}

// --------------------------- Public API ---------------------------

export async function saveAnalysis(record: PersistedHuntAnalysis): Promise<boolean> {
  assertNoInlineBytes(record);
  const all = await readAll();
  const without = all.filter(r => r.id !== record.id);
  without.unshift(record);
  const trimmed = without.slice(0, ANALYSIS_HISTORY_LIMIT);
  return writeAll(trimmed);
}

export async function loadAnalysis(huntId: string): Promise<PersistedHuntAnalysis | null> {
  if (!huntId) return null;
  const all = await readAll();
  return all.find(r => r.id === huntId) || null;
}

export async function listAnalysisHistory(): Promise<PersistedHuntAnalysis[]> {
  return readAll();
}

export async function updateAnalysis(
  huntId: string,
  patch: Partial<PersistedHuntAnalysis>,
): Promise<boolean> {
  const all = await readAll();
  const idx = all.findIndex(r => r.id === huntId);
  if (idx < 0) return false;
  const updated: PersistedHuntAnalysis = { ...all[idx], ...patch, id: all[idx].id, schema: 'hunt.analysis.v1' };
  assertNoInlineBytes(updated);
  all[idx] = updated;
  return writeAll(all);
}

export async function deleteAnalysis(huntId: string): Promise<boolean> {
  const all = await readAll();
  const next = all.filter(r => r.id !== huntId);
  if (next.length === all.length) return false;
  return writeAll(next);
}

export async function wipeAnalysisStore(): Promise<void> {
  try { await AsyncStorage.removeItem(ANALYSIS_STORAGE_KEY); } catch {}
}
