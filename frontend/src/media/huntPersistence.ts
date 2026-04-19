// Raven Scout — Thin compatibility facade.
//
// The real work lives in:
//   - analysisStore.ts       (analysis CRUD, reference-only)
//   - mediaStore.ts          (image bytes + index, tier-aware)
//   - huntHydration.ts       (joins the two, loader/saver, legacy migration)
//
// This file exists so existing call-sites keep working. Prefer
// importing from huntHydration / mediaStore / analysisStore directly
// in new code.

export {
  saveHunt,
  hydrateHuntResult,
  hydrateRuntimeHuntFromAnalysis,
  listHistory,
  deleteHuntById,
  type SaveHuntInput,
  type SaveHuntOutcome,
  type HistoryEntryLite,
} from './huntHydration';

export {
  saveMedia,
  saveMediaBatch,
  getMedia,
  resolveMediaUri,
  resolveAsset,
  deleteMedia,
  listMediaForHunt,
  removeMediaForHunt,
  migrateLegacyBase64Media,
} from './mediaStore';

export {
  loadAnalysis,
  saveAnalysis,
  listAnalysisHistory,
  updateAnalysis,
  deleteAnalysis,
} from './analysisStore';

// Backwards-compat alias — returns a result-shape equivalent to the
// previous loadHunt() where callers only needed the hunt record.
import { hydrateHuntResult } from './huntHydration';
import type { HydratedHuntResult } from './types';
import type { Tier } from './storageStrategy';

export interface LoadHuntResult {
  hunt: HydratedHuntResult;
  warningMessage: string | null;
}

export async function loadHunt(id: string, tier: Tier | null | undefined): Promise<LoadHuntResult | null> {
  const hydrated = await hydrateHuntResult(id, tier);
  if (!hydrated) return null;
  return { hunt: hydrated, warningMessage: hydrated.warning };
}
