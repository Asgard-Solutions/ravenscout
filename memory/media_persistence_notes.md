# Raven Scout — Media / Analysis Persistence (mobile-only)

## Supported runtime

**Native mobile only.** iOS and Android via Expo. The web preview can
be used for development but is not a shipping target; any code
referencing IndexedDB, localStorage quotas, or browser object URLs
has been removed from the production path.

| Aspect | Value |
|---|---|
| Bundler | Metro via Expo Router |
| Device storage | Expo FileSystem (`cacheDirectory`) |
| Key/value store | AsyncStorage (backed by native secure storage) |
| Cloud (Pro) | **Stubbed** — local FileSystem today, one-file swap when real upload ships |
| Web path | Not supported — development previews only |

## Two-store split architecture

```
┌──────────────────────┐          ┌─────────────────────────┐
│ AnalysisStore        │          │ MediaStore               │
│ key: raven_analysis  │          │ bytes → FileSystem       │
│ PersistedHuntAnalysis│          │ index → raven_media_idx  │
│ (refs only)          │          │ (MediaAsset metadata)    │
└──────────┬───────────┘          └───────────┬─────────────┘
           │                                  │
           └────────── HuntHydration ─────────┘
                       │
                       ▼
              HydratedHuntResult (UI)
```

- **AnalysisStore** (`raven_analysis_v1`) holds `PersistedHuntAnalysis`
  records — metadata, LLM output, and `mediaRefs: string[]`.
  NEVER contains image bytes or MediaAsset shapes.
- **MediaStore** persists bytes via the active adapter and keeps a
  reverse index (`raven_media_index_v1`) of `MediaAsset` records keyed
  by `imageId` with an optional `huntId` back-pointer.
- **HuntHydration** joins them into `HydratedHuntResult` for UI.

## Tier → storage

| Tier | Strategy | Backend | Where bytes live |
|---|---|---|---|
| Core / Trial | `local-uri` | `filesystem` | `file://cacheDir/raven-media/<imageId>.jpg` |
| Pro | `cloud-uri` | `cloud` | **Stubbed** → same FileSystem path, `MediaAsset.storageType='cloud'`. When real cloud ships, fill in `CloudMediaStore.save`/`.resolve` only |

Tier logic lives **only** in `storageStrategy.ts`. The `platform`
argument is accepted for API symmetry but ignored — there's one
production runtime.

## Files

| File | Role |
|---|---|
| `src/media/types.ts` | Domain types; `StorageType` includes `indexeddb` only as a **quarantined** legacy value (read path for historical web-preview records) |
| `src/media/storageStrategy.ts` | Tier resolver. Only two backends: `filesystem`, `cloud` |
| `src/media/analysisStore.ts` | Reference-only analysis CRUD |
| `src/media/mediaIndex.ts` | MediaAsset metadata index |
| `src/media/mediaStore.ts` | Facade: `saveMedia`, `getMedia`, `resolveMediaUri`, `listMediaForHunt`, `removeMediaForHunt`, `migrateLegacyBase64Media` |
| `src/media/adapters/FileSystemMediaStore.ts` | **Primary** byte adapter (Expo FileSystem, no platform guards) |
| `src/media/adapters/CloudMediaStore.ts` | Pro stub — delegates to FileSystem, stamps `storageType='cloud'`. `TODO(cloud-upload)` at the single point where this will change |
| `src/media/adapters/DataUriLegacyMediaStore.ts` | Read-only resolver for legacy inline base64 and for any stray `indexeddb` records from prior web preview testing |
| `src/media/huntHydration.ts` | `hydrateHuntResult`, `saveHunt`, `listHistory`, lazy migration |
| `src/media/huntSerialization.ts` | Pure: `stripBase64Images`, legacy detection, `buildPersistedAnalysis` |
| `src/media/huntPersistence.ts` | Compatibility facade |
| `src/media/imageProfiles.ts` | Pure: `PROFILE_PRO`, `PROFILE_CORE`, `PROFILE_THUMBNAIL`, `profileForTier()` |
| `src/media/imageProcessor.ts` | Wraps `expo-image-manipulator`. `compressImage(input, profile)`, `buildThumbnail(input)`. Uses `imageProbe` to skip recompression when JPEG is already within budget; returns `failed: true` on ImageManipulator errors so callers can avoid persisting degraded thumbnails |
| `src/media/imageProbe.ts` | Pure: cheap JPEG/PNG header probe (no decoding). `probeImage(input)` + `shouldSkipCompression(input, { maxDim, targetMaxBytes? })` |
| `src/media/__tests__/imageProcessor.test.ts` | Pure profile tests (Pro vs Core, defaults, case-insensitive) |
| `src/media/__tests__/imageProbe.test.ts` | Pure probe/guardrail tests: JPEG/PNG dimension parsing, skip-within-budget, oversized-width, not-jpeg, oversized-bytes, custom targetMaxBytes |
| `src/media/__tests__/huntPersistence.test.ts` | 18 pure tests (+22 matching) — all mobile-oriented |

