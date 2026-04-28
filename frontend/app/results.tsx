import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Dimensions, PanResponder, Alert, Modal, FlatList, ActivityIndicator, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, CUSTOM_MARKER_TYPES } from '../src/constants/theme';
import { useNetwork } from '../src/hooks/useNetwork';
import TacticalMapView from '../src/map/TacticalMapView';
import { buildAnalysisViewModel, type AnalysisViewModel } from '../src/utils/analysisAdapter';
import { AnalysisSummaryCard, TopSetupsSection, WindAnalysisCard, MapObservationsSection, AssumptionsCard, SpeciesTipsCard } from '../src/components/AnalysisSections';
import { useMapFocus, resolveLocalOverlayForFocus } from '../src/utils/mapFocus';
import { loadHunt as loadHuntFromStore, finalizeProvisionalHunt } from '../src/media/huntPersistence';
import { RavenSpinner } from '../src/components/RavenSpinner';
import { useScrollToTopOnFocus } from '../src/hooks/useScrollToTopOnFocus';
import { useAuth } from '../src/hooks/useAuth';
import { logClientEvent } from '../src/utils/clientLog';
import { ImageOverlayCanvas } from '../src/components/ImageOverlayCanvas';
import { SavedAnalysisOverlayImage } from '../src/components/SavedAnalysisOverlayImage';
import { MarkerFormModal, type MarkerFormFields, type PlacementSummary } from '../src/components/MarkerFormModal';
import {
  listOverlayItems,
  createOverlayItem,
  updateOverlayItem,
  deleteOverlayItem,
} from '../src/api/overlayItemsApi';
import { listSavedMapImages } from '../src/api/savedMapImagesApi';
import { savedMapImageFromWire } from '../src/types/geo';
import { buildMarkerPlacement } from '../src/utils/markerPlacement';
import type { AnalysisOverlayItem, SavedMapImage } from '../src/types/geo';
import {
  resolveAnalysisBasis,
  type ResolvedAnalysisBasis,
} from '../src/utils/analysisContext';
import {
  computeFittedImageRect,
  findOutOfBoundsOverlayIndices,
} from '../src/utils/imageFit';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_WIDTH = SCREEN_WIDTH - 32;
const MAP_HEIGHT = 350;

interface OverlayMarker {
  id: string;
  type: string;
  label: string;
  x_percent: number;
  y_percent: number;
  width_percent?: number;
  height_percent?: number;
  reasoning: string;
  confidence: string;
  isCustom?: boolean;
}

interface HuntResult {
  id: string;
  overlays: OverlayMarker[];
  summary: string;
  top_setups: string[];
  wind_notes: string;
  best_time: string;
  key_assumptions: string[];
  species_tips: string[];
}

interface HuntRecord {
  id: string;
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  mapImage?: string;
  mapImages?: string[];
  result: HuntResult;
  createdAt: string;
  locationCoords?: { lat: number; lon: number };
}

const OVERLAY_COLORS = require('../src/constants/overlayTaxonomy').OVERLAY_COLORS as Record<string, string>;
const OVERLAY_ICONS = require('../src/constants/overlayTaxonomy').OVERLAY_ICONS as Record<string, string>;
const OVERLAY_LABELS = require('../src/constants/overlayTaxonomy').OVERLAY_LABELS as Record<string, string>;
const resolveOverlayColor = require('../src/constants/overlayTaxonomy').resolveOverlayColor as (overlay: { type?: string; color?: string }) => string;

