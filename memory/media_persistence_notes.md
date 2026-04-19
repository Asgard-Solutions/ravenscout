# Raven Scout — Media / Analysis Split Architecture (v3)

## TL;DR

Two **independent** persistence stores + a hydration layer that joins
them for the UI:

```
┌──────────────────────┐          ┌─────────────────────────┐
│  AnalysisStore       │          │  MediaStore              │
│  key: raven_analysis │          │  bytes → platform adapter│
│  PersistedHuntAnalysis│          │  index → raven_media_idx │
│  (refs only)         │          │  (MediaAsset metadata)   │
└──────────┬───────────┘          └───────────┬─────────────┘
           │                                  │
           └────────── HuntHydration ─────────┘
                       │
                       ▼
              HydratedHuntResult (UI)
```

AsyncStorage / localStorage never contains image bytes. The analysis
record stores only `mediaRefs: string[]` — image ids that resolve
through the MediaStore + MediaIndex to the tier-correct backend.

## Files

| File | Role |
|---|---|
| `src/media/types.ts` | Domain types. `PersistedHuntAnalysis` (v3), `MediaAsset`, `RuntimeHunt`, `HydratedHuntResult`, legacy shapes |
| `src/media/storageStrategy.ts` | Tier → strategy resolver (single source of truth) |
| `src/media/analysisStore.ts` | AnalysisStore. Key `raven_analysis_v1`. CRUD: `saveAnalysis`, `loadAnalysis`, `listAnalysisHistory`, `updateAnalysis`, `deleteAnalysis` |
| `src/media/mediaIndex.ts` | AsyncStorage key `raven_media_index_v1` — reverse lookup of MediaAsset by imageId, plus `listMediaForHunt(huntId)` |
| `src/media/mediaStore.ts` | Public MediaStore API: `saveMedia`, `saveMediaBatch`, `getMedia`, `resolveMediaUri`, `resolveAsset`, `deleteMedia`, `listMediaForHunt`, `removeMediaForHunt`, `migrateLegacyBase64Media` |
| `src/media/adapters/MediaStoreAdapter.ts` | Interface + helpers (`rawBase64`, `inferMime`, `newImageId`) |
| `src/media/adapters/FileSystemMediaStore.ts` | Native adapter (expo-file-system/legacy) |
| `src/media/adapters/IndexedDBMediaStore.ts` | Web adapter |
| `src/media/adapters/CloudMediaStore.ts` | Pro cloud-stub. `TODO(cloud-upload)` |
| `src/media/adapters/DataUriLegacyMediaStore.ts` | Read-only legacy resolver |
| `src/media/huntHydration.ts` | `hydrateHuntResult`, `hydrateRuntimeHuntFromAnalysis`, `saveHunt`, `listHistory`, `deleteHuntById`. Owns lazy migration |
| `src/media/huntSerialization.ts` | Pure: `stripBase64Images`, `isLegacyV1Hunt`, `isLegacyV2Hunt`, `buildPersistedAnalysis`, `extractMetadata` |
| `src/media/huntPersistence.ts` | Thin compatibility facade over the three above |
| `src/media/__tests__/huntPersistence.test.ts` | 16 pure-logic tests + 22 matching tests = 38 total |

## Domain types

```ts
// Analysis — reference only
interface PersistedHuntAnalysis {
  schema: 'hunt.analysis.v1';
  id: string;
  createdAt: string;
  metadata: HuntMetadata;
  analysis: any;                 // LLM JSON
  mediaRefs: string[];           // image ids
  primaryMediaRef: string | null;
  storageStrategy: StorageStrategy;
}

// Media — binary ref
interface MediaAsset {
  imageId: string;
  huntId?: string;               // reverse index
  role: 'primary' | 'context' | 'thumbnail';
  storageType: 'local-file' | 'indexeddb' | 'cloud' | 'data-uri-legacy';
  uri: string;
  storageKey?: string;
  mime: string;
  width?: number; height?: number; bytes?: number;
  createdAt: string;
}

// UI-facing
interface HydratedHuntResult {
  id: string;
  createdAt: string;
  metadata: HuntMetadata;
  analysis: any;
  media: HydratedMedia[];
  primaryMedia: HydratedMedia | null;
  primaryDisplayUri: string | null;
  displayUris: (string | null)[];
  missingMediaCount: number;
  fromSessionCache: boolean;
  warning: string | null;
}
```

## Data flow

### Save

```
setup.tsx
    ↓ saveHunt({ tier, base64Images, analysisResult, … })
huntHydration.saveHunt
    ├─ resolveStorageStrategy(tier, platform)
    ├─ mediaStore.saveMediaBatch(base64Images, { tier, huntId, role })
    │     └─ adapter.save(...) + mediaIndex.indexMedia(...)
    ├─ buildPersistedAnalysis({ mediaRefs: imageIds, … })
    ├─ analysisStore.saveAnalysis(...)
    ├─ currentHuntStore.setCurrentHunt(runtime)   ← session cache
    └─ return HydratedHuntResult
```

