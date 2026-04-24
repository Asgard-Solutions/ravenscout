import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useScrollToTopOnFocus } from '../src/hooks/useScrollToTopOnFocus';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';

const TIER_DATA = [
  {
    id: 'trial', name: 'Trial', monthly: 0, annual: 0, analyses: '3 lifetime',
    features: ['3 AI analyses (lifetime)', 'Manual weather input', 'Local device storage', '3 species supported'],
    missing: ['No weather API auto-fill', 'No cloud sync'],
  },
  {
    id: 'core', name: 'Core', monthly: 7.99, annual: 79.99, analyses: '10/month',
    features: ['10 AI analyses/month', 'Weather API auto-fill', 'MapLibre + OSM maps', 'Local storage', 'Unused analyses rollover (1 month)'],
    missing: ['No cloud sync'],
    popular: true,
  },
  {
    id: 'pro', name: 'Pro', monthly: 14.99, annual: 149.99, analyses: '100/month',
    features: ['100 AI analyses/month', 'Weather API auto-fill', 'Cloud sync across devices', 'Priority analysis', 'Unused analyses rollover (1 month)'],
    missing: [],
  },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTopOnFocus(scrollRef);
  const { user, refreshUser } = useAuth();
  const [billingCycle, setBillingCycle] = useState<'annual' | 'monthly'>('annual');
  const [purchasing, setPurchasing] = useState(false);

  const currentTier = user?.tier || 'trial';

  const handlePurchase = async (tierId: string) => {
    if (tierId === 'trial') return;
    if (tierId === currentTier) return;

    setPurchasing(true);
    try {
      // RevenueCat purchase flow
      // In Expo Go preview mode, this will show a mock purchase
      // In production builds, this triggers real App Store / Play Store purchase
      Alert.alert(
        'Subscription',
        `This will initiate a ${billingCycle} subscription for the ${tierId.charAt(0).toUpperCase() + tierId.slice(1)} plan via App Store / Google Play.\n\nIn preview mode (Expo Go), purchases are simulated. Real purchases require a production build.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Subscribe',
            onPress: async () => {
              // In preview mode, simulate tier upgrade
              try {
                const resp = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/subscription/sync-revenuecat`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${await getSessionToken()}`,
                  },
                  body: JSON.stringify({
                    revenuecat_user_id: user?.user_id,
                    entitlements: {
                      [`${tierId}_entitlement`]: {
                        isActive: true,
                        productIdentifier: `${tierId}_${billingCycle}`,
                      },
                    },
                  }),
                });
                if (resp.ok) {
                  await refreshUser();
                  Alert.alert('Success', `Upgraded to ${tierId.charAt(0).toUpperCase() + tierId.slice(1)} plan!`);
                }
              } catch {}
            },
          },
        ]
      );
    } finally {
      setPurchasing(false);
    }
  };

  const getSessionToken = async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return await AsyncStorage.getItem('session_token');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="sub-back-button" style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>PLANS</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Usage Display */}
        {user && (
          <View testID="current-usage" style={styles.usageCard}>
            <Text style={styles.usageLabel}>CURRENT PLAN</Text>
            <Text style={styles.usageTier}>{currentTier.toUpperCase()}</Text>
            <View style={styles.usageRow}>
              <Ionicons name="analytics" size={16} color={COLORS.accent} />
              <Text style={styles.usageText}>
                {user.usage.remaining} of {user.usage.limit} analyses remaining
              </Text>
            </View>
          </View>
        )}

        {/* Billing Toggle */}
        <View style={styles.billingToggle}>
          <TouchableOpacity
            testID="billing-monthly"
            style={[styles.billingOption, billingCycle === 'monthly' && styles.billingOptionActive]}
            onPress={() => setBillingCycle('monthly')}
          >
            <Text style={[styles.billingOptionText, billingCycle === 'monthly' && styles.billingOptionTextActive]}>Monthly</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="billing-annual"
            style={[styles.billingOption, billingCycle === 'annual' && styles.billingOptionActive]}
            onPress={() => setBillingCycle('annual')}
          >
            <Text style={[styles.billingOptionText, billingCycle === 'annual' && styles.billingOptionTextActive]}>Annual</Text>
            <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>SAVE ~17%</Text></View>
          </TouchableOpacity>
        </View>

        {/* Tier Cards */}
        {TIER_DATA.map((tier) => {
          const isCurrent = currentTier === tier.id;
          const price = billingCycle === 'annual' ? tier.annual : tier.monthly;
          const perMonth = billingCycle === 'annual' && tier.annual > 0
            ? (tier.annual / 12).toFixed(2) : null;

          return (
            <View
              key={tier.id}
              testID={`tier-card-${tier.id}`}
              style={[styles.tierCard, tier.popular && styles.tierCardPopular, isCurrent && styles.tierCardCurrent]}
            >
              {tier.popular && (
                <View style={styles.popularBadge}><Text style={styles.popularBadgeText}>MOST POPULAR</Text></View>
              )}
              <View style={styles.tierHeader}>
                <Text style={styles.tierName}>{tier.name}</Text>
                <Text style={styles.tierAnalyses}>{tier.analyses}</Text>
              </View>

              {price > 0 ? (
                <View style={styles.priceRow}>
                  <Text style={styles.priceAmount}>${billingCycle === 'annual' ? perMonth : price.toFixed(2)}</Text>
                  <Text style={styles.pricePeriod}>/month</Text>
                  {billingCycle === 'annual' && (
                    <Text style={styles.priceBilled}>(billed ${tier.annual}/yr)</Text>
                  )}
                </View>
              ) : (
                <Text style={styles.priceFree}>FREE</Text>
              )}

              {/* Features */}
              <View style={styles.featuresList}>
                {tier.features.map((f, i) => (
                  <View key={i} style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.stands} />
                    <Text style={styles.featureItemText}>{f}</Text>
                  </View>
                ))}
                {tier.missing.map((f, i) => (
                  <View key={`m-${i}`} style={styles.featureItem}>
                    <Ionicons name="close-circle" size={16} color={COLORS.fogGray} />
                    <Text style={[styles.featureItemText, { color: COLORS.fogGray }]}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* Action Button */}
              {isCurrent ? (
                <View style={styles.currentPlanBadge}>
                  <Ionicons name="checkmark" size={16} color={COLORS.stands} />
                  <Text style={styles.currentPlanText}>CURRENT PLAN</Text>
                </View>
              ) : tier.id !== 'trial' ? (
                <TouchableOpacity
                  testID={`subscribe-${tier.id}`}
                  style={[styles.subscribeButton, tier.popular && styles.subscribeButtonPopular]}
                  onPress={() => handlePurchase(tier.id)}
                  disabled={purchasing}
                >
                  <Text style={styles.subscribeButtonText}>
                    {currentTier === 'trial' ? 'UPGRADE' : tier.id === 'pro' ? 'UPGRADE' : 'SWITCH'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}

        <Text style={styles.footerNote}>
          Subscriptions are managed through App Store / Google Play.{'\n'}
          Cancel anytime. Unused analyses carry over for 1 month.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(58, 74, 82, 0.5)', alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  // Usage
  usageCard: {
    backgroundColor: 'rgba(200, 155, 60, 0.08)', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.2)', marginBottom: 20,
  },
  usageLabel: { color: COLORS.fogGray, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  usageTier: { color: COLORS.accent, fontSize: 22, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  usageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  usageText: { color: COLORS.textSecondary, fontSize: 14 },
  // Billing toggle
  billingToggle: {
    flexDirection: 'row', backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderRadius: 10, padding: 3, marginBottom: 20,
  },
  billingOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 8,
  },
  billingOptionActive: { backgroundColor: COLORS.accent },
  billingOptionText: { color: COLORS.fogGray, fontSize: 14, fontWeight: '700' },
  billingOptionTextActive: { color: COLORS.primary },
  saveBadge: { backgroundColor: 'rgba(46, 125, 50, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  saveBadgeText: { color: COLORS.stands, fontSize: 9, fontWeight: '800' },
  // Tier cards
  tierCard: {
    backgroundColor: 'rgba(58, 74, 82, 0.35)', borderRadius: 16, padding: 20,
    marginBottom: 14, borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.15)',
  },
  tierCardPopular: { borderColor: COLORS.accent, borderWidth: 2 },
  tierCardCurrent: { borderColor: COLORS.stands },
  popularBadge: {
    position: 'absolute', top: -1, right: 16,
    backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 4,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
  },
  popularBadgeText: { color: COLORS.primary, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  tierHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  tierName: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  tierAnalyses: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 16 },
  priceAmount: { color: COLORS.textPrimary, fontSize: 32, fontWeight: '900' },
  pricePeriod: { color: COLORS.fogGray, fontSize: 14 },
  priceBilled: { color: COLORS.fogGray, fontSize: 11, marginLeft: 8 },
  priceFree: { color: COLORS.stands, fontSize: 28, fontWeight: '900', marginBottom: 16 },
  featuresList: { gap: 8, marginBottom: 16 },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureItemText: { color: COLORS.textSecondary, fontSize: 13, flex: 1 },
  currentPlanBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(46, 125, 50, 0.15)', borderRadius: 10, paddingVertical: 12,
  },
  currentPlanText: { color: COLORS.stands, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  subscribeButton: {
    backgroundColor: 'rgba(58, 74, 82, 0.6)', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(154, 164, 169, 0.3)',
  },
  subscribeButtonPopular: { backgroundColor: COLORS.accent, borderColor: 'transparent' },
  subscribeButtonText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  footerNote: { color: COLORS.fogGray, fontSize: 11, textAlign: 'center', lineHeight: 18, marginTop: 8, opacity: 0.7 },
});
