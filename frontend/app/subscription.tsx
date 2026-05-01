import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useScrollToTopOnFocus } from '../src/hooks/useScrollToTopOnFocus';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';
import {
  isPurchasesAvailable,
  purchasePackage,
  getDefaultPackages,
  entitlementsPayload,
} from '../src/lib/purchases';
import { packageIdFor, type Tier, type BillingCycle } from '../src/constants/revenuecat';

// Apple's standard EULA — used because we don't ship a custom one.
// Apple App Store reviewer can verify this link from inside the app
// (Guideline 3.1.2(c) — required for auto-renewable subscriptions).
const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_POLICY_URL = 'https://asgardsolution.io/raven-scout/privacy';

// Marketplace label — App Store on iOS, Google Play on Android.
// Apple Guideline 2.3.10 forbids referencing "Google Play" inside the
// iOS binary, so we platform-gate this string everywhere it appears
// in user-facing UI.
const STORE_NAME = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

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
    id: 'pro', name: 'Pro', monthly: 14.99, annual: 149.99, analyses: '40/month',
    features: ['40 AI analyses/month', 'Weather API auto-fill', 'Cloud sync across devices', 'Priority analysis', 'Unused analyses rollover (1 year)'],
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

    const tier = tierId as Tier;
    const cycle = billingCycle as BillingCycle;
    const packageId = packageIdFor(tier, cycle);
    const tierLabel = tierId.charAt(0).toUpperCase() + tierId.slice(1);

    // Branch A: native build with the RevenueCat SDK loaded — drive a
    // real StoreKit / Play Billing purchase via offerings + packages.
    // We never reference raw Google Play / Apple product ids here so a
    // dashboard catalog change can ship without an app update.
    if (isPurchasesAvailable()) {
      setPurchasing(true);
      try {
        // 1. Pull the `default` offering and find the right package.
        const pkgs = await getDefaultPackages();
        if (!pkgs.ok) {
          Alert.alert(
            'Plans unavailable',
            pkgs.reason === 'offering_missing'
              ? 'Subscription plans are not configured yet. Please try again later.'
              : 'Could not load plans from the store. Please check your connection and try again.',
          );
          return;
        }
        const pkg = pkgs.value[packageId];
        if (!pkg) {
          Alert.alert(
            'Plan unavailable',
            `The ${tierLabel} ${cycle} plan is not available on this device right now.`,
          );
          return;
        }

        // 2. Drive the platform purchase by RevenueCat package.
        const result = await purchasePackage(pkg);

        if (result.status === 'cancelled') return;
        if (result.status === 'error') {
          Alert.alert('Purchase failed', result.message || 'Please try again.');
          return;
        }
        if (result.status === 'unavailable') {
          // Race: SDK said available, but a sub-call returned unavailable.
          // Fall through to the preview-mode confirmation below.
        } else {
          // Success — sync entitlements with our backend so the user's
          // tier flips immediately, and refresh the cached User.
          try {
            const resp = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/subscription/sync-revenuecat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${await getSessionToken()}`,
              },
              body: JSON.stringify({
                revenuecat_user_id: user?.user_id,
                entitlements: entitlementsPayload(result.customerInfo),
              }),
            });
            if (resp.ok) {
              await refreshUser();
              Alert.alert('Success', `Upgraded to ${tierLabel} plan!`);
            } else {
              Alert.alert(
                'Purchase complete',
                'Your purchase succeeded but we could not sync your tier yet. Pull to refresh in a few seconds.',
              );
            }
          } catch {
            Alert.alert(
              'Purchase complete',
              'Your purchase succeeded but the network is unreachable. Tier will update once back online.',
            );
          }
          return;
        }
      } finally {
        setPurchasing(false);
      }
    }

    // Branch B: preview mode (Expo Go / web) — confirm + simulate the
    // tier upgrade via the same backend sync endpoint so the rest of
    // the UX can still be exercised without StoreKit. We send a
    // synthetic entitlement keyed by the canonical entitlement id so
    // the backend takes the same code path as a real purchase.
    setPurchasing(true);
    try {
      Alert.alert(
        'Subscription',
        `This will initiate a ${cycle} subscription for the ${tierLabel} plan via ${STORE_NAME}.\n\nIn preview mode (Expo Go), purchases are simulated. Real purchases require a production / preview build with the RevenueCat SDK.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Subscribe',
            onPress: async () => {
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
                      [tier]: {
                        isActive: true,
                        productIdentifier: packageId,
                      },
                    },
                  }),
                });
                if (resp.ok) {
                  await refreshUser();
                  Alert.alert('Success', `Upgraded to ${tierLabel} plan!`);
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
                <View style={styles.priceBlock}>
                  {/* PRIMARY price = the actual amount Apple/Google
                      will charge the user. This MUST be the most
                      visually prominent element (Guideline 3.1.2(c)):
                        - Annual:  "$79.99 / year"
                        - Monthly: "$7.99 / month"
                      The per-month-equivalent for annual plans is
                      shown as small subordinate text BELOW. */}
                  <View style={styles.priceRow}>
                    <Text style={styles.priceAmount}>
                      ${(billingCycle === 'annual' ? tier.annual : tier.monthly).toFixed(2)}
                    </Text>
                    <Text style={styles.pricePeriod}>
                      {billingCycle === 'annual' ? '/year' : '/month'}
                    </Text>
                  </View>
                  {billingCycle === 'annual' && perMonth && (
                    <Text style={styles.priceEquivalent}>
                      ≈ ${perMonth} / month equivalent
                    </Text>
                  )}
                  <Text style={styles.priceTermLine}>
                    Auto-renewing subscription • {billingCycle === 'annual' ? '12 months' : '1 month'}
                  </Text>
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

        {/* Subscription terms — required by App Store Guideline 3.1.2(c).
            Includes title, length, price, auto-renewal disclosure, and
            functional links to Privacy Policy + Terms of Use (EULA). */}
        <View style={styles.legalCard}>
          <Text style={styles.legalHeading}>Subscription Terms</Text>
          <Text style={styles.legalBody}>
            Subscriptions auto-renew at the end of each billing period unless cancelled at least 24 hours before
            the period ends. Payment is charged to your {STORE_NAME} account on confirmation. Manage or cancel
            anytime in your {STORE_NAME} account settings — cancelling stops the next renewal but does not refund
            the current period. Unused analyses carry over per your plan.
          </Text>
          <View style={styles.legalLinksRow}>
            <TouchableOpacity
              testID="open-terms"
              onPress={() => Linking.openURL(TERMS_OF_USE_URL).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel="Terms of Use"
            >
              <Text style={styles.legalLink}>Terms of Use (EULA)</Text>
            </TouchableOpacity>
            <Text style={styles.legalSeparator}>•</Text>
            <TouchableOpacity
              testID="open-privacy"
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel="Privacy Policy"
            >
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  // Pricing — Apple Guideline 3.1.2(c): the BILLED amount must be the
  // most prominent pricing element. priceAmount is large/bold;
  // priceEquivalent (per-month math for annuals) is small/subordinate.
  priceBlock: { marginBottom: 16 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  priceAmount: { color: COLORS.textPrimary, fontSize: 36, fontWeight: '900' },
  pricePeriod: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  priceEquivalent: { color: COLORS.fogGray, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  priceTermLine: { color: COLORS.fogGray, fontSize: 11, marginTop: 6, letterSpacing: 0.3 },
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
  // Legal block (subscription terms + EULA + Privacy links)
  legalCard: {
    marginTop: 14,
    padding: 16,
    backgroundColor: 'rgba(58, 74, 82, 0.25)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(154, 164, 169, 0.18)',
  },
  legalHeading: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  legalBody: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  legalLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  legalLink: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
    paddingVertical: 4,
  },
  legalSeparator: {
    color: COLORS.fogGray,
    paddingHorizontal: 8,
    fontSize: 13,
  },
});
