# Raven Scout — Analysis Context & Overlay Alignment

Status: **Implemented v3.1** (this change set).

## Problem fixed

1. Saved overlays could revert to the original hunt GPS (or the wrong
   image) after reload — there was no single locked "analysis basis".
2. The rendered image had no zoom/pan; there was also no shared
   transform between image and overlays, so any future zoom/pan
   would have drifted overlays off the image.

## Architecture

### New persistent shape

`PersistedHuntAnalysis.analysisContext` captures the exact image and
GPS the overlays were bound to at save time:

```ts
type AnalysisContext = {
  schema: 'analysis-context.v1';
  imageId: string;                    // canonical primary mediaRef
  gps: { lat: number; lon: number } | null;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  overlayCalibration: OverlayCalibration | null;
  overlayStatus: 'valid' | 'stale';
  lockedAt: string;                   // ISO timestamp
};
```

`HuntMetadata.locationCoords` keeps its existing meaning ("hunt-level
default GPS"). The resolver NEVER falls back to it when
`analysisContext.gps` is present (not even when `gps === null`).

### Precedence (resolveAnalysisBasis)

1. `analysisContext.imageId` + `analysisContext.gps` (frozen lock)
2. `primaryMedia.asset.imageId` + `metadata.locationCoords`
   (fallback for legacy records that predate v3.1)
3. Null basis (nothing usable)

### Staleness invariants

- Hydrator stamps `overlayStatus='stale'` when
  `analysisContext.imageId` no longer resolves to any media.
- `markOverlayStale(huntId)` explicitly flips the flag; to be called
  whenever UI lets users change the basis (switch primary image,
  move GPS, edit calibration anchors).
- `wouldInvalidateContext(ctx, nextBasis)` is a pure pre-flight
  check.

## Rendering — shared transform

`ImageOverlayCanvas` (new, `src/components/ImageOverlayCanvas.tsx`)
renders the analyzed image and its overlay children inside a single
`Animated.View` that receives pinch + pan + double-tap-reset gestures
(`react-native-gesture-handler` v2 + `react-native-reanimated`).

Overlay anchors remain in image-space (`x_percent`, `y_percent`) and
sit inside the animated parent, so at any scale/translate the image
and overlays move together. Zoom is disabled in edit mode so the
existing PanResponder-based marker drag stays predictable at scale=1.

`GestureHandlerRootView` now wraps the app in `app/_layout.tsx`.

## Files changed

| File | Change |
|---|---|
| `src/media/types.ts` | added `AnalysisContext`, extended `PersistedHuntAnalysis` and `HydratedHuntResult` |
| `src/media/huntSerialization.ts` | `buildPersistedAnalysis` now accepts `analysisContext` |
| `src/media/huntHydration.ts` | `saveHunt` builds+persists the context; hydrator downgrades missing-media refs to stale; `markOverlayStale` helper |
| `src/media/huntPersistence.ts` | re-exports `buildInitialAnalysisContext`, `markOverlayStale` |
| `src/utils/analysisContext.ts` | **NEW** — pure resolver, staleness checks, initial builder |
| `src/utils/__tests__/analysisContext.test.ts` | **NEW** — 21 unit tests |
| `src/components/ImageOverlayCanvas.tsx` | **NEW** — shared-transform image+overlay container |
| `app/_layout.tsx` | wrap app in `GestureHandlerRootView` |
| `app/setup.tsx` | capture primary image natural dims via `Image.getSize`; pass `analysisContext` to `saveHunt` |
| `app/results.tsx` | resolve basis, override `primaryImage` with basis URI, render image+overlays inside `ImageOverlayCanvas`, show stale banner |

## Tests

`yarn test:unit` → **94 / 94 passing** (was 73; +21 new for this change).

Coverage:
- analysisContext overrides hunt-level locationCoords
- explicit null analysis GPS is respected (no fallback)
- missing analysisContext falls back to primaryMedia
- stale detection for missing/explicit states
- `wouldInvalidateContext` per-field diff
- `buildInitialAnalysisContext` GPS + dim precedence
- backwards-compat: records without analysisContext still hydrate

## Edge cases handled

- Image B analyzed while hunt started with image A → overlays lock to B
- GPS changed before analyze → locked to analysis-time GPS
- App reload → overlays rebuilt from frozen basis, not hunt defaults
- Primary image removed from media index → basis becomes stale,
  overlays hidden, banner shown, GPS still usable
- Missing image file / unresolvable URI → render skipped without crash
- Double-tap on canvas → resets zoom/pan to scale=1, translate=0
