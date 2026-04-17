import React, { useEffect, useState, useCallback } from 'react';
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

interface HuntRecord {
  id: string;
  species: string;
  speciesName: string;
  date: string;
  timeWindow: string;
  windDirection: string;
  mapImage: string;
  result: any;
  createdAt: string;
}

const SPECIES_ICONS: Record<string, string> = {
  deer: 'leaf',
  turkey: 'sunny',
  hog: 'paw',
};

export default function HistoryScreen() {
  const router = useRouter();
  const [hunts, setHunts] = useState<HuntRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHunts = async () => {
    const data = await AsyncStorage.getItem('hunt_history');
    if (data) {
      setHunts(JSON.parse(data));
    } else {
      setHunts([]);
    }
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
    Alert.alert(
      'Delete Hunt',
      'Remove this hunt plan?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = hunts.filter(h => h.id !== huntId);
            setHunts(updated);
            await AsyncStorage.setItem('hunt_history', JSON.stringify(updated));
          },
        },
      ]
    );
  };

  const clearAll = () => {
    Alert.alert(
      'Clear All Hunts',
      'Delete all saved hunt plans?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setHunts([]);
            await AsyncStorage.removeItem('hunt_history');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="history-back-button"
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>SAVED HUNTS</Text>
        {hunts.length > 0 && (
          <TouchableOpacity
            testID="clear-all-button"
            style={styles.clearButton}
            onPress={clearAll}
          >
            <Ionicons name="trash-outline" size={20} color={COLORS.avoidZones} />
          </TouchableOpacity>
        )}
      </View>

      {hunts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="compass-outline" size={64} color={COLORS.secondary} />
          <Text style={styles.emptyTitle}>NO SAVED HUNTS</Text>
          <Text style={styles.emptySubtitle}>Your hunt analyses will appear here</Text>
          <TouchableOpacity
            testID="empty-new-hunt-button"
            style={styles.emptyButton}
            onPress={() => router.push('/setup')}
          >
            <Ionicons name="add-circle" size={20} color={COLORS.primary} />
            <Text style={styles.emptyButtonText}>START NEW HUNT</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.accent}
            />
          }
        >
          <Text style={styles.countText}>{hunts.length} hunt{hunts.length !== 1 ? 's' : ''} saved</Text>

          {hunts.map((hunt) => (
            <TouchableOpacity
              key={hunt.id}
              testID={`hunt-card-${hunt.id}`}
              style={styles.huntCard}
              onPress={() => router.push({ pathname: '/results', params: { huntId: hunt.id } })}
              activeOpacity={0.7}
            >
              <View style={styles.cardRow}>
                {hunt.mapImage && (
                  <Image
                    source={{ uri: hunt.mapImage }}
                    style={styles.cardThumb}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.cardContent}>
                  <View style={styles.cardHeaderRow}>
                    <Ionicons
                      name={(SPECIES_ICONS[hunt.species] || 'paw') as any}
                      size={18}
                      color={COLORS.accent}
                    />
                    <Text style={styles.cardSpecies}>{hunt.speciesName}</Text>
                  </View>
                  <Text style={styles.cardDate}>
                    {hunt.date} · {hunt.timeWindow} · Wind {hunt.windDirection}
                  </Text>
                  {hunt.result?.summary && (
                    <Text style={styles.cardSummary} numberOfLines={2}>
                      {hunt.result.summary}
                    </Text>
                  )}
                  <Text style={styles.cardOverlays}>
                    {hunt.result?.overlays?.length || 0} overlays
                  </Text>
                </View>
                <TouchableOpacity
                  testID={`delete-hunt-${hunt.id}`}
                  style={styles.deleteButton}
                  onPress={() => deleteHunt(hunt.id)}
                >
                  <Ionicons name="close-circle" size={22} color={COLORS.avoidZones} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  topTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  clearButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(198, 40, 40, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 20,
  },
  emptySubtitle: {
    color: COLORS.fogGray,
    fontSize: 14,
    marginTop: 8,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 32,
    minHeight: 52,
  },
  emptyButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  // List
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  countText: {
    color: COLORS.fogGray,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  huntCard: {
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.15)',
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cardThumb: {
    width: 80,
    backgroundColor: COLORS.secondary,
  },
  cardContent: {
    flex: 1,
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cardSpecies: {
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardDate: {
    color: COLORS.fogGray,
    fontSize: 12,
    marginBottom: 6,
  },
  cardSummary: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  cardOverlays: {
    color: COLORS.fogGray,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  deleteButton: {
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
});