## Image processing on ingest

`saveMedia()` runs every primary/context image through
`expo-image-manipulator` before handing bytes to the adapter.

| Tier | Profile | Max dimension | JPEG quality |
|---|---|---|---|
| Pro | `PROFILE_PRO` | 2048 px | 0.85 |
| Core / Trial | `PROFILE_CORE` | 1280 px | 0.70 |

The thumbnail profile (`PROFILE_THUMBNAIL`, 160 px / 0.50) runs in
parallel for every primary asset and is stored as a separate
`role='thumbnail'` MediaAsset. The primary asset's `thumbnailRef`
holds the thumbnail's `imageId`. History cards prefer `thumbnailRef`
over `primaryMediaRef` for fast list rendering.

## Hunt deletion / device cleanup

- `deleteHuntById(id)` removes the analysis record AND calls
  `removeMediaForHunt(id)` which deletes every byte (primary,
  context, thumbnail) plus index entries for that hunt.
- `clearAllDeviceMedia()` (exposed via `mediaStore` and the
  `huntPersistence` facade) wipes every byte managed by adapters,
  removes the entire `raven-media` cache directory, and clears the
  media index. The "Clear All Hunts" action on history.tsx now also
  wipes all device media in addition to AsyncStorage keys.

## What was removed in the mobile-only cleanup

- **Deleted:** `src/media/adapters/IndexedDBMediaStore.ts`. No production
  write path ever touches IndexedDB again.
- **Strategy resolver** no longer branches on `platform === 'web'`. The
  `StrategyResult.preferredBackend` union is now `'filesystem' | 'cloud'
  | 'none'`. Any prior consumer that inspected `'indexeddb'` would have
  been dead code.
- **FileSystemMediaStore** removed `Platform.OS === 'web'` guards. On
  mobile these always resolved false and just added noise.
- **Tests** — removed web strategy cases; added explicit "no backend
  ever resolves to indexeddb" + "platform arg is ignored" invariants.
- **Type surface** — `StorageType` retains `'indexeddb'` only as a
  read-path escape hatch for any stray historical records from web
  previews. Resolvers route it to `DataUriLegacyMediaStore` which can
  only return null for non-data URIs — callers then see a placeholder,
  not a crash.

## Failure modes we now care about (all mobile)

| Concern | Mitigation |
|---|---|
| Device disk pressure on Free tier with lots of cached hunts | `removeMediaForHunt(huntId)` (called by `deleteHuntById`); plus planned thumbnail generation + compression |
| AsyncStorage corruption / quota (rare on native) | `storage_write_failed` telemetry + in-memory session fallback |
| File missing at resolve time (user cleared app cache) | `resolveAsset` returns `null` → UI renders placeholder |
| Pro account with no network while cloud stub is in place | Works identically to Core today since bytes are on device |

## Diagnostics

Events via `utils/clientLog.ts` → `POST /api/log/client-event`:

- `storage_write_failed` — AnalysisStore or MediaIndex write threw
- `persist_degraded` — one or more media saves failed (device disk / adapter error)
- `hunt_loaded_from_memory_fallback` — session cache used after persist failure
- `hunt_not_found` — loader exhausted all sources
- `legacy_hunt_migrated` — v1 or v2 record upgraded to v3

No image bytes are logged.

## Migration

Lazy, on-access:
- v1 (base64 inlined): extract → `saveMediaBatch` → v3 record → delete legacy entry
- v2 (combined record with embedded `mediaAssets`): promote assets into `mediaIndex` (bytes already in place) → v3 record → delete legacy entry

## Known limitations

- **Thumbnails are pre-rendered** at ingest (160 px JPEG via
  `PROFILE_THUMBNAIL`). If thumbnail generation or persistence fails,
  `saveThumbnailFor` logs `persist_degraded` and returns `null`; the
  primary asset's `thumbnailRef` stays undefined and history lists
  fall back to the primary. No dangling thumbnail refs.
- **Image compression on ingest is tier-aware** and skipped when the
  input is already a JPEG within the profile's max-dim + a generous
  per-megapixel byte budget. Recompression failures fall back to the
  original input; the caller sees `failed: true` and skips dependent
  work (e.g. thumbnail generation).
- **FileSystem deletes are idempotent.** Both `remove(asset)` and
  `removeAll()` use `FileSystem.deleteAsync(uri, { idempotent: true })`
  wrapped in try/catch, so missing/partially-deleted files never break
  the index.
- **Pro cloud upload is a stub.** `CloudMediaStore` delegates to local
  FileSystem. Swap only `save()`/`resolve()` when the real service is
  provisioned.
- **Integration adapters are not unit-tested.** Pure logic has 57
  tests; adapter I/O is exercised through the app.

## Extending

- Add a tier: edit `storageStrategy.ts` only.
- Ship real cloud: fill in `CloudMediaStore.save`/`.resolve`; no other
  file changes.
- Add a new role: extend `MediaRole` in `types.ts`; no adapter changes.
