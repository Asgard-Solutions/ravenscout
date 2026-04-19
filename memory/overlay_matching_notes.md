# Raven Scout — Overlay Matching & Focus Linking (Developer Notes)

## What changed

| File | Purpose |
| ---- | ------- |
| `frontend/src/utils/mapFocusMatching.ts` | **NEW** — pure, React-free overlay matching primitives + `matchOverlay` orchestrator. Testable in Node. |
| `frontend/src/utils/mapFocus.ts` | Refactored to delegate matching to `mapFocusMatching.ts`. `linkSetupsToOverlays` / `linkObservationsToOverlays` now produce `matchKind` + `matchQuality` diagnostics. New `resolveLocalOverlayForFocus` helper for runtime highlights. |
| `frontend/app/results.tsx` | Runtime highlight lookup now goes through `resolveLocalOverlayForFocus`, which returns `null` for weak candidates (no false-highlights). |
| `frontend/src/utils/__tests__/mapFocusMatching.test.ts` | **NEW** — 22 assertions covering the priority chain. |
| `frontend/package.json` | Added `test:unit` script + `tsx` devDependency. |

Run the tests with:

```bash
cd frontend
yarn test:unit
```

## Final matching priority

Implemented in `matchOverlay(x, y, overlays, options)`:

| Priority | Rule | Quality floor |
| -------- | ---- | ------------- |
| 1 | Explicit overlay id reference (`options.explicitOverlayId`) | `1.00` |
| 2 | v2 `based_on` back-reference from an overlay to a source id | `0.95` |
| 3 | Near-exact coordinate match (≤ `DIST_EXACT` = 2.5 pct-units) | `≥ 0.88` |
| 4 | Preferred-type match within `DIST_TIGHT` = 8 pct-units | `≥ MIN_ACCEPTABLE_QUALITY (0.3)` |
| 5 | Nearest overlay within `DIST_NEAREST_MAX` = 18 pct-units | `≥ MIN_ACCEPTABLE_QUALITY (0.3)` |
| — | Otherwise | returns `null` (focus by coords only, no link) |

Key behaviors:

- **Explicit beats everything.** A deterministic id reference is always
  honored (even when coordinates are invalid).
- **Preferred type is a tiebreaker, not a filter.** A near-exact
  coordinate match of a *different* type still wins over a slightly-off
  match of the preferred type — this matches user intent when the AI
  places a corridor overlay exactly where it says the hunter should
  sit.
- **Weak matches are dropped.** If the best candidate has quality below
  `MIN_ACCEPTABLE_QUALITY (0.3)` (roughly ≥ 70% of `DIST_NEAREST_MAX`
  away) the matcher returns `null`. The caller falls back to focusing
  by coordinate with no marker highlight.

## Active-state UX

`useMapFocus(...)` keeps `focusState.sourceId` as the single source of
truth. When a new card is tapped, the prior source is replaced
atomically (no merge logic). `AnalysisSections.tsx` already consumed
`activeId === setup.sourceId` / `activeId === obs.id`, so:

- The previously focused card's button reverts to **FOCUS ON MAP** /
  **VIEW ON MAP** as soon as a different item is tapped.
- The newly focused card shows **FOCUSED** with the accent fill until
  the auto-clear timer (3.5s) fires or the user taps another item.

## Known limitations (still outstanding)

- **No GIS/lat-lon resolution.** The pulsing ring and highlight work
  in *percentage coordinate space* relative to the primary captured
  map image, not against MapLibre's lat/lon. Tapping a setup while the
  `MAP` tab is active still redirects the user to the `ANALYSIS` tab.
- **The MapLibre base map is not panned.** Moving the base map to a
  setup's real-world lat/lon requires the AI to emit geo-anchored
  coordinates, which isn't part of the current v2 schema. Planned for
  the future GIS integration phase.
- **Local overlay ids can diverge from v2 ids.** Older hunts stored in
  AsyncStorage may have locally-generated ids (`overlay-{i}-{ts}`)
  instead of v2 `ov_N`. The runtime resolver therefore falls back to
  coordinate-based matching for those records. Explicit-id matching
  only fires for hunts analyzed by the v2 backend (i.e. hunts created
  after the LLM pipeline upgrade).
- **No Jest / RN Testing Library.** The `test:unit` script uses Node's
  built-in test runner via `tsx`; it only covers pure logic in
  `mapFocusMatching.ts` and the plain helpers in `mapFocus.ts`
  (`linkSetupsToOverlays`, `linkObservationsToOverlays`). Component
  rendering (FocusRing, AnalysisSections) is not under unit coverage
  — rely on the Playwright/Expo testing agents for that.

## Extending the matcher

If you need a new priority (e.g. species-aware preferences), add:

1. A new helper in `mapFocusMatching.ts` that returns `T | null`.
2. A new `kind` literal in `MatchKind`.
3. A block in `matchOverlay(...)` that runs the helper in the desired
   position of the chain and returns a `MatchResult` with a sensible
   `quality` score.
4. Corresponding test cases in
   `src/utils/__tests__/mapFocusMatching.test.ts`.

Do **not** bypass the `minAcceptableQuality` guard for fuzzy rules —
that guard is the reason no bad overlays get highlighted for hunts
that happen to have a single distant candidate.
