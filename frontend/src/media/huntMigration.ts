// Raven Scout — Lazy migration of legacy (base64-inline) hunt records.
//
// When the app boots or a hunt is loaded, it may encounter a record
// written by the pre-v2 persistence layer (base64 data URIs inline
// under `mapImages`). We migrate on access to keep the surface area
// small and avoid blocking startup.

import type { StrategyResult } from './storageStrategy';
import type {
  LegacyHuntRecord,
  MediaAsset,
  PersistedHunt,
} from './types';
import { extractAndStoreImages } from './mediaStore';

export interface MigrationResult {
  migrated: boolean;
  hunt: PersistedHunt;
  /** How many base64 images were extracted. */
  extractedCount: number;
  /** Approximate bytes of base64 removed. */
  bytesFreed: number;
}

function approxDataUriBytes(s: string): number {
  if (!s) return 0;
  const comma = s.indexOf(',');
  const payload = comma >= 0 ? s.slice(comma + 1) : s;
  return Math.floor(payload.length * 0.75);
}

export async function migrateLegacyHunt(
  legacy: LegacyHuntRecord,
  strategy: StrategyResult,
): Promise<MigrationResult> {
  const base64Images: string[] = Array.isArray(legacy.mapImages) && legacy.mapImages.length
    ? legacy.mapImages.filter(Boolean) as string[]
    : (legacy.mapImage ? [legacy.mapImage] : []);

  const bytesFreed = base64Images.reduce((a, s) => a + approxDataUriBytes(s), 0);

  let assets: MediaAsset[] = [];
  if (base64Images.length > 0) {
    const { assets: a } = await extractAndStoreImages(base64Images, strategy);
    assets = a;
  }

  const primaryIndex = typeof legacy.primaryMapIndex === 'number'
    ? Math.max(0, Math.min(assets.length - 1, legacy.primaryMapIndex))
    : 0;

  const migrated: PersistedHunt = {
    schema: 'hunt.persisted.v2',
    id: legacy.id,
    species: legacy.species,
    speciesName: legacy.speciesName,
    date: legacy.date,
    timeWindow: legacy.timeWindow,
    windDirection: legacy.windDirection,
    temperature: legacy.temperature ?? null,
    propertyType: legacy.propertyType,
    region: legacy.region,
    result: legacy.result,
    weatherData: legacy.weatherData,
    locationCoords: legacy.locationCoords ?? null,
    createdAt: legacy.createdAt,
    mediaAssets: assets,
    primaryMediaIndex: primaryIndex,
    storageStrategy: strategy.strategy,
  };

  return {
    migrated: true,
    hunt: migrated,
    extractedCount: assets.length,
    bytesFreed,
  };
}
