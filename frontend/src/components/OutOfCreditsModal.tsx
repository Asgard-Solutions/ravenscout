/**
 * Raven Scout — "You're out of hunt analytics" modal.
 *
 * Surfaced whenever an analyze call returns 402 with code
 * `out_of_credits`, or whenever the user explicitly opens the
 * "Buy extra analytics" sheet from Profile.
 *
 * UX rules from the spec:
 *   - Pro upgrade is visually emphasized (gold CTA, top of sheet,
 *     value-prop subtitle).
 *   - Packs are positioned as a quick top-off (compact row of pills).
 *   - Current usage + extra-credit balance shown at the top.
 *   - Purchase success/failure is reflected via `onPackPurchase`.
 */
import React, { useState } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import type { AnalyticsPack, AnalyticsUsage } from '../api/analyticsApi';

export interface OutOfCreditsModalProps {
  visible: boolean;
  usage: AnalyticsUsage | null;
  onClose: () => void;
  onUpgradePress: () => void;
  /**
   * Fired when the user taps a pack chip. The host is responsible
   * for kicking off the StoreKit/RevenueCat purchase, calling
   * `grantExtraCreditsPurchase(packId, txnId)` on success, and
   * resolving with `success | cancelled`. Modal updates its own
   * loading/error state from the returned promise.
   */
  onPackPurchase: (pack: AnalyticsPack) => Promise<'success' | 'cancelled'>;
}

export default function OutOfCreditsModal({
  visible,
  usage,
  onClose,
  onUpgradePress,
  onPackPurchase,
}: OutOfCreditsModalProps) {
  const [busyPack, setBusyPack] = useState<string | null>(null);
  const [errPack, setErrPack] = useState<string | null>(null);
  const [okPack, setOkPack] = useState<string | null>(null);

  const isPro = (usage?.plan || '').toLowerCase() === 'pro';
  const monthlyUsed = usage?.monthlyAnalyticsUsed ?? 0;
  const monthlyLimit = usage?.monthlyAnalyticsLimit ?? 0;
  const extraBalance = usage?.extraAnalyticsCredits ?? 0;

  async function handlePackTap(pack: AnalyticsPack) {
    setBusyPack(pack.id);
    setErrPack(null);
    setOkPack(null);
    try {
      const result = await onPackPurchase(pack);
      if (result === 'success') setOkPack(pack.id);
    } catch (e: any) {
      setErrPack(e?.message || 'Purchase failed');
    } finally {
      setBusyPack(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>You’re out of hunt analytics</Text>
          <Text style={styles.subtitle}>
            You’ve used your monthly AI hunt analytics. Upgrade your plan or add
            extra credits to keep scouting.
          </Text>

          <View style={styles.usageRow}>
            <View style={styles.usageStat}>
              <Text style={styles.usageNum}>{monthlyUsed}/{monthlyLimit}</Text>
              <Text style={styles.usageLbl}>MONTHLY USED</Text>
            </View>
            <View style={styles.usageDivider} />
            <View style={styles.usageStat}>
              <Text style={styles.usageNum}>{extraBalance}</Text>
              <Text style={styles.usageLbl}>EXTRA CREDITS</Text>
            </View>
          </View>

          {!isPro && (
            <Pressable
              testID="out-of-credits-upgrade"
              accessibilityRole="button"
              onPress={() => { onUpgradePress(); onClose(); }}
              style={({ pressed }) => [styles.upgradeBtn, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.upgradeMain}>
                <Ionicons name="flash" size={18} color={COLORS.primary} />
                <Text style={styles.upgradeBtnText}>UPGRADE TO PRO</Text>
              </View>
              <Text style={styles.upgradeBtnSub}>Best value • 40 analytics / month</Text>
            </Pressable>
          )}

          <Text style={styles.orLabel}>OR ADD A QUICK TOP-OFF</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.packsRow}
          >
            {(usage?.packs || []).map((pack) => {
              const busy = busyPack === pack.id;
              const ok = okPack === pack.id;
              return (
                <Pressable
                  key={pack.id}
                  testID={`pack-${pack.id}`}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => handlePackTap(pack)}
                  style={({ pressed }) => [
                    styles.pack,
                    pressed && { opacity: 0.85 },
                    ok && styles.packDone,
                  ]}
                >
                  <Text style={styles.packCredits}>+{pack.credits}</Text>
                  <Text style={styles.packLabel}>analytics</Text>
                  <View style={styles.packPriceRow}>
                    {busy ? (
                      <ActivityIndicator size="small" color={COLORS.accent} />
                    ) : ok ? (
                      <View style={styles.packDoneRow}>
                        <Ionicons name="checkmark-circle" size={14} color={COLORS.accent} />
                        <Text style={styles.packPrice}>ADDED</Text>
                      </View>
                    ) : (
                      <Text style={styles.packPrice}>${pack.price_usd.toFixed(2)}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {errPack && (
            <Text style={styles.errText}>Couldn’t complete purchase: {errPack}</Text>
          )}

          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>NOT NOW</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 22, paddingTop: 10, paddingBottom: 26,
    borderTopWidth: 1, borderTopColor: 'rgba(200, 155, 60, 0.45)',
  },
  handle: {
    alignSelf: 'center', width: 42, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(154, 164, 169, 0.45)', marginBottom: 14,
  },
  title: { color: '#F5EFD9', fontSize: 19, fontWeight: '900', letterSpacing: 0.2 },
  subtitle: {
    color: COLORS.fogGray, fontSize: 13, marginTop: 6, marginBottom: 14, lineHeight: 18,
  },
  usageRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(200, 155, 60, 0.08)',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.25)',
  },
  usageStat: { flex: 1, alignItems: 'center' },
  usageNum: { color: COLORS.accent, fontSize: 18, fontWeight: '900' },
  usageLbl: { color: COLORS.fogGray, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  usageDivider: { width: 1, height: 26, backgroundColor: 'rgba(154, 164, 169, 0.3)' },
  upgradeBtn: {
    backgroundColor: COLORS.accent, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16, marginBottom: 18,
    shadowColor: COLORS.accent, shadowOpacity: 0.55, shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  upgradeMain: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  upgradeBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: '900', letterSpacing: 0.6 },
  upgradeBtnSub: { color: COLORS.primary, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 2, opacity: 0.85 },
  orLabel: {
    color: COLORS.fogGray, fontSize: 10, fontWeight: '800', letterSpacing: 1,
    textAlign: 'center', marginBottom: 10,
  },
  packsRow: { gap: 10, paddingRight: 8 },
  pack: {
    width: 110,
    backgroundColor: 'rgba(11, 31, 42, 0.9)',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.4)',
    alignItems: 'center',
  },
  packDone: { borderColor: COLORS.accent },
  packCredits: { color: '#F5EFD9', fontSize: 22, fontWeight: '900' },
  packLabel: { color: COLORS.fogGray, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  packPriceRow: { minHeight: 22, alignItems: 'center', justifyContent: 'center' },
  packPrice: { color: COLORS.accent, fontSize: 13, fontWeight: '900' },
  packDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  errText: { color: '#E27272', fontSize: 12, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  closeBtn: { alignSelf: 'center', marginTop: 16, paddingVertical: 8, paddingHorizontal: 16 },
  closeBtnText: { color: COLORS.fogGray, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
});
