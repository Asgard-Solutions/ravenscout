// Raven Scout — Storage-budget guard for AsyncStorage writes.
//
// Web localStorage is capped at ~5 MB total. We aim for a 2.5 MB budget
// per record to leave headroom for other keys. If a persisted hunt still
// exceeds the budget after base64 stripping we progressively degrade:
//   1) drop `thumbnail` fields on mediaAssets
//   2) drop `weatherData` (large hourly arrays)
//   3) drop `result.overlays` thumbnails / reasoning strings
//   4) last resort: metadata-only (no assets, no result detail)
//
// Callers receive the final serialized record *and* a log entry listing
// which stages were applied.

import type { PersistedHunt } from './types';

export const MAX_RECORD_BYTES = 2_500_000;          // ~2.5 MB target
export const MAX_HISTORY_BYTES = 4_000_000;         // ~4 MB target for the full array

export type DegradationStep =
  | 'noop'
  | 'drop-thumbnails'
  | 'drop-weather'
  | 'drop-media-assets'
  | 'metadata-only';

export interface BudgetedRecord {
  record: PersistedHunt;
  serialized: string;
  degradations: DegradationStep[];
  overBudget: boolean;
  bytes: number;
}

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

function sizeOf(rec: unknown): { s: string; n: number } {
  const s = JSON.stringify(rec);
  return { s, n: s.length };
}

export function applyBudget(
  record: PersistedHunt,
  maxBytes: number = MAX_RECORD_BYTES,
): BudgetedRecord {
  let cur = clone(record);
  let { s, n } = sizeOf(cur);
  const steps: DegradationStep[] = [];

  if (n <= maxBytes) {
    return { record: cur, serialized: s, degradations: ['noop'], overBudget: false, bytes: n };
  }

  // 1) Drop thumbnails.
  if (cur.mediaAssets?.some((a: any) => a?.thumbnail)) {
    cur.mediaAssets = cur.mediaAssets.map(a => ({ ...a, thumbnail: undefined }));
    ({ s, n } = sizeOf(cur));
    steps.push('drop-thumbnails');
    if (n <= maxBytes) {
      return { record: cur, serialized: s, degradations: steps, overBudget: false, bytes: n };
    }
  }

  // 2) Drop weather hourly arrays.
  if (cur.weatherData) {
    cur.weatherData = undefined;
    ({ s, n } = sizeOf(cur));
    steps.push('drop-weather');
    if (n <= maxBytes) {
      return { record: cur, serialized: s, degradations: steps, overBudget: false, bytes: n };
    }
  }

  // 3) Drop media asset array entirely — references only are usually
  // small, but if the record still explodes (legacy inline data URIs
  // sneaking in), nuke them.
  cur.mediaAssets = [];
  cur.primaryMediaIndex = 0;
  ({ s, n } = sizeOf(cur));
  steps.push('drop-media-assets');
  if (n <= maxBytes) {
    return { record: cur, serialized: s, degradations: steps, overBudget: false, bytes: n };
  }

  // 4) Metadata-only last resort — keep just the minimum the UI needs.
  cur = clone({
    schema: 'hunt.persisted.v2',
    id: cur.id,
    species: cur.species,
    speciesName: cur.speciesName,
    date: cur.date,
    timeWindow: cur.timeWindow,
    windDirection: cur.windDirection,
    result: {
      id: cur.result?.id,
      summary: cur.result?.summary,
      overlays: [],
    },
    createdAt: cur.createdAt,
    mediaAssets: [],
    primaryMediaIndex: 0,
    storageStrategy: 'metadata-only',
  } as PersistedHunt);
  ({ s, n } = sizeOf(cur));
  steps.push('metadata-only');

  return { record: cur, serialized: s, degradations: steps, overBudget: n > maxBytes, bytes: n };
}
