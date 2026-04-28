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

import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
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

  return (
    <View
      testID={testID || 'saved-analysis-overlay-image'}
      style={[styles.container, containerStyle]}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, containerStyle]}
          resizeMode="cover"
          testID="saved-analysis-overlay-image-bg"
        />
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
        {renderableMarkers.map(({ item, anchor }) => {
          const info = getOverlayItemTypeInfo(item.type);
          const half = markerSize / 2;
          return (
            <TouchableOpacity
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${info.label}: ${item.label}`}
              testID={`saved-overlay-marker-${item.id}`}
              activeOpacity={0.85}
              onPress={() => handleMarkerPress(item)}
              style={[
                styles.marker,
                {
                  left: anchor.renderedX - half,
                  top: anchor.renderedY - half,
                  width: markerSize,
                  height: markerSize,
                  backgroundColor: info.color,
                  borderRadius: half,
                },
              ]}
            >
              <Ionicons
                name={info.icon as any}
                size={Math.round(markerSize * 0.55)}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          );
        })}
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
});

export default SavedAnalysisOverlayImage;
