import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../src/constants/theme';
import { useNetwork } from '../src/hooks/useNetwork';
import { useAuth } from '../src/hooks/useAuth';
import {
  listHistory,
  deleteHuntById,
  type HistoryEntryLite,
} from '../src/media/huntPersistence';
import { resolveAsset, resolveMediaUri } from '../src/media/mediaStore';

interface HistoryRow extends HistoryEntryLite {
  resolvedThumb?: string | null;
}

const SPECIES_ICONS: Record<string, string> = {
  deer: 'leaf',
  turkey: 'sunny',
  hog: 'paw',
};

export default function HistoryScreen() {
  const router = useRouter();
  const { isConnected } = useNetwork();
  const { user } = useAuth();
  const [hunts, setHunts] = useState<HistoryRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHunts = async () => {
    const rows = await listHistory((user as any)?.tier);
    // Resolve thumbnails in parallel. Each row gets a best-effort URI;
    // missing assets render a placeholder (see getThumb below).
    const enriched: HistoryRow[] = await Promise.all(
      rows.map(async (r) => {
        // Prefer inline thumbnail (tiny preview). Else resolve the
        // primary MediaAsset via the adapter.
        if (r.primaryMediaRef) {
          try {
            const uri = await resolveMediaUri(r.primaryMediaRef);
            return { ...r, resolvedThumb: uri };
          } catch {
            return { ...r, resolvedThumb: null };
          }
        }
        return { ...r, resolvedThumb: null };
      }),
    );
    setHunts(enriched);
  };

  useFocusEffect(
    useCallback(() => {
      loadHunts();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHunts();
    setRefreshing(false);
  };

  const deleteHunt = (huntId: string) => {
    Alert.alert('Delete Hunt', 'Remove this hunt plan?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setHunts(hunts.filter(h => h.id !== huntId));
          await deleteHuntById(huntId);
        },
      },
    ]);
  };

  const clearAll = () => {
    Alert.alert('Clear All Hunts', 'Delete all saved hunt plans?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          setHunts([]);
          await AsyncStorage.removeItem('hunt_history');
          await AsyncStorage.removeItem('current_hunt');
        },
      },
    ]);
  };

  const getThumb = (hunt: HistoryRow): string | null => hunt.resolvedThumb ?? null;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Offline Banner */}
      {!isConnected && (
        <View testID="offline-banner-history" style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color={COLORS.accent} />
          <Text style={styles.offlineBannerText}>OFFLINE — Viewing saved hunts</Text>
        </View>
      )}

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity testID="history-back-button" style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>SAVED HUNTS</Text>
        {hunts.length > 0 && (
          <TouchableOpacity testID="clear-all-button" style={styles.clearButton} onPress={clearAll}>
            <Ionicons name="trash-outline" size={20} color={COLORS.avoidZones} />
          </TouchableOpacity>
        )}
      </View>

      {hunts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="compass-outline" size={64} color={COLORS.secondary} />
          <Text style={styles.emptyTitle}>NO SAVED HUNTS</Text>
          <Text style={styles.emptySubtitle}>Your hunt analyses will appear here</Text>
          <TouchableOpacity testID="empty-new-hunt-button" style={styles.emptyButton} onPress={() => router.push('/setup')}>
            <Ionicons name="add-circle" size={20} color={COLORS.primary} />
            <Text style={styles.emptyButtonText}>START NEW HUNT</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        >
          <Text style={styles.countText}>{hunts.length} hunt{hunts.length !== 1 ? 's' : ''} saved locally</Text>

          {hunts.map((hunt) => {
            const thumb = getThumb(hunt);
            return (
              <TouchableOpacity
                key={hunt.id}
                testID={`hunt-card-${hunt.id}`}
                style={styles.huntCard}
                onPress={() => router.push({ pathname: '/results', params: { huntId: hunt.id } })}
                activeOpacity={0.7}
              >
                <View style={styles.cardRow}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.cardThumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.cardThumb, styles.cardThumbPlaceholder]}>
                      <Ionicons name="map-outline" size={22} color={COLORS.secondary} />
                    </View>
                  )}
                  <View style={styles.cardContent}>
                    <View style={styles.cardHeaderRow}>
                      <Ionicons name={(SPECIES_ICONS[hunt.species] || 'paw') as any} size={18} color={COLORS.accent} />
                      <Text style={styles.cardSpecies}>{hunt.speciesName}</Text>
                    </View>
                    <Text style={styles.cardDate}>
                      {hunt.date} · {hunt.timeWindow} · Wind {hunt.windDirection}
                    </Text>
                    <View style={styles.cardFooter}>
                      <View style={styles.offlineSavedBadge}>
                        <Ionicons name="download" size={12} color={COLORS.stands} />
                        <Text style={styles.offlineSavedText}>SAVED</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity testID={`delete-hunt-${hunt.id}`} style={styles.deleteButton} onPress={() => deleteHunt(hunt.id)}>
                    <Ionicons name="close-circle" size={22} color={COLORS.avoidZones} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Offline info */}
          <View style={styles.offlineInfo}>
            <Ionicons name="save" size={16} color={COLORS.fogGray} />
            <Text style={styles.offlineInfoText}>
              All hunts are saved locally on your device. View them anytime, even without signal.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 8,
    backgroundColor: 'rgba(200, 155, 60, 0.12)', borderBottomWidth: 1,
    borderBottomColor: 'rgba(200, 155, 60, 0.3)',
  },
  offlineBannerText: { color: COLORS.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(58, 74, 82, 0.5)', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  clearButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(198, 40, 40, 0.15)', alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '800', letterSpacing: 2, marginTop: 20 },
  emptySubtitle: { color: COLORS.fogGray, fontSize: 14, marginTop: 8 },
  emptyButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 24, marginTop: 32, minHeight: 52 },
  emptyButtonText: { color: COLORS.primary, fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  countText: { color: COLORS.fogGray, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 16, textTransform: 'uppercase' },
  huntCard: {
    backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 14, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.15)', overflow: 'hidden',
  },
  cardRow: { flexDirection: 'row', alignItems: 'stretch' },
  cardThumb: { width: 80, backgroundColor: COLORS.secondary },
  cardThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, padding: 14 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardSpecies: { color: COLORS.accent, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  cardDate: { color: COLORS.fogGray, fontSize: 12, marginBottom: 6 },
  cardSummary: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 6 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardOverlays: { color: COLORS.fogGray, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  mapCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(200, 155, 60, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  mapCountText: { color: COLORS.accent, fontSize: 10, fontWeight: '700' },
  offlineSavedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(46, 125, 50, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  offlineSavedText: { color: COLORS.stands, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  deleteButton: { paddingHorizontal: 12, justifyContent: 'center' },
  offlineInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(154, 164, 169, 0.1)',
  },
  offlineInfoText: { color: COLORS.fogGray, fontSize: 12, lineHeight: 18, flex: 1, opacity: 0.7 },
});
