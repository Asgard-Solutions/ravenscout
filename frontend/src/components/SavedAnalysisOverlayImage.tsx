// =====================================================================
// SavedAnalysisOverlayImage — Task 9.
//
// Renders a saved analysis map image with persisted overlay items
// drawn on top, using the original-image x/y coordinates the
// backend stored. Coordinates are scaled to the currently displayed
// image dimensions via the `scaleOriginalPixelToRenderedPixel`
// helper (src/utils/geoProjection.ts).
//
// Critical contract (do not break, ever):
//
//   * Saved overlay positions come from `item.x` / `item.y`
//     measured in the SavedMapImage's original pixel grid.
//   * Render position = (x / originalW * renderedW,
//                         y / originalH * renderedH).
//   * The current live map's center / zoom / viewport NEVER
//     contributes to the rendered position — saved overlays are
//     locked to the saved image basis.
//   * Pixel-only items (coordinateSource = 'pixel_only', GPS = null)
//     show "GPS: Not available for this image" in the detail panel
//     and never render fake coordinates.
//
// What this component is NOT:
//   * Not the live tactical map (use TacticalMapView).
//   * Not the editable / draggable overlay canvas (that's
//     ImageOverlayCanvas + DraggableMarker on /results).
//   * Not a marker creation UI (Task 10/11).
//
// Task 9 is strictly: load saved x/y, scale, draw, show details.
// =====================================================================

import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  PanResponder,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '../constants/theme';
import {
  getOverlayItemTypeInfo,
  coordinateSourceLabel,
} from '../constants/overlayItemTaxonomy';
import { computeOverlayRenderedAnchor } from '../utils/savedOverlayLayout';
import type { AnalysisOverlayItem } from '../types/geo';

// Re-export so callers (and historical imports) keep working.
export { computeOverlayRenderedAnchor };

// --- Public API ---------------------------------------------------------

export interface SavedAnalysisOverlayImageProps {
  /** Image source — base64 data URI, blob URL, or http(s) URL. */
  imageUri: string | null | undefined;
  /**
   * Original (saved) image dimensions — the pixel grid the overlay
   * x/y values are measured in. Required for overlay rendering;
   * when absent or non-positive, overlays are skipped (the image
   * still renders at the requested size).
   */
  originalWidth: number | null | undefined;
  originalHeight: number | null | undefined;
  /** Currently displayed image size on screen. Required. */
  renderedWidth: number;
  renderedHeight: number;
  /** Saved overlay items to render. */
  items: ReadonlyArray<AnalysisOverlayItem>;
  /** Optional override for the marker hit area (pts). Defaults 28. */
  markerSize?: number;
  /** testID for integration tests. */
  testID?: string;
  /**
   * Optional pre-resolved asset name lookup keyed by `sourceAssetId`.
   * When supplied, the detail panel shows the asset name; when
   * absent, "Source: User provided" is shown without a name.
   */
  sourceAssetNamesById?: Record<string, string>;
  /**
   * Optional callback when a marker is selected. Gets the full
   * AnalysisOverlayItem so callers can wire up scrolling-to-item etc.
   */
  onSelectItem?: (item: AnalysisOverlayItem) => void;
  /**
   * Task 10 — when true, the image becomes a "drop-pin" target. A
   * tap fires `onTapPlaceMarker` with the rendered (px) tap position
   * relative to the image rect; the parent is responsible for
   * converting + persisting the marker. Existing markers stay
   * tappable but their press fires `onSelectItem` (so the user can
   * still inspect details while in add-mode).
   */
  addMode?: boolean;
  onTapPlaceMarker?: (renderedX: number, renderedY: number) => void;
  /**
   * Task 10 — show an "Edit" button on the detail panel. The
   * caller is responsible for opening its own MarkerFormModal.
   */
  onEditItem?: (item: AnalysisOverlayItem) => void;
  /**
   * Task 10 — show a "Delete" button on the detail panel.
   */
  onDeleteItem?: (item: AnalysisOverlayItem) => void;
  /**
   * Task 10 follow-up — when supplied, markers become draggable.
   * The callback receives the item AND the new tap position in
   * RENDERED pixel space (relative to the image rect). The parent
   * is responsible for converting back to original-image x/y +
   * deriving lat/lng (via buildMarkerPlacement) and PUT-ing the
   * update.
   */
  onRepositionItem?: (
    item: AnalysisOverlayItem,
    renderedX: number,
    renderedY: number,
  ) => void;
}

// --- Helpers ------------------------------------------------------------

