import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';
import { RavenSpinner } from '../src/components/RavenSpinner';
import { useScrollToTopOnFocus } from '../src/hooks/useScrollToTopOnFocus';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user]);

  useEffect(() => {
    if (user) refreshUser();
  }, []);

  // Reset scroll to top whenever this screen regains focus (e.g.
  // coming back from /setup or /results).
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTopOnFocus(scrollRef);

  if (loading || !user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <RavenSpinner size={120} />
        </View>
      </SafeAreaView>
    );
  }

  const usage = user.usage;
  const tierLabel = user.tier.toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header with account */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Ionicons name="navigate" size={28} color={COLORS.accent} />
            <Text style={styles.brandName}>RAVEN SCOUT</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity testID="subscription-button" style={styles.tierBadge} onPress={() => router.push('/subscription')}>
              <Text style={styles.tierBadgeText}>{tierLabel}</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="profile-avatar-button"
              style={styles.avatarButton}
              onPress={() => router.push('/profile')}
              activeOpacity={0.8}
              accessibilityLabel="Open profile"
              accessibilityRole="button"
            >
              {user.picture ? (
                <Image source={{ uri: user.picture }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {(user.name || user.email || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Usage Bar */}
        <View testID="usage-display" style={styles.usageCard}>
          <View style={styles.usageHeader}>
            <Text style={styles.usageTitle}>ANALYSES REMAINING</Text>
            <TouchableOpacity onPress={() => router.push('/subscription')}>
              <Text style={styles.upgradeLinkText}>Manage Plan</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.usageBarContainer}>
            <View style={[styles.usageBar, { width: `${Math.min(100, (usage.remaining / usage.limit) * 100)}%` }]} />
          </View>
          <View style={styles.usageNumbers}>
            <Text style={styles.usageRemaining}>{usage.remaining}</Text>
            <Text style={styles.usageOf}>of {usage.limit} {user.tier === 'trial' ? 'lifetime' : 'this month'}</Text>
          </View>
          {usage.remaining === 0 && (
            <TouchableOpacity testID="upgrade-cta" style={styles.upgradeCta} onPress={() => router.push('/subscription')}>
              <Ionicons name="arrow-up-circle" size={18} color={COLORS.primary} />
              <Text style={styles.upgradeCtaText}>UPGRADE TO CONTINUE</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Welcome */}
        <Text style={styles.welcomeText}>Welcome, {user.name?.split(' ')[0] || 'Hunter'}</Text>

        {/* Hero */}
        <View style={styles.heroSection}>
          <View style={styles.heroOverlay}>
            <Ionicons name="map" size={56} color={COLORS.accent} style={styles.heroIcon} />
            <Text style={styles.heroTitle}>TACTICAL{'\n'}HUNT PLANNING</Text>
            <Text style={styles.heroSubtitle}>Upload your map. Set conditions.{'\n'}Get AI-powered setup recommendations.</Text>
          </View>
        </View>

        {/* Actions */}
        <TouchableOpacity
          testID="new-hunt-button"
          style={[styles.primaryButton, usage.remaining === 0 && styles.primaryButtonDisabled]}
          onPress={() => usage.remaining > 0 ? router.push('/setup') : router.push('/subscription')}
          activeOpacity={0.8}
        >
          <Ionicons name={usage.remaining > 0 ? 'add-circle' : 'lock-closed'} size={24} color={COLORS.primary} />
          <Text style={styles.primaryButtonText}>{usage.remaining > 0 ? 'NEW HUNT' : 'UPGRADE TO HUNT'}</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="history-button" style={styles.secondaryButton} onPress={() => router.push('/history')} activeOpacity={0.8}>
          <Ionicons name="time-outline" size={22} color={COLORS.textSecondary} />
          <Text style={styles.secondaryButtonText}>SAVED HUNTS</Text>
        </TouchableOpacity>

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionLabel}>CAPABILITIES</Text>
          <View style={styles.featuresGrid}>
            <FeatureCard icon="eye" title="Vision AI" subtitle="Map terrain analysis" />
            <FeatureCard icon="compass" title="Wind Logic" subtitle="Optimal positioning" />
            <FeatureCard icon="layers" title="Overlays" subtitle="Stand, route, corridor" />
            <FeatureCard icon="paw" title="8 Species" subtitle="Big game · predator · bird" />
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.fogGray} />
          <Text style={styles.disclaimerText}>Decision-support tool only. Verify land ownership, regulations, and safety independently.</Text>
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
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandName: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(200, 155, 60, 0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.3)',
  },
  tierBadgeText: { color: COLORS.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  accountButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(58, 74, 82, 0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarButton: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
    borderWidth: 1.5, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(200, 155, 60, 0.12)',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 20 },
  avatarFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: COLORS.accent, fontSize: 16, fontWeight: '900' },
  // Usage
  usageCard: {
    backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 14, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.15)',
  },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  usageTitle: { color: COLORS.fogGray, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  upgradeLinkText: { color: COLORS.accent, fontSize: 12, fontWeight: '600' },
  usageBarContainer: { height: 6, backgroundColor: 'rgba(58, 74, 82, 0.6)', borderRadius: 3, overflow: 'hidden' },
  usageBar: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 3 },
  usageNumbers: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 },
  usageRemaining: { color: COLORS.accent, fontSize: 28, fontWeight: '900' },
  usageOf: { color: COLORS.fogGray, fontSize: 13 },
  upgradeCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 8, paddingVertical: 10, marginTop: 12,
  },
  upgradeCtaText: { color: COLORS.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  welcomeText: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 16 },
  heroSection: { marginBottom: 24, borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.secondary, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.2)' },
  heroOverlay: { padding: 28, alignItems: 'center' },
  heroIcon: { marginBottom: 12, opacity: 0.9 },
  heroTitle: { color: COLORS.textPrimary, fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: 2, lineHeight: 36, marginBottom: 10 },
  heroSubtitle: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  primaryButton: {
    backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 18, paddingHorizontal: 32,
    minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14,
  },
  primaryButtonDisabled: { backgroundColor: 'rgba(58, 74, 82, 0.5)' },
  primaryButtonText: { color: COLORS.primary, fontSize: 18, fontWeight: '800', letterSpacing: 2 },
  secondaryButton: {
    backgroundColor: 'rgba(58, 74, 82, 0.5)', borderRadius: 10, paddingVertical: 16, paddingHorizontal: 32,
    minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.25)', marginBottom: 32,
  },
  secondaryButtonText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700', letterSpacing: 1.5 },
  featuresSection: { marginBottom: 24 },
  sectionLabel: { color: COLORS.fogGray, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 16 },
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  featureCard: {
    backgroundColor: 'rgba(58, 74, 82, 0.4)', borderRadius: 12, padding: 16, width: (width - 60) / 2,
    borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.15)',
  },
  featureTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 10 },
  featureSubtitle: { color: COLORS.fogGray, fontSize: 12, fontWeight: '500', marginTop: 4 },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(154, 164, 169, 0.1)' },
  disclaimerText: { color: COLORS.fogGray, fontSize: 11, lineHeight: 16, flex: 1, opacity: 0.7 },
});
