import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/constants/theme';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Ionicons name="navigate" size={28} color={COLORS.accent} />
            <Text style={styles.brandName}>RAVEN SCOUT</Text>
          </View>
          <Text style={styles.tagline}>A smarter way to plan your hunt.</Text>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroOverlay}>
            <Ionicons name="map" size={64} color={COLORS.accent} style={styles.heroIcon} />
            <Text style={styles.heroTitle}>TACTICAL{'\n'}HUNT PLANNING</Text>
            <Text style={styles.heroSubtitle}>
              Upload your map. Set conditions.{'\n'}Get AI-powered setup recommendations.
            </Text>
          </View>
        </View>

        {/* Start New Hunt Button */}
        <TouchableOpacity
          testID="new-hunt-button"
          style={styles.primaryButton}
          onPress={() => router.push('/setup')}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle" size={24} color={COLORS.primary} />
          <Text style={styles.primaryButtonText}>NEW HUNT</Text>
        </TouchableOpacity>

        {/* View History */}
        <TouchableOpacity
          testID="history-button"
          style={styles.secondaryButton}
          onPress={() => router.push('/history')}
          activeOpacity={0.8}
        >
          <Ionicons name="time-outline" size={22} color={COLORS.textSecondary} />
          <Text style={styles.secondaryButtonText}>SAVED HUNTS</Text>
        </TouchableOpacity>

        {/* Features Grid */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionLabel}>CAPABILITIES</Text>
          <View style={styles.featuresGrid}>
            <FeatureCard
              icon="eye"
              title="Vision AI"
              subtitle="Map terrain analysis"
            />
            <FeatureCard
              icon="compass"
              title="Wind Logic"
              subtitle="Optimal positioning"
            />
            <FeatureCard
              icon="layers"
              title="Overlays"
              subtitle="Stand, route, corridor"
            />
            <FeatureCard
              icon="paw"
              title="3 Species"
              subtitle="Deer, turkey, hog"
            />
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.fogGray} />
          <Text style={styles.disclaimerText}>
            Decision-support tool only. Verify land ownership, regulations, and safety independently.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureCard({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <View style={styles.featureCard} testID={`feature-card-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <Ionicons name={icon as any} size={24} color={COLORS.accent} />
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    marginTop: 16,
    marginBottom: 32,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  brandName: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 3,
  },
  tagline: {
    color: COLORS.fogGray,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginLeft: 38,
  },
  heroSection: {
    marginBottom: 32,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.2)',
  },
  heroOverlay: {
    padding: 32,
    alignItems: 'center',
  },
  heroIcon: {
    marginBottom: 16,
    opacity: 0.9,
  },
  heroTitle: {
    color: COLORS.textPrimary,
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2,
    lineHeight: 40,
    marginBottom: 12,
  },
  heroSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 32,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 14,
  },
  primaryButtonText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  secondaryButton: {
    backgroundColor: 'rgba(58, 74, 82, 0.5)',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.25)',
    marginBottom: 40,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  featuresSection: {
    marginBottom: 32,
  },
  sectionLabel: {
    color: COLORS.fogGray,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 16,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureCard: {
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderRadius: 12,
    padding: 16,
    width: (width - 60) / 2,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.15)',
  },
  featureTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  featureSubtitle: {
    color: COLORS.fogGray,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(154, 164, 169, 0.1)',
  },
  disclaimerText: {
    color: COLORS.fogGray,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
    opacity: 0.7,
  },
});