function formatLatLng(lat: number | null | undefined, lng: number | null | undefined): string {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '';
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function formatConfidence(c: number | null | undefined): string {
  if (typeof c !== 'number' || !Number.isFinite(c)) return '';
  // Round to one decimal percentage. Backend stores [0, 1].
  return `${Math.round(c * 100)}%`;
}

// --- Component ----------------------------------------------------------

// ---------------------------------------------------------------------
// Draggable marker sub-component.
//
// When `onReposition` is supplied, the marker becomes a long-press
// drag target. A short tap still fires `onPress` (so the detail panel
// continues to work). The marker visually follows the finger via an
// Animated.ValueXY translate; on release we hand the final rendered-
// pixel coordinates to the parent which is responsible for converting
// to original-image x/y + persisting via PUT.
// ---------------------------------------------------------------------

const LONG_PRESS_MS = 220;
const DRAG_THRESHOLD_PX = 4;

const DraggableSavedMarker: React.FC<{
  item: AnalysisOverlayItem;
  anchor: { renderedX: number; renderedY: number };
  markerSize: number;
  onPress: () => void;
  onReposition?: (renderedX: number, renderedY: number) => void;
  renderedWidth: number;
  renderedHeight: number;
}> = ({ item, anchor, markerSize, onPress, onReposition, renderedWidth, renderedHeight }) => {
  const info = getOverlayItemTypeInfo(item.type);
  const half = markerSize / 2;

  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragArmed = useRef(false);
  // Force re-render of the lock badge during drag.
  const [draggingState, setDraggingState] = useState(false);

  // When the parent re-anchors the marker (after PUT success), reset
  // the translate so the new `anchor.renderedX/Y` fully owns the
  // position.
  React.useEffect(() => {
    translate.setValue({ x: 0, y: 0 });
    dragOffset.current = { x: 0, y: 0 };
  }, [anchor.renderedX, anchor.renderedY, translate]);

  const cancelLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!onReposition,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_e, g) => {
        if (!onReposition) return false;
        return (
          dragArmed.current &&
          (Math.abs(g.dx) > DRAG_THRESHOLD_PX || Math.abs(g.dy) > DRAG_THRESHOLD_PX)
        );
      },
      onPanResponderGrant: () => {
        if (!onReposition) return;
        // Arm drag only after a long-press so a tap stays a tap.
        cancelLongPressTimer();
        longPressTimer.current = setTimeout(() => {
          dragArmed.current = true;
          setDraggingState(true);
          isDragging.current = false;
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (_e, g) => {
        if (!dragArmed.current) {
          // If the user moves before long-press fires, cancel arm
          // (treat as accidental scroll attempt).
          if (Math.abs(g.dx) > DRAG_THRESHOLD_PX || Math.abs(g.dy) > DRAG_THRESHOLD_PX) {
            cancelLongPressTimer();
          }
          return;
        }
        isDragging.current = true;
        // Clamp the marker's center to stay inside the image rect.
        const targetX = Math.max(
          -anchor.renderedX,
          Math.min(renderedWidth - anchor.renderedX, g.dx),
        );
        const targetY = Math.max(
          -anchor.renderedY,
          Math.min(renderedHeight - anchor.renderedY, g.dy),
        );
        translate.setValue({ x: targetX, y: targetY });
        dragOffset.current = { x: targetX, y: targetY };
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => {
        cancelLongPressTimer();
        if (!dragArmed.current) {
          // Treated as a tap.
          onPress();
          return;
        }
        dragArmed.current = false;
        setDraggingState(false);
        if (!isDragging.current || !onReposition) {
          // long-press without movement → just open detail
          onPress();
          return;
        }
        isDragging.current = false;
        const { x: dx, y: dy } = dragOffset.current;
        const finalX = anchor.renderedX + dx;
        const finalY = anchor.renderedY + dy;
        // Hand off — parent will compute new x/y/lat/lng + PUT.
        onReposition(finalX, finalY);
      },
      onPanResponderTerminate: () => {
        cancelLongPressTimer();
        dragArmed.current = false;
        setDraggingState(false);
        Animated.spring(translate, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
        }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={`${info.label}: ${item.label}`}
      testID={`saved-overlay-marker-${item.id}`}
      style={[
        styles.marker,
        {
          left: anchor.renderedX - half,
          top: anchor.renderedY - half,
          width: markerSize,
          height: markerSize,
          backgroundColor: info.color,
          borderRadius: half,
          transform: translate.getTranslateTransform(),
          opacity: draggingState ? 0.85 : 1,
          borderWidth: draggingState ? 3 : 2,
        },
      ]}
    >
      <Ionicons
        name={info.icon as any}
        size={Math.round(markerSize * 0.55)}
        color="#FFFFFF"
      />
    </Animated.View>
  );
};

// ---------------------------------------------------------------------

export const SavedAnalysisOverlayImage: React.FC<
  SavedAnalysisOverlayImageProps
> = ({
  imageUri,
  originalWidth,
  originalHeight,
  renderedWidth,
  renderedHeight,
  items,
  markerSize = 28,
  testID,
  sourceAssetNamesById,
  onSelectItem,
  addMode,
  onTapPlaceMarker,
  onEditItem,
  onDeleteItem,
  onRepositionItem,
}) => {
  const [selectedItem, setSelectedItem] = useState<AnalysisOverlayItem | null>(
    null,
  );

  const handleMarkerPress = useCallback(
    (item: AnalysisOverlayItem) => {
      setSelectedItem(item);
      onSelectItem?.(item);
    },
    [onSelectItem],
  );

  const closeDetail = useCallback(() => setSelectedItem(null), []);

  // Pre-compute the rendered anchors so a re-render doesn't re-do
  // the math per-marker (the React reconciler still needs an array).
  const renderableMarkers = useMemo(() => {
    if (!items || items.length === 0) return [];
    const ow = typeof originalWidth === 'number' ? originalWidth : 0;
    const oh = typeof originalHeight === 'number' ? originalHeight : 0;
    if (!(ow > 0) || !(oh > 0)) {
      // Without saved image dims we cannot scale safely. Skip
      // overlays rather than guess.
      return [];
    }
    const out: Array<{
      item: AnalysisOverlayItem;
      anchor: { renderedX: number; renderedY: number };
    }> = [];
    for (const it of items) {
      const anchor = computeOverlayRenderedAnchor({
        item: it,
        originalWidth: ow,
        originalHeight: oh,
        renderedWidth,
        renderedHeight,
      });
      if (anchor) out.push({ item: it, anchor });
    }
    return out;
  }, [items, originalWidth, originalHeight, renderedWidth, renderedHeight]);

  const detailRows = useMemo(() => {
    if (!selectedItem) return [];
    const info = getOverlayItemTypeInfo(selectedItem.type);
    const rows: Array<{ label: string; value: string }> = [];
    rows.push({ label: 'Type', value: info.label });

    const gpsFmt = formatLatLng(selectedItem.latitude, selectedItem.longitude);
    if (gpsFmt) {
      rows.push({ label: 'GPS', value: gpsFmt });
    } else if (selectedItem.coordinateSource === 'pixel_only') {
      rows.push({ label: 'GPS', value: 'Not available for this image' });
    } else {
      rows.push({ label: 'GPS', value: 'Not available' });
    }

    rows.push({
      label: 'Source',
      value: coordinateSourceLabel(selectedItem.coordinateSource),
    });

    if (selectedItem.sourceAssetId) {
      const nm = sourceAssetNamesById?.[selectedItem.sourceAssetId];
      if (nm) rows.push({ label: 'Linked Asset', value: nm });
    }

    const conf = formatConfidence(selectedItem.confidence);
    if (conf) rows.push({ label: 'Confidence', value: conf });

    return rows;
  }, [selectedItem, sourceAssetNamesById]);

  const containerStyle = {
    width: renderedWidth,
    height: renderedHeight,
  } as const;

  // Task 10 — capture a tap on the image area when add-mode is on.
  // We translate the gesture's location relative to the inner image
  // rect (which is the same as the outer container in this component
  // since we use position:absolute children + cover-fit). The
  // pressable layer sits BELOW the marker layer (markers come later
  // and are TouchableOpacity, which stops propagation), so tapping
  // an existing marker still opens its detail panel as expected.
  const handleAddTap = (e: any) => {
    if (!addMode || !onTapPlaceMarker) return;
    const { locationX, locationY } = e?.nativeEvent || {};
    if (typeof locationX !== 'number' || typeof locationY !== 'number') return;
    onTapPlaceMarker(locationX, locationY);
  };

  return (
    <View
      testID={testID || 'saved-analysis-overlay-image'}
      style={[styles.container, containerStyle]}
    >
      {imageUri ? (
        <Pressable
          onPress={handleAddTap}
          disabled={!addMode || !onTapPlaceMarker}
          style={[styles.image, containerStyle]}
          testID="saved-analysis-overlay-image-touchable"
        >
          <Image
            source={{ uri: imageUri }}
            style={containerStyle}
            resizeMode="cover"
            testID="saved-analysis-overlay-image-bg"
          />
        </Pressable>
      ) : (
        <View
          testID="saved-analysis-overlay-image-empty"
          style={[styles.image, styles.imageEmpty, containerStyle]}
        >
          <Ionicons name="image-outline" size={32} color={COLORS.fogGray} />
          <Text style={styles.imageEmptyText}>No saved image</Text>
        </View>
      )}

      {/* Overlay layer — shares the same positioning rect as the
          image so scaled (renderedX, renderedY) lines up pixel-
          for-pixel with the saved image. */}
      <View
        pointerEvents="box-none"
        style={[styles.overlayLayer, containerStyle]}
      >
        {renderableMarkers.map(({ item, anchor }) => (
          <DraggableSavedMarker
            key={item.id}
            item={item}
            anchor={anchor}
            markerSize={markerSize}
            onPress={() => handleMarkerPress(item)}
            onReposition={
              onRepositionItem
                ? (rx, ry) => onRepositionItem(item, rx, ry)
                : undefined
            }
            renderedWidth={renderedWidth}
            renderedHeight={renderedHeight}
          />
        ))}
      </View>

      {/* Detail panel — bottom-sheet-style modal so the user keeps
          context of the image underneath. */}
      <Modal
        animationType="fade"
        transparent
        visible={!!selectedItem}
        onRequestClose={closeDetail}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeDetail}>
          <Pressable
            style={styles.detailPanel}
            // stop clicks inside the panel from closing it
            onPress={() => {}}
            testID="saved-overlay-detail-panel"
          >
            {selectedItem && (
              <>
                <View style={styles.detailHeader}>
                  <View
                    style={[
                      styles.detailIconBadge,
                      {
                        backgroundColor: getOverlayItemTypeInfo(
                          selectedItem.type,
                        ).color,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        getOverlayItemTypeInfo(selectedItem.type).icon as any
                      }
                      size={18}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={styles.detailTitle} numberOfLines={2}>
                    {selectedItem.label || '(unlabeled)'}
                  </Text>
                  <TouchableOpacity
                    onPress={closeDetail}
                    accessibilityLabel="Close detail"
                    style={styles.detailClose}
                  >
                    <Ionicons name="close" size={22} color={COLORS.white} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.detailBody}
                  contentContainerStyle={styles.detailBodyContent}
                >
                  {selectedItem.description ? (
                    <Text style={styles.detailDescription}>
                      {selectedItem.description}
                    </Text>
                  ) : null}

                  {detailRows.map(row => (
                    <View key={row.label} style={styles.detailRow}>
                      <Text style={styles.detailRowLabel}>{row.label}</Text>
                      <Text
                        style={styles.detailRowValue}
                        selectable
                        testID={`saved-overlay-detail-${row.label
                          .toLowerCase()
                          .replace(/\s+/g, '-')}`}
                      >
                        {row.value}
                      </Text>
                    </View>
                  ))}

                  {(onEditItem || onDeleteItem) && (
                    <View style={styles.detailActions}>
                      {onEditItem && (
                        <TouchableOpacity
                          onPress={() => {
                            const it = selectedItem;
                            closeDetail();
                            onEditItem(it);
                          }}
                          style={[styles.detailActionBtn, styles.detailActionEdit]}
                          testID="saved-overlay-edit-btn"
                        >
                          <Ionicons
                            name="create-outline"
                            size={16}
                            color={COLORS.accent}
                          />
                          <Text style={styles.detailActionEditText}>Edit</Text>
                        </TouchableOpacity>
                      )}
                      {onDeleteItem && (
                        <TouchableOpacity
                          onPress={() => {
                            const it = selectedItem;
                            closeDetail();
                            onDeleteItem(it);
                          }}
                          style={[styles.detailActionBtn, styles.detailActionDelete]}
                          testID="saved-overlay-delete-btn"
                        >
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color={COLORS.avoidZones}
                          />
                          <Text style={styles.detailActionDeleteText}>Delete</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  image: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  imageEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cardBg,
  },
  imageEmptyText: {
    marginTop: 6,
    color: COLORS.fogGray,
    fontSize: 12,
  },
  overlayLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  marker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    // shadow on iOS, elevation on Android
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  detailPanel: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    maxHeight: '70%',
    paddingBottom: 8,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    gap: 10,
  },
  detailIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  detailClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBody: {
    paddingHorizontal: 14,
  },
  detailBodyContent: {
    paddingTop: 10,
    paddingBottom: 16,
  },
  detailDescription: {
    color: COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 12,
  },
  detailRowLabel: {
    color: COLORS.fogGray,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    minWidth: 92,
  },
  detailRowValue: {
    color: COLORS.textPrimary,
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
  },
  detailActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  detailActionBtn: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
  },
  detailActionEdit: {
    borderColor: COLORS.accent,
  },
  detailActionEditText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  detailActionDelete: {
    borderColor: COLORS.avoidZones,
  },
  detailActionDeleteText: {
    color: COLORS.avoidZones,
    fontSize: 13,
    fontWeight: '600',
  },
});

export default SavedAnalysisOverlayImage;
