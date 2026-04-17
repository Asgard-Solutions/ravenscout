import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../src/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 350;

interface OverlayMarker {
  type: string;
  label: string;
  x_percent: number;
  y_percent: number;
  width_percent?: number;
  height_percent?: number;
  reasoning: string;
  confidence: string;
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
  mapImage: string;
  result: HuntResult;
  createdAt: string;
}

const OVERLAY_COLORS: Record<string, string> = {
  stand: COLORS.stands,
  corridor: COLORS.corridors,
  access_route: COLORS.accessRoutes,
  avoid: COLORS.avoidZones,
};

const OVERLAY_ICONS: Record<string, string> = {
  stand: 'pin',
  corridor: 'trail-sign',
  access_route: 'walk',
  avoid: 'warning',
};

const OVERLAY_LABELS: Record<string, string> = {
  stand: 'Stand / Blind',
  corridor: 'Travel Corridor',
  access_route: 'Access Route',
  avoid: 'Avoid Zone',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: COLORS.stands,
  medium: COLORS.accent,
  low: COLORS.fogGray,
};

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ huntId: string }>();
  const [hunt, setHunt] = useState<HuntRecord | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<OverlayMarker | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  useEffect(() => {
    loadHunt();
  }, [params.huntId]);

  const loadHunt = async () => {
    const data = await AsyncStorage.getItem('hunt_history');
    if (data) {
      const history: HuntRecord[] = JSON.parse(data);
      const found = history.find(h => h.id === params.huntId);
      if (found) setHunt(found);
    }
  };

  if (!hunt) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading results...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const result = hunt.result;

  return (
    <SafeAreaView style={styles.safeArea}>
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
        <TouchableOpacity
          testID="toggle-legend-button"
          style={styles.legendButton}
          onPress={() => setShowLegend(!showLegend)}
        >
          <Ionicons name="layers" size={22} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Map with Overlays */}
        <View style={styles.mapContainer}>
          <Image
            source={{ uri: hunt.mapImage }}
            style={styles.mapImage}
            resizeMode="cover"
          />
          {/* Overlay markers on the map */}
          {result.overlays.map((overlay, idx) => {
            const color = OVERLAY_COLORS[overlay.type] || COLORS.accent;
            const isZone = overlay.type === 'corridor' || overlay.type === 'avoid';

            if (isZone && overlay.width_percent && overlay.height_percent) {
              return (
                <TouchableOpacity
                  key={idx}
                  testID={`overlay-zone-${idx}`}
                  style={[
                    styles.overlayZone,
                    {
                      left: `${overlay.x_percent - overlay.width_percent / 2}%` as any,
                      top: `${(overlay.y_percent / 100) * MAP_HEIGHT - (overlay.height_percent / 100) * MAP_HEIGHT / 2}`,
                      width: `${overlay.width_percent}%` as any,
                      height: (overlay.height_percent / 100) * MAP_HEIGHT,
                      backgroundColor: `${color}33`,
                      borderColor: color,
                    },
                  ]}
                  onPress={() => setSelectedOverlay(overlay)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.zoneLabel, { color }]} numberOfLines={1}>
                    {overlay.label}
                  </Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={idx}
                testID={`overlay-marker-${idx}`}
                style={[
                  styles.overlayMarker,
                  {
                    left: `${overlay.x_percent - 3}%` as any,
                    top: (overlay.y_percent / 100) * MAP_HEIGHT - 16,
                    backgroundColor: color,
                    borderColor: '#FFFFFF',
                  },
                ]}
                onPress={() => setSelectedOverlay(overlay)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={(OVERLAY_ICONS[overlay.type] || 'location') as any}
                  size={16}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            );
          })}

          {/* Legend overlay */}
          {showLegend && (
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

        {/* Selected Overlay Detail */}
        {selectedOverlay && (
          <View style={[styles.overlayDetail, { borderLeftColor: OVERLAY_COLORS[selectedOverlay.type] }]}>
            <View style={styles.overlayDetailHeader}>
              <Ionicons
                name={(OVERLAY_ICONS[selectedOverlay.type] || 'location') as any}
                size={20}
                color={OVERLAY_COLORS[selectedOverlay.type]}
              />
              <Text style={[styles.overlayDetailTitle, { color: OVERLAY_COLORS[selectedOverlay.type] }]}>
                {selectedOverlay.label}
              </Text>
              <View style={[styles.confidenceBadge, { backgroundColor: `${CONFIDENCE_COLORS[selectedOverlay.confidence]}22` }]}>
                <Text style={[styles.confidenceText, { color: CONFIDENCE_COLORS[selectedOverlay.confidence] }]}>
                  {selectedOverlay.confidence.toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity testID="close-overlay-detail" onPress={() => setSelectedOverlay(null)}>
                <Ionicons name="close" size={20} color={COLORS.fogGray} />
              </TouchableOpacity>
            </View>
            <Text style={styles.overlayReasoning}>{selectedOverlay.reasoning}</Text>
          </View>
        )}

        {/* Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ANALYSIS SUMMARY</Text>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>{result.summary}</Text>
          </View>
        </View>

        {/* Top Setups */}
        {result.top_setups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TOP SETUPS</Text>
            {result.top_setups.map((setup, idx) => (
              <View key={idx} style={styles.setupCard}>
                <View style={styles.setupNumber}>
                  <Text style={styles.setupNumberText}>{idx + 1}</Text>
                </View>
                <Text style={styles.setupText}>{setup}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Wind & Timing */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Ionicons name="compass" size={22} color={COLORS.accessRoutes} />
            <Text style={styles.infoLabel}>WIND NOTES</Text>
            <Text style={styles.infoValue}>{result.wind_notes}</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="time" size={22} color={COLORS.accent} />
            <Text style={styles.infoLabel}>BEST TIME</Text>
            <Text style={styles.infoValue}>{result.best_time}</Text>
          </View>
        </View>

        {/* Species Tips */}
        {result.species_tips.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SPECIES TIPS</Text>
            {result.species_tips.map((tip, idx) => (
              <View key={idx} style={styles.tipRow}>
                <Ionicons name="paw" size={14} color={COLORS.accent} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Key Assumptions */}
        {result.key_assumptions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>KEY ASSUMPTIONS</Text>
            {result.key_assumptions.map((assumption, idx) => (
              <View key={idx} style={styles.assumptionRow}>
                <Ionicons name="information-circle" size={14} color={COLORS.fogGray} />
                <Text style={styles.assumptionText}>{assumption}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Overlay List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ALL OVERLAYS ({result.overlays.length})</Text>
          {result.overlays.map((overlay, idx) => (
            <TouchableOpacity
              key={idx}
              testID={`overlay-list-item-${idx}`}
              style={styles.overlayListItem}
              onPress={() => setSelectedOverlay(overlay)}
            >
              <View style={[styles.overlayListDot, { backgroundColor: OVERLAY_COLORS[overlay.type] }]} />
              <View style={styles.overlayListContent}>
                <Text style={styles.overlayListLabel}>{overlay.label}</Text>
                <Text style={styles.overlayListType}>{OVERLAY_LABELS[overlay.type]}</Text>
              </View>
              <View style={[styles.confidenceBadgeSmall, { backgroundColor: `${CONFIDENCE_COLORS[overlay.confidence]}22` }]}>
                <Text style={[styles.confidenceTextSmall, { color: CONFIDENCE_COLORS[overlay.confidence] }]}>
                  {overlay.confidence}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerSection}>
          <Ionicons name="shield-checkmark" size={16} color={COLORS.fogGray} />
          <Text style={styles.disclaimerText}>
            These recommendations are AI-generated suggestions. Always verify regulations, property boundaries, and safety independently.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom Actions */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: COLORS.fogGray,
    fontSize: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(58, 74, 82, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCenter: {
    flex: 1,
  },
  topTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  topSubtitle: {
    color: COLORS.fogGray,
    fontSize: 12,
    marginTop: 2,
  },
  legendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(58, 74, 82, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  // Map
  mapContainer: {
    position: 'relative',
    height: MAP_HEIGHT,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.3)',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  overlayMarker: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  overlayZone: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  zoneLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  legendOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(11, 31, 42, 0.92)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.3)',
  },
  legendTitle: {
    color: COLORS.fogGray,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  legendLabel: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  // Overlay detail
  overlayDetail: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.2)',
  },
  overlayDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  overlayDetailTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  overlayReasoning: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  // Sections
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.15)',
  },
  summaryText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    lineHeight: 24,
  },
  // Setups
  setupCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: 'rgba(58, 74, 82, 0.3)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.1)',
  },
  setupNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupNumberText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  setupText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  // Info Grid
  infoGrid: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 24,
  },
  infoCard: {
    flex: 1,
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.15)',
  },
  infoLabel: {
    color: COLORS.fogGray,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 10,
    marginBottom: 6,
  },
  infoValue: {
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 20,
  },
  // Tips
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  tipText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  // Assumptions
  assumptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  assumptionText: {
    color: COLORS.fogGray,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  // Overlay list
  overlayListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(58, 74, 82, 0.3)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.1)',
  },
  overlayListDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  overlayListContent: {
    flex: 1,
  },
  overlayListLabel: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  overlayListType: {
    color: COLORS.fogGray,
    fontSize: 11,
    marginTop: 2,
  },
  confidenceBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  confidenceTextSmall: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'capitalize',
  },
  // Disclaimer
  disclaimerSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(154, 164, 169, 0.1)',
  },
  disclaimerText: {
    color: COLORS.fogGray,
    fontSize: 11,
    lineHeight: 17,
    flex: 1,
    opacity: 0.7,
  },
  // Bottom
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(154, 164, 169, 0.1)',
  },
  newHuntButton: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
  },
  newHuntText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  homeButton: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: 'rgba(58, 74, 82, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.2)',
  },
});
