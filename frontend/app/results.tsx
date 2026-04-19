import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  Dimensions,
  PanResponder,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, CUSTOM_MARKER_TYPES } from '../src/constants/theme';
import { useNetwork } from '../src/hooks/useNetwork';
import TacticalMapView from '../src/map/TacticalMapView';
import { buildAnalysisViewModel, type AnalysisViewModel } from '../src/utils/analysisAdapter';
import { AnalysisSummaryCard, TopSetupsSection, WindAnalysisCard, MapObservationsSection, AssumptionsCard, SpeciesTipsCard } from '../src/components/AnalysisSections';

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

const OVERLAY_COLORS: Record<string, string> = {
  stand: COLORS.stands,
  corridor: COLORS.corridors,
  access_route: COLORS.accessRoutes,
  avoid: COLORS.avoidZones,
  bedding: '#8D6E63',
  food: '#66BB6A',
  water: '#29B6F6',
  trail: '#FFCA28',
};

const OVERLAY_ICONS: Record<string, string> = {
  stand: 'pin',
  corridor: 'trail-sign',
  access_route: 'walk',
  avoid: 'warning',
  bedding: 'bed',
  food: 'nutrition',
  water: 'water',
  trail: 'footsteps',
};

const OVERLAY_LABELS: Record<string, string> = {
  stand: 'Stand / Blind',
  corridor: 'Travel Corridor',
  access_route: 'Access Route',
  avoid: 'Avoid Zone',
  bedding: 'Bedding Area',
  food: 'Food Source',
  water: 'Water Source',
  trail: 'Trail / Path',
};

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
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    loadHunt();
    // Timeout: if hunt not loaded in 5 seconds, show error
    const timeout = setTimeout(() => {
      setLoadFailed(true);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [params.huntId]);

  const loadHunt = async () => {
    try {
      // Try hunt_history first
      const data = await AsyncStorage.getItem('hunt_history');
      if (data) {
        const history: HuntRecord[] = JSON.parse(data);
        const found = history.find(h => h.id === params.huntId);
        if (found) {
          applyHunt(found);
          return;
        }
      }
    } catch {}
    try {
      // Fallback: current_hunt
      const current = await AsyncStorage.getItem('current_hunt');
      if (current) {
        const parsed: HuntRecord = JSON.parse(current);
        if (parsed.id === params.huntId) {
          applyHunt(parsed);
          return;
        }
      }
    } catch {}
    // If we get here, hunt was not found
    setLoadFailed(true);
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
  const primaryImage = mapImages[primaryIdx] || mapImages[0] || null;

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
    const xPercent = Math.max(3, Math.min(97, (locationX / MAP_WIDTH) * 100));
    const yPercent = Math.max(3, Math.min(97, (locationY / MAP_HEIGHT) * 100));

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
      marker.x_percent = Math.max(3, Math.min(97, marker.x_percent + (dx / MAP_WIDTH) * 100));
      marker.y_percent = Math.max(3, Math.min(97, marker.y_percent + (dy / MAP_HEIGHT) * 100));
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
      <SafeAreaView style={styles.safeArea}>
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
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={[styles.emptyText, { marginTop: 12 }]}>Loading results...</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const result = hunt.result;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Offline Banner */}
      {!isConnected && (
        <View testID="offline-banner" style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color={COLORS.accent} />
          <Text style={styles.offlineBannerText}>OFFLINE MODE — Viewing saved data</Text>
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
          {/* Primary image with overlays */}
          <View style={styles.mapContainer}>
            {primaryImage ? (
              <View
                style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
                onTouchEnd={editMode && addMode ? handleMapPress : undefined}
              >
                <Image source={{ uri: primaryImage }} style={styles.mapImage} resizeMode="cover" />
              </View>
            ) : (
              <View style={{ width: MAP_WIDTH, height: MAP_HEIGHT }} onTouchEnd={editMode && addMode ? handleMapPress : undefined}>
                <TacticalMapView
                  center={hunt.locationCoords || { lat: 39.8283, lon: -98.5795 }}
                  zoom={hunt.locationCoords ? 14 : 5}
                  height={MAP_HEIGHT}
                  showStyleSwitcher={true}
                />
              </View>
            )}

            {/* Overlay markers — ALWAYS on the primary image */}
            {overlays.map((overlay, idx) => (
              <DraggableMarker
                key={overlay.id}
                overlay={overlay}
                index={idx}
                editMode={editMode}
                isSelected={selectedOverlay?.id === overlay.id}
                onPress={() => setSelectedOverlay(selectedOverlay?.id === overlay.id ? null : overlay)}
                onDragStart={() => handleMarkerDragStart(idx)}
                onDrag={(dx, dy) => handleMarkerDrag(idx, dx, dy)}
                onDragEnd={handleMarkerDragEnd}
              />
            ))}

            {/* Legend overlay */}
            {showLegend && !editMode && (
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

        {/* Selected Overlay Detail */}
        {selectedOverlay && (
          <View style={[styles.overlayDetail, { borderLeftColor: OVERLAY_COLORS[selectedOverlay.type] || COLORS.accent }]}>
            <View style={styles.overlayDetailHeader}>
              <Ionicons
                name={(OVERLAY_ICONS[selectedOverlay.type] || 'location') as any}
                size={20}
                color={OVERLAY_COLORS[selectedOverlay.type] || COLORS.accent}
              />
              <Text style={[styles.overlayDetailTitle, { color: OVERLAY_COLORS[selectedOverlay.type] || COLORS.accent }]}>
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
            <TopSetupsSection setups={analysisVM.topSetups} />
            <WindAnalysisCard vm={analysisVM} />
            {analysisVM.hasMapObservations && (
              <MapObservationsSection observations={analysisVM.mapObservations} />
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
              <View style={[styles.overlayListDot, { backgroundColor: OVERLAY_COLORS[overlay.type] || COLORS.accent }]} />
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

// --- Draggable Marker Component ---
function DraggableMarker({
  overlay,
  index,
  editMode,
  isSelected,
  onPress,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  overlay: OverlayMarker;
  index: number;
  editMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onDragStart: () => void;
  onDrag: (dx: number, dy: number) => void;
  onDragEnd: () => void;
}) {
  const color = OVERLAY_COLORS[overlay.type] || COLORS.accent;
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
            left: Math.max(0, ((overlay.x_percent - zoneWidth / 2) / 100) * MAP_WIDTH),
            top: Math.max(0, ((overlay.y_percent - zoneHeight / 2) / 100) * MAP_HEIGHT),
            width: (zoneWidth / 100) * MAP_WIDTH,
            height: (zoneHeight / 100) * MAP_HEIGHT,
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
          left: (overlay.x_percent / 100) * MAP_WIDTH - 16,
          top: (overlay.y_percent / 100) * MAP_HEIGHT - 16,
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
    padding: 24, maxHeight: '60%', borderTopWidth: 1, borderTopColor: 'rgba(154, 164, 169, 0.3)',
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
});