const CONFIDENCE_COLORS: Record<string, string> = {
  high: COLORS.stands,
  medium: COLORS.accent,
  low: COLORS.fogGray,
};

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ huntId: string }>();
  const { isConnected } = useNetwork();
  const [hunt, setHunt] = useState<HuntRecord | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<OverlayMarker | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  // View mode: 'map' (MapLibre base) or 'analysis' (image + overlays)
  const [viewMode, setViewMode] = useState<'analysis' | 'map'>('analysis');

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [overlays, setOverlays] = useState<OverlayMarker[]>([]);
  const [originalOverlays, setOriginalOverlays] = useState<OverlayMarker[]>([]);
  const [addMode, setAddMode] = useState(false);
  const [addMarkerType, setAddMarkerType] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // v2 analysis view model
  const [analysisVM, setAnalysisVM] = useState<AnalysisViewModel | null>(null);

  // Multi-map state
  const [currentMapIndex, setCurrentMapIndex] = useState(0);
  const mapScrollRef = useRef<ScrollView>(null);
  const rootScrollRef = useRef<ScrollView>(null);
  useScrollToTopOnFocus(rootScrollRef);
  const [loadFailed, setLoadFailed] = useState(false);
  const [persistWarning, setPersistWarning] = useState<string | null>(null);
  // Frozen analysis basis — the exact image + GPS the overlays were
  // locked to at save time. Overrides primary-map-index and hunt-level
  // locationCoords when present. See src/utils/analysisContext.ts.
  const [analysisBasis, setAnalysisBasis] = useState<ResolvedAnalysisBasis | null>(null);

  // Task 9 — persisted AnalysisOverlayItem rows for this hunt. These
  // are rendered inside SavedAnalysisOverlayImage with original-image
  // x/y scaled to the current displayed image size. When the hunt
  // has none (legacy / pre-Task-8 data), the panel hides itself.
  const [savedOverlayItems, setSavedOverlayItems] = useState<AnalysisOverlayItem[]>([]);

  // Task 10 — most-recent saved map image for this hunt (used to
  // expose geo bounds + supportsGeoPlacement to the marker placer).
  const [savedMapImage, setSavedMapImage] = useState<SavedMapImage | null>(null);

  // Task 10 — marker add/edit UI state.
  const [markerAddMode, setMarkerAddMode] = useState(false);
  const [markerForm, setMarkerForm] = useState<
    | null
    | {
        mode: 'create';
        placement: PlacementSummary;
        renderedX: number;
        renderedY: number;
      }
    | { mode: 'edit'; item: AnalysisOverlayItem }
  >(null);
  const [markerBusy, setMarkerBusy] = useState(false);

  // v2 Overlay-to-Setup linking & focus
  const { focusState, linkedSetups, linkedObservations, focus, clearFocus } = useMapFocus(
    analysisVM?.topSetups || [],
    analysisVM?.mapObservations || [],
    analysisVM?.overlays || [],
  );

  // Pulsing ring animation value
  const focusPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!focusState.target) {
      focusPulse.stopAnimation();
      focusPulse.setValue(0);
      return;
    }
    // Start loop pulse animation
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(focusPulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(focusPulse, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [focusState.tick, focusState.target, focusPulse]);

  // React to a new focus: switch to analysis view, scroll up, highlight nearest local overlay
  useEffect(() => {
    if (!focusState.target) return;
    // Switch to analysis view (overlays only render there)
    if (viewMode !== 'analysis') setViewMode('analysis');
    // Scroll root list to show the map at the top
    setTimeout(() => {
      rootScrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 50);
    // Resolve nearest local overlay using the priority chain — this
    // avoids false-linking when the best candidate is too weak.
    const resolved = resolveLocalOverlayForFocus(focusState.target, overlays);
    if (resolved) {
      setSelectedOverlay(resolved as OverlayMarker);
    } else {
      setSelectedOverlay(null);
    }
  }, [focusState.tick]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Mount / unmount + render-error diagnostics. We've seen the
  // screen hydrate successfully then disappear on mobile Chrome —
  // this tells us whether it's a render throw, a navigation event,
  // or a memory-pressure reload.
  useEffect(() => {
    logClientEvent({
      event: 'results_screen_mounted',
      data: { hunt_id: params.huntId as string | undefined ?? null },
    });
    return () => {
      logClientEvent({
        event: 'results_screen_unmounted',
        data: { hunt_id: params.huntId as string | undefined ?? null },
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      const found = await loadHuntAsync();
      if (cancelled) return;
      if (found) {
        applyHunt(found.hunt);
        if (found.warning) setPersistWarning(found.warning);
      } else {
        setLoadFailed(true);
      }
    };

    // Start the load
    run();
    // Safety timeout — only fires if we never resolved.
    timeout = setTimeout(() => {
      if (cancelled) return;
      setHunt(prev => {
        if (!prev) {
          setLoadFailed(true);
          logClientEvent({
            event: 'hunt_not_found',
            data: { hunt_id: params.huntId, reason: 'timeout' },
          });
        }
        return prev;
      });
    }, 5000);

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [params.huntId]);

  // Task 9 — fetch persisted overlay items (from
  // /api/hunts/:id/overlay-items) once we know the hunt id. These
  // are rendered in the saved-image overlay panel below the
  // analysis view. Failures are silent — the panel just stays
  // empty for legacy hunts that don't have any persisted items.
  //
  // Task 10 — also fetch the most recent SavedMapImage so we
  // know whether the rendered image is geo-capable; this drives
  // whether tap placements derive lat/lng or stay pixel-only.
  useEffect(() => {
    let cancelled = false;
    const huntId = (params.huntId as string | undefined) || (hunt as any)?.id;
    if (!huntId) return;
    (async () => {
      const [itemsR, imgR] = await Promise.all([
        listOverlayItems(huntId),
        listSavedMapImages(huntId),
      ]);
      if (cancelled) return;
      if (itemsR.ok) {
        setSavedOverlayItems(itemsR.data.items || []);
      } else {
        setSavedOverlayItems([]);
      }
      if (imgR.ok && imgR.data.saved_map_images.length > 0) {
        // Pick the most recent record (backend already sorts desc).
        const img = savedMapImageFromWire(imgR.data.saved_map_images[0]);
        setSavedMapImage(img);
      } else {
        setSavedMapImage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.huntId, hunt?.id]);

  // Task 10 — handlers for add / edit / delete on the saved-marker
  // panel. Each calls the API, updates local state on success, and
  // logs telemetry on failure. Adds always derive coords via
  // buildMarkerPlacement so geo-capable images get GPS and pixel-
  // only ones never fabricate coordinates.
  const huntIdForMarkers = (params.huntId as string | undefined) || (hunt as any)?.id;
  const renderedW = useMemo(() => {
    return Math.max(1, MAP_WIDTH);
  }, []);
  const handleTapPlaceMarker = useCallback(
    (rendX: number, rendY: number) => {
      const ow = analysisBasis?.naturalWidth || 0;
      const oh = analysisBasis?.naturalHeight || 0;
      // Respect the FITTED rendered rect so we never write a marker
      // onto letterbox padding. (Component uses the same dims for
      // image + overlay layer.)
      const rw = renderedW;
      const rh = MAP_HEIGHT;
      const placement = buildMarkerPlacement({
        renderedX: rendX,
        renderedY: rendY,
        renderedWidth: rw,
        renderedHeight: rh,
        originalWidth: ow,
        originalHeight: oh,
        geo: savedMapImage
          ? {
              bounds:
                typeof savedMapImage.northLat === 'number' &&
                typeof savedMapImage.southLat === 'number' &&
                typeof savedMapImage.westLng === 'number' &&
                typeof savedMapImage.eastLng === 'number'
                  ? {
                      northLat: savedMapImage.northLat,
                      southLat: savedMapImage.southLat,
                      westLng: savedMapImage.westLng,
                      eastLng: savedMapImage.eastLng,
                    }
                  : null,
              supportsGeoPlacement: savedMapImage.supportsGeoPlacement,
            }
          : null,
      });
      if (!placement.ok) {
        Alert.alert('Cannot place marker', `(${placement.reason})`);
        return;
      }
      setMarkerForm({
        mode: 'create',
        renderedX: rendX,
        renderedY: rendY,
        placement: {
          x: placement.data.x,
          y: placement.data.y,
          latitude: placement.data.latitude,
          longitude: placement.data.longitude,
          coordinateSource: placement.data.coordinateSource,
        },
      });
    },
    [analysisBasis, savedMapImage, renderedW],
  );

  const handleEditItem = useCallback((item: AnalysisOverlayItem) => {
    setMarkerForm({ mode: 'edit', item });
  }, []);

  const handleDeleteItem = useCallback(
    async (item: AnalysisOverlayItem) => {
      if (!huntIdForMarkers) return;
      Alert.alert(
        'Delete marker?',
        'This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setMarkerBusy(true);
              const r = await deleteOverlayItem(huntIdForMarkers, item.id);
              setMarkerBusy(false);
              if (!r.ok) {
                Alert.alert(
                  'Could not delete marker',
                  (r as any).error || r.reason,
                );
                return;
              }
              setSavedOverlayItems(prev => prev.filter(it => it.id !== item.id));
            },
          },
        ],
        { cancelable: true },
      );
    },
    [huntIdForMarkers],
  );

  const handleSubmitMarkerForm = useCallback(
    async (fields: MarkerFormFields) => {
      if (!huntIdForMarkers || !markerForm) return;
      setMarkerBusy(true);
      try {
        if (markerForm.mode === 'create') {
          const p = markerForm.placement;
          const r = await createOverlayItem(huntIdForMarkers, {
            type: fields.type,
            label: fields.name,
            description: fields.notes ?? null,
            x: p.x,
            y: p.y,
            latitude: p.latitude ?? null,
            longitude: p.longitude ?? null,
            coordinateSource: p.coordinateSource,
            savedMapImageId: savedMapImage?.id || null,
          });
          if (!r.ok) {
            Alert.alert(
              'Could not save marker',
              (r as any).error || r.reason,
            );
            return;
          }
          // Re-list to keep state fresh and pick up any backend-side
          // canonicalisation (e.g. confidence defaulting).
          const refresh = await listOverlayItems(huntIdForMarkers);
          if (refresh.ok) setSavedOverlayItems(refresh.data.items);
          setMarkerForm(null);
          setMarkerAddMode(false);
        } else {
          const r = await updateOverlayItem(huntIdForMarkers, markerForm.item.id, {
            type: fields.type,
            label: fields.name,
            description: fields.notes ?? null,
          });
          if (!r.ok) {
            Alert.alert(
              'Could not update marker',
              (r as any).error || r.reason,
            );
            return;
          }
          const refresh = await listOverlayItems(huntIdForMarkers);
          if (refresh.ok) setSavedOverlayItems(refresh.data.items);
          setMarkerForm(null);
        }
      } finally {
        setMarkerBusy(false);
      }
    },
    [huntIdForMarkers, markerForm, savedMapImage],
  );

  const { user } = useAuth();

  // --- Deferred provisional finalization ---
  // After /results successfully hydrates a hunt (typically from the
  // provisional hot-cache on first view post-analysis), run the full
  // saveHunt pipeline in the background. This is where:
  //   - Image bytes are uploaded to S3 via presigned URLs
  //   - The analysis record is written to AnalysisStore / MongoDB
  //   - The provisional hot-cache entry is cleared on success
  //
  // We intentionally defer this past the first paint on /results so
  // mobile Chrome doesn't double-allocate 1-3MB base64 payloads
  // during the route transition from /setup (which previously OOM'd
  // the tab). A single 600ms settle lets the DOM paint, releases the
  // bitmap decode memory, and THEN we kick off persistence.
  //
  // Idempotent — bails out immediately if analysisStore already has
  // the record (second mount / return-visit to /results).
  const finalizeRanRef = useRef(false);
  useEffect(() => {
    if (!hunt || finalizeRanRef.current) return;
    finalizeRanRef.current = true;
    const huntId = hunt.id;
    const tier = (user as any)?.tier ?? null;
    const timer = setTimeout(() => {
      (async () => {
        try {
          const result = await finalizeProvisionalHunt(huntId, tier);
          logClientEvent({
            event: 'finalize_provisional_ui',
            data: {
              hunt_id: huntId,
              ok: (result as any).ok ?? false,
              reason: (result as any).reason ?? null,
              analysis_persisted: (result as any).outcome?.analysisPersisted ?? null,
              media_persisted: (result as any).outcome?.mediaPersisted ?? null,
              warning: (result as any).outcome?.warningMessage ?? null,
            },
          });
          // Surface storage-full warnings if the save succeeded but
          // returned a warning. Ignore "already_persisted" / "no_provisional_entry"
          // — those are expected idle paths.
          if ((result as any).ok && (result as any).outcome?.warningMessage) {
            setPersistWarning(prev => prev || (result as any).outcome.warningMessage);
          }

          // Drain any pending GPS assets the user added in the New
          // Hunt flow (Task 4). They were stashed in AsyncStorage by
          // /setup.tsx because the assets need a server-side
          // hunt_id to attach to, and that only exists after the
          // upsert above. Idempotent: assets that successfully POST
          // are removed from the stash; failures stay for retry on
          // a later visit to /results.
          if ((result as any).ok) {
            try {
              const { loadPendingAssets, removePendingAssets } =
                await import('../src/media/pendingHuntAssets');
              const { bulkCreateHuntAssets } =
                await import('../src/api/huntAssetsApi');
              const pending = await loadPendingAssets(huntId);
              if (pending.length > 0) {
                const outcomes = await bulkCreateHuntAssets(
                  huntId,
                  pending.map((a) => ({
                    type: a.type,
                    name: a.name,
                    latitude: a.latitude,
                    longitude: a.longitude,
                    notes: a.notes ?? null,
                  })),
                );
                const committedLocalIds = outcomes
                  .filter((o) => o.ok)
                  .map((o) => pending[o.index].localId);
                const failed = outcomes.filter((o) => !o.ok);
                if (committedLocalIds.length > 0) {
                  await removePendingAssets(huntId, committedLocalIds);
                }
                logClientEvent({
                  event: 'hunt_assets_drained',
                  data: {
                    hunt_id: huntId,
                    requested: pending.length,
                    committed: committedLocalIds.length,
                    failed: failed.length,
                    failure_reasons: failed.map((o) => o.reason).slice(0, 5),
                  },
                });
                if (failed.length > 0) {
                  setPersistWarning(
                    (prev) =>
                      prev ||
                      `${failed.length} hunt location${
                        failed.length === 1 ? '' : 's'
                      } couldn’t be saved. They’ll retry next time you open this hunt.`,
                  );
                }
              }
            } catch (drainErr: any) {
              logClientEvent({
                event: 'hunt_assets_drain_threw',
                data: {
                  hunt_id: huntId,
                  error: drainErr?.message || String(drainErr),
                },
              });
            }

            // Drain saved-map-image geo metadata captured at the moment
            // each map was added (Task 5). Zip with hunt.mediaRefs by
            // index so each SavedMapImage row uses the same image_id
            // the media store assigns. Idempotent on retry: the API
            // is an upsert keyed on (user_id, image_id), so re-POSTing
            // is safe.
            try {
              const { loadMapImageMetaList, clearMapImageMetaList, buildSavedMapImagePayload } =
                await import('../src/media/pendingMapImageMeta');
              const { upsertSavedMapImage } =
                await import('../src/api/savedMapImagesApi');
              const metaList = await loadMapImageMetaList(huntId);
              if (metaList.length > 0) {
                // The hunt's mediaRefs are the source of truth for
                // image_ids. Read from the live hunt record so we
                // align with whatever the persistence pipeline minted.
                const refs: string[] = (hunt as any)?.mediaRefs ?? [];
                let committed = 0;
                let failedMeta = 0;
                for (let i = 0; i < metaList.length; i++) {
                  const meta = metaList[i];
                  const imageId = refs[i];
                  if (!meta || !imageId) continue;
                  // eslint-disable-next-line no-await-in-loop
                  const r = await upsertSavedMapImage(
                    buildSavedMapImagePayload(imageId, huntId, meta),
                  );
                  if (r.ok) committed++;
                  else failedMeta++;
                }
                if (failedMeta === 0) {
                  await clearMapImageMetaList(huntId);
                }
                logClientEvent({
                  event: 'saved_map_images_drained',
                  data: {
                    hunt_id: huntId,
                    requested: metaList.filter((m) => m !== null).length,
                    committed,
                    failed: failedMeta,
                    refs_count: refs.length,
                  },
                });
              }
            } catch (metaDrainErr: any) {
              logClientEvent({
                event: 'saved_map_images_drain_threw',
                data: {
                  hunt_id: huntId,
                  error: metaDrainErr?.message || String(metaDrainErr),
                },
              });
            }
          }
        } catch (err: any) {
          logClientEvent({
            event: 'finalize_provisional_ui_threw',
            data: { hunt_id: huntId, error: err?.message || String(err) },
          });
        }
      })();
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hunt?.id, user?.tier]);

  const loadHuntAsync = async (): Promise<{ hunt: HuntRecord; warning: string | null } | null> => {
    const huntId = params.huntId as string | undefined;
    if (!huntId) return null;
    logClientEvent({
      event: 'results_load_started',
      data: { hunt_id: huntId, tier: (user as any)?.tier ?? null },
    });

    const res = await loadHuntFromStore(huntId, (user as any)?.tier);
    if (!res) return null;
    const hydrated = res.hunt;

    // Map the tier-unified HydratedHuntResult into the legacy HuntRecord
    // shape that the rest of this screen consumes. Missing media render
    // as empty strings so the Image component falls back to the
    // placeholder without crashing.
    const displayUris: string[] = hydrated.displayUris.map(u => u || '');
    const primaryIdx = hydrated.primaryMedia
      ? hydrated.media.findIndex(m => m.asset.imageId === hydrated.primaryMedia?.asset.imageId)
      : 0;

    const adapted: HuntRecord & { primaryMapIndex?: number } = {
      id: hydrated.id,
      species: hydrated.metadata.species,
      speciesName: hydrated.metadata.speciesName,
      date: hydrated.metadata.date,
      timeWindow: hydrated.metadata.timeWindow,
      windDirection: hydrated.metadata.windDirection,
      mapImage: hydrated.primaryDisplayUri || undefined,
      mapImages: displayUris,
      primaryMapIndex: Math.max(0, primaryIdx),
      result: hydrated.analysis,
      createdAt: hydrated.createdAt,
      locationCoords: hydrated.metadata.locationCoords ?? undefined,
    };

    // Frozen analysis basis — the exact image/GPS the overlays were
    // locked to. Precedence: analysisContext > primaryMedia fallback.
    // Callers rendering the overlay MUST prefer this over the legacy
    // mapImage / primaryMapIndex / locationCoords fields above.
    setAnalysisBasis(resolveAnalysisBasis(hydrated));

    return { hunt: adapted, warning: res.warningMessage };
  };

  // Legacy: kept in case retry button needs a plain loader
  const loadHunt = async () => {
    const result = await loadHuntAsync();
    if (result) {
      applyHunt(result.hunt);
      if (result.warning) setPersistWarning(result.warning);
    } else {
      setLoadFailed(true);
    }
  };

  const applyHunt = (found: HuntRecord) => {
    setHunt(found);
    const withIds = (found.result.overlays || []).map((o: any, i: number) => ({
      ...o,
      id: o.id || `overlay-${i}-${Date.now()}`,
    }));
    setOverlays(withIds);
    setOriginalOverlays(JSON.parse(JSON.stringify(withIds)));
    setLoadFailed(false);
    // Build v2 analysis view model
    try {
      const vm = buildAnalysisViewModel(found.result);
      setAnalysisVM(vm);
    } catch {
      setAnalysisVM(null);
    }
  };

  const getMapImages = (): string[] => {
    if (!hunt) return [];
    if (hunt.mapImages && hunt.mapImages.length > 0) return hunt.mapImages;
    if (hunt.mapImage) return [hunt.mapImage];
    return [];
  };

  const mapImages = hunt ? getMapImages() : [];
  const primaryIdx = (hunt as any)?.primaryMapIndex ?? 0;
  // Precedence: saved analysis basis > primaryMapIndex > first image.
  // A frozen analysisContext.imageUri always wins, so overlays stay
  // locked to the image that was actually analyzed — even if the
  // user later interacts with the history record in ways that would
  // drift the primary-map-index.
  const primaryImage =
    analysisBasis?.imageUri ||
    mapImages[primaryIdx] ||
    mapImages[0] ||
    null;
  // Overlays should only be rendered when the analysis basis is still
  // valid. If 'stale', we keep the image but the ImageOverlayCanvas
  // shows a warning banner — see the render block below.
  const overlayStatus: 'valid' | 'stale' = analysisBasis?.overlayStatus === 'stale' ? 'stale' : 'valid';

  // Single canonical fitted-image rect for the analysis view. Every
  // overlay marker, zone, focus ring, and edit-mode tap uses this
  // rect (NOT the outer MAP_WIDTH/MAP_HEIGHT container) so
  // x_percent/y_percent land on real image pixels even when the
  // captured image's aspect ratio doesn't match the container.
  //
  // See src/utils/imageFit.ts for the coordinate contract.
  const fittedRect = useMemo(
    () =>
      computeFittedImageRect(
        MAP_WIDTH,
        MAP_HEIGHT,
        analysisBasis?.naturalWidth || 0,
        analysisBasis?.naturalHeight || 0,
      ),
    [analysisBasis?.naturalWidth, analysisBasis?.naturalHeight],
  );
  const FITTED_W = fittedRect.width || MAP_WIDTH;
  const FITTED_H = fittedRect.height || MAP_HEIGHT;

  // Dev-only: loudly log any overlays that arrived out-of-bounds so
  // future coordinate-contract regressions don't silently drop data.
  useEffect(() => {
    if (!__DEV__) return;
    if (!overlays || overlays.length === 0) return;
    const oob = findOutOfBoundsOverlayIndices(overlays, 1);
    if (oob.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[results] ${oob.length}/${overlays.length} overlay(s) out of [0,100] bounds:`,
        oob.map(i => ({ i, x: overlays[i]?.x_percent, y: overlays[i]?.y_percent, label: overlays[i]?.label })),
      );
      logClientEvent({
        event: 'overlay_out_of_bounds',
        data: {
          count: oob.length,
          total: overlays.length,
          natural_w: analysisBasis?.naturalWidth || 0,
          natural_h: analysisBasis?.naturalHeight || 0,
          fitted_w: FITTED_W,
          fitted_h: FITTED_H,
        },
      });
    }
    if (fittedRect.degraded) {
      // eslint-disable-next-line no-console
      console.warn(
        '[results] fittedRect degraded — natural image dimensions missing; falling back to container. ' +
        'Overlays may drift on aspect-mismatched captures until a re-analysis is run.',
      );
    }
  }, [overlays, analysisBasis?.naturalWidth, analysisBasis?.naturalHeight, FITTED_W, FITTED_H, fittedRect.degraded]);

  // --- Edit Mode Functions ---
  const enterEditMode = () => {
    setEditMode(true);
    setOriginalOverlays(JSON.parse(JSON.stringify(overlays)));
    setSelectedOverlay(null);
  };

  const cancelEdit = () => {
    setOverlays(JSON.parse(JSON.stringify(originalOverlays)));
    setEditMode(false);
    setAddMode(false);
    setAddMarkerType(null);
    setSelectedOverlay(null);
  };

  const saveEdits = async () => {
    if (!hunt) return;
    const updatedHunt = {
      ...hunt,
      result: { ...hunt.result, overlays },
    };
    const data = await AsyncStorage.getItem('hunt_history');
    if (data) {
      const history: HuntRecord[] = JSON.parse(data);
      const idx = history.findIndex(h => h.id === hunt.id);
      if (idx >= 0) {
        history[idx] = updatedHunt;
        await AsyncStorage.setItem('hunt_history', JSON.stringify(history));
      }
    }
    setHunt(updatedHunt);
    setOriginalOverlays(JSON.parse(JSON.stringify(overlays)));
    setEditMode(false);
    setAddMode(false);
    setAddMarkerType(null);
    Alert.alert('Saved', 'Overlay changes saved successfully.');
  };

  const deleteOverlay = (overlayId: string) => {
    setOverlays(prev => prev.filter(o => o.id !== overlayId));
    setSelectedOverlay(null);
  };

  const handleMapPress = useCallback((evt: any) => {
    if (!editMode || !addMode || !addMarkerType) return;
    const { locationX, locationY } = evt.nativeEvent;
    // Tap in container coords → subtract letterbox offset → divide
    // by fitted rect size → percent of the ANALYZED image. Taps
    // that land on letterbox padding are silently rejected.
    const localX = locationX - fittedRect.offsetX;
    const localY = locationY - fittedRect.offsetY;
    if (
      localX < 0 || localX > FITTED_W ||
      localY < 0 || localY > FITTED_H
    ) {
      return;
    }
    const xPercent = Math.max(3, Math.min(97, (localX / FITTED_W) * 100));
    const yPercent = Math.max(3, Math.min(97, (localY / FITTED_H) * 100));

    const markerDef = CUSTOM_MARKER_TYPES.find(m => m.id === addMarkerType);
    const newOverlay: OverlayMarker = {
      id: `custom-${Date.now()}`,
      type: addMarkerType,
      label: markerDef?.label || 'Custom Marker',
      x_percent: xPercent,
      y_percent: yPercent,
      reasoning: 'User-placed marker',
      confidence: 'medium',
      isCustom: true,
    };
    setOverlays(prev => [...prev, newOverlay]);
    setAddMode(false);
    setAddMarkerType(null);
  }, [editMode, addMode, addMarkerType]);

  // Drag handling
  const handleMarkerDragStart = (index: number) => {
    if (!editMode) return;
    setDragIndex(index);
  };

  const handleMarkerDrag = (index: number, dx: number, dy: number) => {
    if (!editMode || dragIndex !== index) return;
    setOverlays(prev => {
      const updated = [...prev];
      const marker = { ...updated[index] };
      marker.x_percent = Math.max(3, Math.min(97, marker.x_percent + (dx / FITTED_W) * 100));
      marker.y_percent = Math.max(3, Math.min(97, marker.y_percent + (dy / FITTED_H) * 100));
      updated[index] = marker;
      return updated;
    });
  };

  const handleMarkerDragEnd = () => {
    setDragIndex(null);
  };

  const scrollToMap = (index: number) => {
    setCurrentMapIndex(index);
    mapScrollRef.current?.scrollTo({ x: index * MAP_WIDTH, animated: true });
  };

  if (!hunt) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.emptyState}>
          {loadFailed ? (
            <>
              <Ionicons name="alert-circle-outline" size={48} color={COLORS.accent} />
              <Text style={[styles.emptyText, { fontSize: 18, fontWeight: '800', marginTop: 16 }]}>
                RESULTS NOT FOUND
              </Text>
              <Text style={[styles.emptyText, { marginTop: 8, textAlign: 'center', lineHeight: 20 }]}>
                Hunt data could not be loaded.{'\n'}This may happen with large map captures.
              </Text>
              <TouchableOpacity
                testID="retry-load-button"
                style={{ backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 24, marginTop: 24, flexDirection: 'row', gap: 8, alignItems: 'center' }}
                onPress={() => { setLoadFailed(false); loadHunt(); }}
              >
                <Ionicons name="refresh" size={18} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 14, letterSpacing: 1 }}>RETRY</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="go-home-button"
                style={{ paddingVertical: 14, marginTop: 12 }}
                onPress={() => router.replace('/')}
              >
                <Text style={{ color: COLORS.fogGray, fontSize: 14, fontWeight: '600' }}>Back to Home</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <RavenSpinner size={120} />
              <Text style={[styles.emptyText, { marginTop: 12 }]}>Loading results...</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const result = hunt.result;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      {/* Offline Banner */}
      {!isConnected && (
        <View testID="offline-banner" style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color={COLORS.accent} />
          <Text style={styles.offlineBannerText}>OFFLINE MODE — Viewing saved data</Text>
        </View>
      )}

      {/* Persist Warning Banner (storage failure) */}
      {persistWarning && (
        <View testID="persist-warning-banner" style={styles.persistBanner}>
          <Ionicons name="warning-outline" size={16} color={COLORS.accent} />
          <Text style={styles.persistBannerText} numberOfLines={2}>
            {persistWarning}
          </Text>
          <TouchableOpacity
            testID="dismiss-persist-warning"
            onPress={() => setPersistWarning(null)}
            style={styles.persistBannerClose}
          >
            <Ionicons name="close" size={16} color={COLORS.fogGray} />
          </TouchableOpacity>
        </View>
      )}

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="results-back-button"
          style={styles.backButton}
          onPress={() => router.replace('/')}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.topTitle}>{hunt.speciesName.toUpperCase()}</Text>
          <Text style={styles.topSubtitle}>{hunt.date} · Wind {hunt.windDirection}</Text>
        </View>
        {!editMode ? (
          <View style={styles.topActions}>
            <TouchableOpacity
              testID="toggle-legend-button"
              style={styles.iconButton}
              onPress={() => setShowLegend(!showLegend)}
            >
              <Ionicons name="layers" size={20} color={COLORS.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="enter-edit-mode-button"
              style={styles.editButton}
              onPress={enterEditMode}
            >
              <Ionicons name="create" size={18} color={COLORS.primary} />
              <Text style={styles.editButtonText}>EDIT</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.topActions}>
            <TouchableOpacity testID="cancel-edit-button" style={styles.cancelButton} onPress={cancelEdit}>
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="save-edit-button" style={styles.saveButton} onPress={saveEdits}>
              <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              <Text style={styles.saveButtonText}>SAVE</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Edit Mode Toolbar */}
      {editMode && (
        <View testID="edit-toolbar" style={styles.editToolbar}>
          <TouchableOpacity
            testID="add-marker-button"
            style={[styles.toolbarButton, addMode && styles.toolbarButtonActive]}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add-circle" size={20} color={addMode ? COLORS.primary : COLORS.accent} />
            <Text style={[styles.toolbarButtonText, addMode && styles.toolbarButtonTextActive]}>ADD</Text>
          </TouchableOpacity>
          {selectedOverlay && (
            <TouchableOpacity
              testID="delete-overlay-button"
              style={styles.deleteToolbarButton}
              onPress={() => {
                Alert.alert('Delete Marker', `Remove "${selectedOverlay.label}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteOverlay(selectedOverlay.id) },
                ]);
              }}
            >
              <Ionicons name="trash" size={18} color={COLORS.avoidZones} />
              <Text style={styles.deleteToolbarText}>DELETE</Text>
            </TouchableOpacity>
          )}
          {addMode && addMarkerType && (
            <View style={styles.addModeIndicator}>
              <Ionicons name="locate" size={16} color={COLORS.accent} />
              <Text style={styles.addModeText}>Tap map to place</Text>
            </View>
          )}
          <Text style={styles.editHint}>
            {addMode ? 'Tap on map to place marker' : 'Drag markers to reposition'}
          </Text>
        </View>
      )}

      <ScrollView
        ref={rootScrollRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        scrollEnabled={dragIndex === null}
      >
        {/* View Mode Tabs: MAP | ANALYSIS */}
        <View style={styles.viewModeTabs}>
          <TouchableOpacity
            testID="view-mode-map"
            style={[styles.viewModeTab, viewMode === 'map' && styles.viewModeTabActive]}
            onPress={() => setViewMode('map')}
          >
            <Ionicons name="globe-outline" size={16} color={viewMode === 'map' ? COLORS.primary : COLORS.fogGray} />
            <Text style={[styles.viewModeTabText, viewMode === 'map' && styles.viewModeTabTextActive]}>MAP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="view-mode-analysis"
            style={[styles.viewModeTab, viewMode === 'analysis' && styles.viewModeTabActive]}
            onPress={() => setViewMode('analysis')}
          >
            <Ionicons name="analytics-outline" size={16} color={viewMode === 'analysis' ? COLORS.primary : COLORS.fogGray} />
            <Text style={[styles.viewModeTabText, viewMode === 'analysis' && styles.viewModeTabTextActive]}>ANALYSIS</Text>
          </TouchableOpacity>
        </View>

        {/* MAP VIEW - MapLibre Base Map */}
        {viewMode === 'map' && (
          <View style={styles.mapSection}>
            <TacticalMapView
              center={hunt.locationCoords || { lat: 39.8283, lon: -98.5795 }}
              zoom={hunt.locationCoords ? 12 : 5}
              height={MAP_HEIGHT}
              onUpgradePress={() => router.push('/subscription')}
            />
            {!hunt.locationCoords && (
              <View style={styles.noLocationHint}>
                <Ionicons name="location-outline" size={14} color={COLORS.fogGray} />
                <Text style={styles.noLocationHintText}>No GPS location saved — showing default view</Text>
              </View>
            )}
          </View>
        )}

        {/* ANALYSIS VIEW - Primary Image + Overlays */}
        {viewMode === 'analysis' && (
        <View style={styles.mapSection}>
          {/* Primary image with overlays. The ImageOverlayCanvas puts
              the image and all overlay markers inside ONE animated
              transform container — so pinch/pan keeps every overlay
              pixel-aligned with the image it was locked to.
              Zoom is disabled in edit mode so the existing marker
              PanResponder drag behavior stays at scale=1 and remains
              predictable. */}
          <View
            style={styles.mapContainer}
            onTouchEnd={editMode && addMode ? handleMapPress : undefined}
          >
            {primaryImage ? (
              <ImageOverlayCanvas
                imageUri={primaryImage}
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                imageNaturalWidth={analysisBasis?.naturalWidth || 0}
                imageNaturalHeight={analysisBasis?.naturalHeight || 0}
                enableZoom={!editMode}
                overlayStatus={overlayStatus}
                testID="overlay-canvas"
              >
                {/* Overlay markers — ALWAYS on the primary image.
                    Positioned in image-space (%), share transform.
                    `parentWidth/parentHeight` are the fitted rect
                    dims so percent math lands on real image pixels
                    regardless of container aspect. */}
                {overlays.map((overlay, idx) => (
                  <DraggableMarker
                    key={overlay.id}
                    overlay={overlay}
                    index={idx}
                    editMode={editMode}
                    isSelected={selectedOverlay?.id === overlay.id}
                    parentWidth={FITTED_W}
                    parentHeight={FITTED_H}
                    onPress={() => setSelectedOverlay(selectedOverlay?.id === overlay.id ? null : overlay)}
                    onDragStart={() => handleMarkerDragStart(idx)}
                    onDrag={(dx, dy) => handleMarkerDrag(idx, dx, dy)}
                    onDragEnd={handleMarkerDragEnd}
                  />
                ))}

                {/* Focus ring — pulsing indicator when a setup/observation card was tapped */}
                {focusState.target && (
                  <FocusRing
                    x={focusState.target.x_percent}
                    y={focusState.target.y_percent}
                    pulse={focusPulse}
                    mapWidth={FITTED_W}
                    mapHeight={FITTED_H}
                  />
                )}
              </ImageOverlayCanvas>
            ) : (
              <View style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}>
                <TacticalMapView
                  center={hunt.locationCoords || { lat: 39.8283, lon: -98.5795 }}
                  zoom={hunt.locationCoords ? 14 : 5}
                  height={MAP_HEIGHT}
                  showStyleSwitcher={true}
                  onUpgradePress={() => router.push('/subscription')}
                />
              </View>
            )}

            {/* Legend overlay — stays in screen-space (NOT transformed) so
                it remains readable at any zoom level. */}
            {showLegend && !editMode && primaryImage && (
              <View style={styles.legendOverlay}>
                <Text style={styles.legendTitle}>MAP LEGEND</Text>
                {Object.entries(OVERLAY_LABELS).map(([key, label]) => (
                  <View key={key} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: OVERLAY_COLORS[key] }]} />
                    <Text style={styles.legendLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Reference images (non-primary) */}
          {mapImages.length > 1 && (
            <View style={styles.refImagesSection}>
              <Text style={styles.refImagesTitle}>REFERENCE IMAGES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {mapImages.map((img, idx) => {
                  if (idx === primaryIdx) return null;
                  return (
                    <View key={idx} style={styles.refImageCard}>
                      <Image source={{ uri: img }} style={styles.refImage} resizeMode="cover" />
                      <Text style={styles.refImageLabel}>Map {idx + 1}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
        )}

        {/* Task 9 — Saved analysis overlay markers panel.
            Renders persisted AnalysisOverlayItem rows on top of the
            saved primary image at the natural-aspect rendered size,
            scaling x/y from the original image dims to the displayed
            size. The panel is also the entry point for Task 10's
            user-driven marker placement: an "Add Marker" toggle
            puts the image into add-mode; a single tap on the image
            opens the marker form. */}
        {primaryImage &&
          (analysisBasis?.naturalWidth || 0) > 0 &&
          (analysisBasis?.naturalHeight || 0) > 0 && (
          <View style={styles.savedMarkersSection}>
            <View style={styles.savedMarkersHeader}>
              <Ionicons name="bookmark" size={14} color={COLORS.accent} />
              <Text style={styles.savedMarkersTitle}>
                SAVED MARKERS ({savedOverlayItems.length})
              </Text>
              <View style={styles.savedMarkersHeaderSpacer} />
              <TouchableOpacity
                onPress={() => setMarkerAddMode(m => !m)}
                style={[
                  styles.addMarkerBtn,
                  markerAddMode && styles.addMarkerBtnActive,
                ]}
                testID="saved-markers-add-toggle"
              >
                <Ionicons
                  name={markerAddMode ? 'close' : 'add'}
                  size={14}
                  color={markerAddMode ? '#FFFFFF' : COLORS.accent}
                />
                <Text
                  style={[
                    styles.addMarkerBtnText,
                    markerAddMode && styles.addMarkerBtnTextActive,
                  ]}
                >
                  {markerAddMode ? 'Cancel' : 'Add Marker'}
                </Text>
              </TouchableOpacity>
            </View>
            {markerAddMode && (
              <View style={styles.addMarkerHint}>
                <Ionicons name="hand-left" size={12} color={COLORS.fogGray} />
                <Text style={styles.addMarkerHintText}>
                  Tap the image to drop a marker
                </Text>
              </View>
            )}
            <SavedAnalysisOverlayImage
              imageUri={primaryImage}
              originalWidth={analysisBasis?.naturalWidth || 0}
              originalHeight={analysisBasis?.naturalHeight || 0}
              renderedWidth={FITTED_W}
              renderedHeight={FITTED_H}
              items={savedOverlayItems}
              addMode={markerAddMode}
              onTapPlaceMarker={handleTapPlaceMarker}
              onEditItem={handleEditItem}
              onDeleteItem={handleDeleteItem}
              testID="saved-overlay-image-panel"
            />
          </View>
        )}

        {/* Task 10 — marker form (create + edit). Hidden when
            markerForm is null. */}
        <MarkerFormModal
          visible={!!markerForm}
          mode={markerForm?.mode === 'edit' ? 'edit' : 'create'}
          initial={
            markerForm?.mode === 'edit'
              ? {
                  type: markerForm.item.type as any,
                  name: markerForm.item.label,
                  notes: markerForm.item.description ?? '',
                }
              : undefined
          }
          placement={
            markerForm?.mode === 'create' ? markerForm.placement : null
          }
          busy={markerBusy}
          onSubmit={handleSubmitMarkerForm}
          onDelete={
            markerForm?.mode === 'edit'
              ? () => {
                  const it = markerForm.item;
                  setMarkerForm(null);
                  handleDeleteItem(it);
                }
              : undefined
          }
          onClose={() => {
            if (!markerBusy) setMarkerForm(null);
          }}
        />

        {/* Selected Overlay Detail */}
        {selectedOverlay && (
          <View style={[styles.overlayDetail, { borderLeftColor: resolveOverlayColor(selectedOverlay) }]}>
            <View style={styles.overlayDetailHeader}>
              <Ionicons
                name={(OVERLAY_ICONS[selectedOverlay.type] || 'location') as any}
                size={20}
                color={resolveOverlayColor(selectedOverlay)}
              />
              <Text style={[styles.overlayDetailTitle, { color: resolveOverlayColor(selectedOverlay) }]}>
                {selectedOverlay.label}
              </Text>
              {selectedOverlay.isCustom && (
                <View style={styles.customBadge}>
                  <Text style={styles.customBadgeText}>CUSTOM</Text>
                </View>
              )}
              <View style={[styles.confidenceBadge, { backgroundColor: `${CONFIDENCE_COLORS[selectedOverlay.confidence] || COLORS.fogGray}22` }]}>
                <Text style={[styles.confidenceText, { color: CONFIDENCE_COLORS[selectedOverlay.confidence] || COLORS.fogGray }]}>
                  {selectedOverlay.confidence.toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity testID="close-overlay-detail" onPress={() => setSelectedOverlay(null)}>
                <Ionicons name="close" size={20} color={COLORS.fogGray} />
              </TouchableOpacity>
            </View>
            <Text style={styles.overlayReasoning}>{selectedOverlay.reasoning}</Text>
            {editMode && (
              <TouchableOpacity
                testID="delete-selected-overlay"
                style={styles.deleteInlineButton}
                onPress={() => deleteOverlay(selectedOverlay.id)}
              >
                <Ionicons name="trash-outline" size={16} color={COLORS.avoidZones} />
                <Text style={styles.deleteInlineText}>DELETE MARKER</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* === v2 Analysis Sections === */}
        {analysisVM ? (
          <View style={styles.section}>
            <AnalysisSummaryCard vm={analysisVM} />
            <TopSetupsSection
              setups={linkedSetups}
              activeId={focusState.sourceId}
              onFocus={focus}
            />
            <WindAnalysisCard vm={analysisVM} />
            {analysisVM.hasMapObservations && (
              <MapObservationsSection
                observations={linkedObservations}
                activeId={focusState.sourceId}
                onFocus={focus}
              />
            )}
            <AssumptionsCard
              assumptions={analysisVM.keyAssumptions}
              limitations={analysisVM.confidenceSummary.main_limitations}
            />
            {analysisVM.hasSpeciesTips && (
              <SpeciesTipsCard tips={analysisVM.speciesTips} />
            )}
          </View>
        ) : (
          /* Legacy v1 fallback */
          <View style={styles.section}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>{result.summary}</Text>
            </View>
          </View>
        )}

        {/* Overlay List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ALL OVERLAYS ({overlays.length})</Text>
          {overlays.map((overlay) => (
            <TouchableOpacity
              key={overlay.id}
              testID={`overlay-list-item-${overlay.id}`}
              style={[styles.overlayListItem, selectedOverlay?.id === overlay.id && styles.overlayListItemSelected]}
              onPress={() => setSelectedOverlay(selectedOverlay?.id === overlay.id ? null : overlay)}
            >
              <View style={[styles.overlayListDot, { backgroundColor: resolveOverlayColor(overlay) }]} />
              <View style={styles.overlayListContent}>
                <Text style={styles.overlayListLabel}>{overlay.label}</Text>
                <Text style={styles.overlayListType}>
                  {OVERLAY_LABELS[overlay.type] || overlay.type}
                  {overlay.isCustom ? ' · Custom' : ''}
                </Text>
              </View>
              {editMode && (
                <TouchableOpacity
                  testID={`delete-overlay-${overlay.id}`}
                  style={styles.overlayDeleteBtn}
                  onPress={() => deleteOverlay(overlay.id)}
                >
                  <Ionicons name="close-circle" size={20} color={COLORS.avoidZones} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerSection}>
          <Ionicons name="shield-checkmark" size={16} color={COLORS.fogGray} />
          <Text style={styles.disclaimerText}>
            AI-generated suggestions. Always verify regulations, property boundaries, and safety independently.
          </Text>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom Actions */}
      {!editMode && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            testID="new-hunt-from-results"
            style={styles.newHuntButton}
            onPress={() => router.push('/setup')}
          >
            <Ionicons name="add" size={20} color={COLORS.primary} />
            <Text style={styles.newHuntText}>NEW HUNT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="back-home-button"
            style={styles.homeButton}
            onPress={() => router.replace('/')}
          >
            <Ionicons name="home" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Add Marker Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ADD MARKER</Text>
              <TouchableOpacity testID="close-add-modal" onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.fogGray} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Select marker type, then tap on the map</Text>
            <ScrollView style={styles.markerTypeList} showsVerticalScrollIndicator={false}>
              {CUSTOM_MARKER_TYPES.map((mt) => (
                <TouchableOpacity
                  key={mt.id}
                  testID={`add-marker-type-${mt.id}`}
                  style={styles.markerTypeRow}
                  onPress={() => {
                    setAddMarkerType(mt.id);
                    setAddMode(true);
                    setShowAddModal(false);
                  }}
                >
                  <View style={[styles.markerTypeIcon, { backgroundColor: mt.color }]}>
                    <Ionicons name={mt.icon as any} size={18} color="#FFFFFF" />
                  </View>
                  <Text style={styles.markerTypeLabel}>{mt.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.fogGray} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// --- Focus Ring: pulsing highlight when a v2 card is tapped ---
function FocusRing({
  x,
  y,
  pulse,
  mapWidth,
  mapHeight,
}: {
  x: number;
  y: number;
  pulse: Animated.Value;
  mapWidth: number;
  mapHeight: number;
}) {
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.9] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });
  const left = (x / 100) * mapWidth - 28;
  const top = (y / 100) * mapHeight - 28;
  return (
    <View pointerEvents="none" style={[styles.focusRingRoot, { left, top }]}>
      {/* Outer pulsing ring */}
      <Animated.View
        style={[
          styles.focusPulseRing,
          { transform: [{ scale }], opacity },
        ]}
      />
      {/* Inner solid ring */}
      <View style={styles.focusCoreRing} />
    </View>
  );
}

// --- Draggable Marker Component ---
function DraggableMarker({
  overlay,
  index,
  editMode,
  isSelected,
  parentWidth,
  parentHeight,
  onPress,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  overlay: OverlayMarker;
  index: number;
  editMode: boolean;
  isSelected: boolean;
  /** Width of the fitted-image parent (NOT the outer container). */
  parentWidth: number;
  /** Height of the fitted-image parent (NOT the outer container). */
  parentHeight: number;
  onPress: () => void;
  onDragStart: () => void;
  onDrag: (dx: number, dy: number) => void;
  onDragEnd: () => void;
}) {
  const color = resolveOverlayColor(overlay);
  const lastPos = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => editMode,
      onMoveShouldSetPanResponder: () => editMode,
      onPanResponderGrant: () => {
        lastPos.current = { x: 0, y: 0 };
        onDragStart();
      },
      onPanResponderMove: (_, gesture) => {
        const dx = gesture.dx - lastPos.current.x;
        const dy = gesture.dy - lastPos.current.y;
        lastPos.current = { x: gesture.dx, y: gesture.dy };
        onDrag(dx, dy);
      },
      onPanResponderRelease: () => {
        onDragEnd();
      },
    })
  ).current;

  const isZone = (overlay.type === 'corridor' || overlay.type === 'avoid') &&
    overlay.width_percent && overlay.height_percent;

  if (isZone) {
    const zoneWidth = (overlay.width_percent || 10);
    const zoneHeight = (overlay.height_percent || 10);
    return (
      <View
        testID={`overlay-zone-${index}`}
        {...(editMode ? panResponder.panHandlers : {})}
        style={[
          styles.overlayZone,
          {
            left: Math.max(0, ((overlay.x_percent - zoneWidth / 2) / 100) * parentWidth),
            top: Math.max(0, ((overlay.y_percent - zoneHeight / 2) / 100) * parentHeight),
            width: (zoneWidth / 100) * parentWidth,
            height: (zoneHeight / 100) * parentHeight,
            backgroundColor: `${color}33`,
            borderColor: isSelected ? COLORS.accent : color,
            borderWidth: isSelected ? 3 : 2,
          },
        ]}
      >
        <TouchableOpacity onPress={onPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.zoneLabel, { color }]} numberOfLines={1}>{overlay.label}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      testID={`overlay-marker-${index}`}
      {...(editMode ? panResponder.panHandlers : {})}
      style={[
        styles.overlayMarker,
        {
          left: (overlay.x_percent / 100) * parentWidth - 16,
          top: (overlay.y_percent / 100) * parentHeight - 16,
          backgroundColor: color,
          borderColor: isSelected ? COLORS.accent : '#FFFFFF',
          borderWidth: isSelected ? 3 : 2,
        },
      ]}
    >
      <TouchableOpacity onPress={onPress} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={(OVERLAY_ICONS[overlay.type] || 'location') as any} size={16} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.fogGray, fontSize: 16 },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 8,
    backgroundColor: 'rgba(200, 155, 60, 0.12)', borderBottomWidth: 1,
    borderBottomColor: 'rgba(200, 155, 60, 0.3)',
  },
  offlineBannerText: { color: COLORS.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  persistBanner: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: 'rgba(200, 155, 60, 0.15)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(200, 155, 60, 0.3)',
  },
  persistBannerText: {
    color: COLORS.textPrimary, fontSize: 12, fontWeight: '600',
    flex: 1, lineHeight: 16,
  },
  persistBannerClose: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center',
    justifyContent: 'center', backgroundColor: 'rgba(11, 31, 42, 0.3)',
  },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(58, 74, 82, 0.5)', alignItems: 'center', justifyContent: 'center',
  },
  topCenter: { flex: 1 },
  topTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  topSubtitle: { color: COLORS.fogGray, fontSize: 11, marginTop: 2 },
  topActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(58, 74, 82, 0.5)', alignItems: 'center', justifyContent: 'center',
  },
  editButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8, minHeight: 40,
  },
  editButtonText: { color: COLORS.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  cancelButton: {
    backgroundColor: 'rgba(58, 74, 82, 0.6)', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8, minHeight: 40, justifyContent: 'center',
  },
  cancelButtonText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  saveButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.stands, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8, minHeight: 40,
  },
  saveButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  // Edit toolbar
  editToolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(154, 164, 169, 0.2)',
  },
  toolbarButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(58, 74, 82, 0.6)', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8, minHeight: 40,
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.3)',
  },
  toolbarButtonActive: { backgroundColor: COLORS.accent },
  toolbarButtonText: { color: COLORS.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  toolbarButtonTextActive: { color: COLORS.primary },
  deleteToolbarButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(198, 40, 40, 0.15)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 40,
  },
  deleteToolbarText: { color: COLORS.avoidZones, fontSize: 12, fontWeight: '700' },
  addModeIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(200, 155, 60, 0.15)', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  addModeText: { color: COLORS.accent, fontSize: 11, fontWeight: '600' },
  editHint: { color: COLORS.fogGray, fontSize: 10, fontWeight: '500', flex: 1, textAlign: 'right' },
  scrollView: { flex: 1 },
  // View Mode Tabs
  viewModeTabs: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 4, marginBottom: 8,
    backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 10, padding: 3,
  },
  viewModeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 8,
  },
  viewModeTabActive: { backgroundColor: COLORS.accent },
  viewModeTabText: { color: COLORS.fogGray, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  viewModeTabTextActive: { color: COLORS.primary },
  noLocationHint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 8, paddingVertical: 6,
  },
  noLocationHintText: { color: COLORS.fogGray, fontSize: 11 },
  // Map section
  mapSection: { paddingHorizontal: 16, marginTop: 4 },
  mapTabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  mapTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    backgroundColor: 'rgba(58, 74, 82, 0.4)', minHeight: 36, justifyContent: 'center',
  },
  mapTabActive: { backgroundColor: COLORS.accent },
  mapTabText: { color: COLORS.fogGray, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  mapTabTextActive: { color: COLORS.primary },
  mapContainer: {
    position: 'relative', width: MAP_WIDTH, height: MAP_HEIGHT, borderRadius: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)',
  },
  mapImage: { width: MAP_WIDTH, height: MAP_HEIGHT },
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  pageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(58, 74, 82, 0.6)' },
  pageDotActive: { backgroundColor: COLORS.accent, width: 20 },
  // Reference images
  refImagesSection: { marginTop: 12 },
  savedMarkersSection: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  savedMarkersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  savedMarkersTitle: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  savedMarkersHeaderSpacer: { flex: 1 },
  addMarkerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'transparent',
  },
  addMarkerBtnActive: {
    backgroundColor: COLORS.accent,
  },
  addMarkerBtnText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  addMarkerBtnTextActive: {
    color: '#FFFFFF',
  },
  addMarkerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: 6,
  },
  addMarkerHintText: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontStyle: 'italic',
  },
  refImagesTitle: { color: COLORS.fogGray, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  refImageCard: { width: 100, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.2)' },
  refImage: { width: 100, height: 70 },
  refImageLabel: { color: COLORS.fogGray, fontSize: 9, fontWeight: '600', textAlign: 'center', paddingVertical: 4, backgroundColor: 'rgba(58, 74, 82, 0.5)' },
  overlayMarker: {
    position: 'absolute', width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', elevation: 5,
    zIndex: 10,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.3)',
  },
  overlayZone: {
    position: 'absolute', borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed',
    zIndex: 5,
  },
  zoneLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  legendOverlay: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(11, 31, 42, 0.92)', borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)',
  },
  legendTitle: { color: COLORS.fogGray, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#FFFFFF' },
  legendLabel: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '600' },
  // Overlay detail
  overlayDetail: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 12,
    padding: 16, borderLeftWidth: 4, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.2)',
  },
  overlayDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  overlayDetailTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  customBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
    backgroundColor: 'rgba(200, 155, 60, 0.15)',
  },
  customBadgeText: { color: COLORS.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  confidenceBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  confidenceText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  overlayReasoning: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 },
  deleteInlineButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: 'rgba(198, 40, 40, 0.12)', alignSelf: 'flex-start',
  },
  deleteInlineText: { color: COLORS.avoidZones, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  // Sections
  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionTitle: { color: COLORS.fogGray, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 12 },
  summaryCard: {
    backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 12,
    padding: 18, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.15)',
  },
  summaryText: { color: COLORS.textPrimary, fontSize: 15, lineHeight: 24 },
  setupCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: 'rgba(58, 74, 82, 0.3)', borderRadius: 10,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.1)',
  },
  setupNumber: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  setupNumberText: { color: COLORS.primary, fontSize: 14, fontWeight: '800' },
  setupText: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 22, flex: 1 },
  infoGrid: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 24 },
  infoCard: {
    flex: 1, backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.15)',
  },
  infoLabel: { color: COLORS.fogGray, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 10, marginBottom: 6 },
  infoValue: { color: COLORS.textPrimary, fontSize: 13, lineHeight: 20 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  tipText: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20, flex: 1 },
  overlayListItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(58, 74, 82, 0.3)', borderRadius: 10,
    padding: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.1)',
  },
  overlayListItemSelected: { borderColor: COLORS.accent, borderWidth: 2 },
  overlayListDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: '#FFFFFF' },
  overlayListContent: { flex: 1 },
  overlayListLabel: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  overlayListType: { color: COLORS.fogGray, fontSize: 11, marginTop: 2 },
  overlayDeleteBtn: { padding: 4 },
  disclaimerSection: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16,
    marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(154, 164, 169, 0.1)',
  },
  disclaimerText: { color: COLORS.fogGray, fontSize: 11, lineHeight: 17, flex: 1, opacity: 0.7 },
  bottomBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12,
    gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(154, 164, 169, 0.1)',
  },
  newHuntButton: {
    flex: 1, backgroundColor: COLORS.accent, borderRadius: 10,
    paddingVertical: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, minHeight: 52,
  },
  newHuntText: { color: COLORS.primary, fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  homeButton: {
    width: 52, height: 52, borderRadius: 10,
    backgroundColor: 'rgba(58, 74, 82, 0.5)', alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.2)',
  },
  // Modal
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.primary, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24,
    // Bottom-sheet sizing: the ScrollView inside uses `flex: 1`, so we
    // must give this container a real height (not just maxHeight) or
    // the list collapses to 0. We pick a comfortable height that fits
    // 5–6 marker rows on a typical phone, with internal scroll for the
    // remaining types.
    minHeight: 380, maxHeight: '70%',
    borderTopWidth: 1, borderTopColor: 'rgba(154, 164, 169, 0.3)',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
  modalSubtitle: { color: COLORS.fogGray, fontSize: 13, marginBottom: 20 },
  markerTypeList: { flex: 1 },
  markerTypeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(154, 164, 169, 0.1)',
  },
  markerTypeIcon: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  markerTypeLabel: { flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  // Focus Ring
  focusRingRoot: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  focusPulseRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(200, 155, 60, 0.15)',
  },
  focusCoreRing: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(200, 155, 60, 0.25)',
  },
});