### Load

```
results.tsx
    ↓ loadHunt(id, tier) → hydrateHuntResult(id, tier)
huntHydration.hydrateHuntResult
    1. currentHuntStore.getCurrentHuntEntry(id)   ← fastest path
    2. analysisStore.loadAnalysis(id)
    3. legacy hunt_history / current_hunt         ← migrate inline → v3
        ├─ isLegacyV2Hunt → migrateV2ToV3
        ├─ isLegacyV1Hunt → migrateV1ToV3
    ↓
hydrateRuntimeHuntFromAnalysis(analysis, sessionUris?)
    for each imageId in analysis.mediaRefs:
        session cache hit?       → use inline URI (just-captured)
        mediaStore.getMedia(id)  → MediaAsset
        mediaStore.resolveAsset  → display URI (null OK)
    ↓
HydratedHuntResult
```

### Invariant

`JSON.stringify(persistedAnalysis)` matches neither
`/data:image\/[a-z]+;base64,/i` nor contains `"storageType"` /
`"uri"` / `"storageKey"` keys. Covered by a tier-wide test
("invariant: buildPersistedAnalysis for every tier yields
reference-only record").

## Tier-aware media backends

| Tier | Strategy | Backend | How bytes are stored |
|---|---|---|---|
| trial / core (native) | `local-uri` | `filesystem` | `file://cacheDir/raven-media/<id>.jpg` via Expo FileSystem |
| trial / core (web) | `local-uri` | `indexeddb` | Blob in object store `raven-scout-media/assets` |
| pro (any) | `cloud-uri` | `cloud` | **Stubbed today** — bytes go to the local adapter, record is stamped `storageType='cloud'`. `TODO(cloud-upload)` in `CloudMediaStore` is the one change needed to ship real cloud uploads |

Tier logic lives **only** in `storageStrategy.ts`. UI code never
branches on tier for persistence decisions.

## Migration

Legacy records are migrated on first access (lazy). Two paths:

- **v1** (base64 inlined as `mapImages`): extract → `saveMediaBatch` →
  `MediaAsset[]` → `buildPersistedAnalysis` → `saveAnalysis` →
  legacy entry removed from `hunt_history`.
- **v2** (combined record with `mediaAssets` inline): promote each
  asset to the media index (no re-upload needed — URIs are already
  persistent) → `saveAnalysis` → legacy entry removed.

Every migration emits `legacy_hunt_migrated` telemetry with the source
version, strategy, and extracted count.

## Diagnostics

All events flow through `utils/clientLog.ts` → `POST
/api/log/client-event`:

- `storage_write_failed` — analysisStore or mediaIndex write threw
- `persist_degraded` — one or more media saves failed during batch
- `hunt_loaded_from_memory_fallback` — session cache used because
  persistence is marked failed
- `hunt_not_found` — loader exhausted all sources
- `legacy_hunt_migrated` — v1 or v2 record upgraded to v3

No image bytes are ever logged.

## UX contract

- Analysis **always** loads if it's in any of the three sources.
- Results screen renders even when every media asset is missing.
- History cards show a neutral `map-outline` icon when a thumbnail
  can't be resolved.
- Dismissible gold banner on `results.tsx` when session-only mode is
  active (persistence failed).

## Known limitations

- **Pro cloud-upload is a stub.** Real uploads require filling in
  `CloudMediaStore.save` and `.resolve`. Nothing else needs to change.
- **Thumbnails are not pre-rendered.** `MediaAsset` has no
  `thumbnail` field in v3; history list resolves the primary media on
  demand. If this becomes slow, generate 64×64 thumbnails during
  `saveMedia` and store them as separate `role='thumbnail'` assets.
- **No background migration.** Legacy records are migrated on open.
  Devices that never reopen old hunts keep those records until
  access.
- **Integration adapters are not unit-tested.** 38 pure-logic tests
  cover type shape, strategy resolver, base64 stripping, legacy
  detection, and the "reference-only" invariant. Adapter I/O is
  exercised through the app.

## Extending

- Add a tier: edit `storageStrategy.ts` only.
- Add a backend: implement `MediaStoreAdapter`, register in
  `mediaStore.adapterForStrategy` + `adapterForAsset`.
- Add a schema version: bump types, teach `huntHydration` migrator to
  handle the old → new path.
- Expand analysis fields: add to `PersistedHuntAnalysis` and
  `HuntMetadata` — mediaStore and hydration layer are unaffected.
