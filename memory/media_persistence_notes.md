# Raven Scout — Media Persistence Architecture

## TL;DR

Hunt images no longer live inside AsyncStorage/localStorage. They flow
through a tier-aware storage strategy:

| Tier         | Platform | Where bytes live        | What's persisted in AsyncStorage |
|--------------|----------|-------------------------|----------------------------------|
| Core / Trial | native   | Expo FileSystem cache   | `MediaAsset` ref (`file://…`)    |
| Core / Trial | web      | IndexedDB object store  | `MediaAsset` ref (`idb://…`)     |
| Pro          | any      | **Cloud (stub today)**  | `MediaAsset` ref w/ `storageType='cloud'` |

AsyncStorage / localStorage is NEVER allowed to contain base64 image
data. A recursive stripping pass runs right before every write as a
final safeguard.

## Where things live

| File | Role |
|---|---|
| `src/media/types.ts` | `MediaAsset`, `RuntimeMediaAsset`, `PersistedHunt`, `RuntimeHunt`, `LegacyHuntRecord`, strategy + storage type unions |
| `src/media/storageStrategy.ts` | Single `resolveStorageStrategy({tier, platform})` — the only place tier→backend mapping lives |
| `src/media/adapters/MediaStoreAdapter.ts` | Interface + shared helpers (`rawBase64`, `inferMime`, `newAssetId`) |
| `src/media/adapters/FileSystemMediaStore.ts` | Native adapter using `expo-file-system` |
| `src/media/adapters/IndexedDBMediaStore.ts` | Web adapter using IndexedDB object store |
| `src/media/adapters/CloudMediaStore.ts` | **Pro adapter stub** — delegates bytes to local store, stamps `storageType='cloud'`. `TODO(cloud-upload)` is the only place to change when real cloud ships |
| `src/media/adapters/DataUriLegacyMediaStore.ts` | Read-only — resolves legacy inline `data:` URIs so old hunts still render during migration |
| `src/media/mediaStore.ts` | Facade: `ingestImage`, `extractAndStoreImages`, `resolveAsset`, `removeAsset`, `adapterForStrategy`, `adapterForAsset` |
| `src/media/huntSerialization.ts` | **Pure** functions only: `isBase64DataUri`, `stripBase64Images`, `toPersistedHunt`, `fromPersistedHunt`, `buildRuntimeHunt`, `isLegacyHunt` |
| `src/media/safePersist.ts` | Storage-budget ladder — drops thumbnails → weather → media assets → metadata-only |
| `src/media/huntMigration.ts` | Lazy migration from pre-v2 records (base64 inline) to v2 (reference-only) |
| `src/media/huntPersistence.ts` | **High-level API** used by screens: `saveHunt`, `loadHunt`, `listHistory`, `deleteHuntById` |

## Runtime vs persisted

Two explicit TypeScript types:

- `RuntimeHunt` — used by UI screens. May carry `mediaDisplayUris`
  (ephemeral base64/blob URLs for the current session).
- `PersistedHunt` — what lives in AsyncStorage. `schema='hunt.persisted.v2'`,
  `mediaAssets: MediaAsset[]`, NO base64 anywhere.

Transformation goes through `toPersistedHunt()` (runtime → persisted)
which runs `stripBase64Images()` as an invariant-enforcing safeguard.

## Ingestion pipeline (save flow)

`setup.tsx` calls `saveHunt({ tier, base64Images, analysisResult, … })`
and the library handles the rest:

1. `resolveStorageStrategy` picks the adapter.
2. `extractAndStoreImages` writes bytes into FileSystem / IndexedDB /
   Cloud-stub. Returns `MediaAsset[]` (reference-only) + runtime-only
   display URIs (raw base64 kept for the current session).
3. `buildRuntimeHunt` assembles the hunt record.
4. `setCurrentHunt(...)` stashes the runtime record in the in-memory
   store so results.tsx can render immediately regardless of storage
   outcome.
5. `toPersistedHunt` strips any lingering base64.
6. `applyBudget` runs the degradation ladder if the serialized record
   is above the 2.5 MB per-record target.
7. `AsyncStorage.setItem('hunt_history', ...)` — if this throws we
   fall back to a single-slot `current_hunt` write.
8. Telemetry: `storage_write_failed` / `persist_degraded` emit
   structured events to `/api/log/client-event`.

## Load flow

`loadHunt(id, tier)` tries sources in this order:

1. **In-memory** (`currentHuntStore`) — fastest; survives navigation
   within the session even if AsyncStorage writes failed.
2. **hunt_history** — the normal path.
3. **current_hunt** — fallback slot.

If the record matches `isLegacyHunt()`, it is migrated on-the-fly via
`migrateLegacyHunt()` and written back, freeing localStorage room for
new hunts. Telemetry event: `legacy_hunt_migrated`.

## Storage budget guard

`applyBudget(record, maxBytes = 2_500_000)` progressively degrades:

```
noop → drop-thumbnails → drop-weather → drop-media-assets → metadata-only
```

`metadata-only` produces a record containing just `id`, species,
date, time window, overlay count — enough for history display when
nothing else fits.

## Diagnostics / telemetry

All logged via `utils/clientLog.ts` → `POST /api/log/client-event`:

- `storage_write_failed` — both AsyncStorage writes threw
- `persist_degraded`    — persistedOk but one or more budget stages fired
- `hunt_loaded_from_memory_fallback` — rendered from in-memory after persistence failure
- `hunt_not_found` — loader exhausted all sources
- `legacy_hunt_migrated` — pre-v2 record converted to v2 on access

None of these events contain image bytes.

## UX contract

- Result screen always renders if the hunt exists in any of the three
  sources — the old "RESULTS NOT FOUND" path is only reachable if the
  id is truly missing.
- A dismissible gold banner shows on `results.tsx` when the current
  hunt failed to persist: *"Session-only: this hunt was not saved
  (storage full). Take notes before leaving."*
- Missing images render a neutral map-outline placeholder on both
  `history.tsx` and `results.tsx` — never a broken image or crash.

## Known limitations

- **Pro cloud upload is a stub.** `CloudMediaStore` delegates bytes
  to the same local adapter Core uses but stamps the persisted record
  with `storageType='cloud'`. When real cloud ships, change only
  `CloudMediaStore.save/resolve` — nothing else.
- **Thumbnails are not pre-rendered.** `MediaAsset.thumbnail` is a
  schema-level hook but we don't generate tiny previews today. History
  list falls back to a placeholder icon; full-resolution images load
  lazily via `resolveAsset()` when a card is tapped.
- **IndexedDB quota per origin is finite.** If the browser runs out,
  individual `ingestImage` calls throw → `extractAndStoreImages` emits
  a placeholder `MediaAsset` with empty `uri` so the rest of the hunt
  still saves. Results page renders with placeholder thumbs in that
  case.
- **No background migration job.** Migration is lazy (on load). A
  device that never reopens an old hunt keeps the legacy record until
  the user opens it.
- **Integration tests are manual.** Unit coverage is pure logic only
  (`yarn test:unit`, 41 assertions). Storage adapter I/O is exercised
  through the app.

## Extending

**To add a new tier → storage mapping:** edit `storageStrategy.ts`
only. No other file should branch on tier.

**To plug in real cloud uploads:** implement `save` / `resolve` in
`adapters/CloudMediaStore.ts`; leave everything else alone.

**To add a new degradation stage:** add a step in `safePersist.ts`
between existing ones, update the `DegradationStep` union, and add a
test in `__tests__/huntPersistence.test.ts`.
