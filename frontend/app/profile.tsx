import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Image, Switch,
  ScrollView, ActivityIndicator, Modal, Linking, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Updates from 'expo-updates';
import { COLORS } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
} from '../src/utils/biometric';
import {
  getStorageStats,
  getCleanupInterval,
  setCleanupInterval,
  cleanupOlderThan,
  clearAllLocalImages,
  CLEANUP_INTERVAL_OPTIONS,
  DEFAULT_CLEANUP_INTERVAL,
  formatBytes,
  formatShortDate,
  type CleanupInterval,
  type StorageStats,
} from '../src/media/storageStats';
import { useScrollToTopOnFocus } from '../src/hooks/useScrollToTopOnFocus';
import { useAnalyticsUsage } from '../src/hooks/useAnalyticsUsage';
import { grantExtraCreditsPurchase } from '../src/api/analyticsApi';
import OutOfCreditsModal from '../src/components/OutOfCreditsModal';
import {
  isPurchasesAvailable,
  purchaseProduct as rcPurchaseProduct,
  restorePurchases as rcRestorePurchases,
  entitlementsPayload,
  tierFromCustomerInfo,
} from '../src/lib/purchases';

// ---------------------------------------------------------------------
// Config — tweak these if legal/marketing URLs change.
// ---------------------------------------------------------------------
const PRIVACY_POLICY_URL = 'https://asgardsolution.io/privacy';
const TERMS_OF_SERVICE_URL = 'https://asgardsolution.io/terms';
const DATA_DELETION_MAILTO =
  'mailto:privacy@asgardsolution.io?subject=Raven%20Scout%20data%20deletion%20request&body=Please%20delete%20all%20data%20associated%20with%20this%20account.%20';

const TIER_COPY: Record<string, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
  trial: {
    title: 'Trial Active',
    subtitle: 'Basic features • 3 lifetime analyses',
    icon: 'leaf-outline',
  },
  core: {
    title: 'Core Active',
    subtitle: 'Local device storage • Standard features',
    icon: 'shield-half',
  },
  pro: {
    title: 'Pro Active',
    subtitle: 'Cloud sync • Priority analysis • Premium features',
    icon: 'diamond',
  },
};

// ---------------------------------------------------------------------

export default function ProfileScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTopOnFocus(scrollRef);

  const {
    user, sessionToken, updateProfile, changePassword, setPassword,
    deleteAccount, logout, refreshUser,
  } = useAuth();

  // ---- state ----
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Biometric
  const [bioAvail, setBioAvail] = useState<{ available: boolean; type: string }>({ available: false, type: 'none' });
  const [bioOn, setBioOn] = useState(false);

  // Storage
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [interval, setInterval] = useState<CleanupInterval>(DEFAULT_CLEANUP_INTERVAL);
  const [intervalPickerOpen, setIntervalPickerOpen] = useState(false);

  // Edit name
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name || '');

  // Change password modal
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // About modal
  const [aboutOpen, setAboutOpen] = useState(false);

  // Analytics usage + extra-credits modal
  const { usage, refresh: refreshUsage } = useAnalyticsUsage(true);
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);

  // Pack purchase handler. On native builds (Expo dev-client / EAS
  // preview / EAS production) this drives a real StoreKit / Play
  // Billing purchase via RevenueCat and forwards the platform-issued
  // transaction id to the backend as the idempotency key. On Expo
  // Go / web (no native module) it falls back to a synthetic
  // transaction id so the rest of the UX can still be exercised
  // — the server enforces idempotency on (source='in_app', txn_id)
  // either way so replays are safe.
  const handlePackPurchase = useCallback(async (pack: { id: string; credits: number }) => {
    // Native build → real RC purchase.
    if (isPurchasesAvailable()) {
      const result = await rcPurchaseProduct(pack.id);

      if (result.status === 'cancelled') {
        return 'cancelled' as const;
      }
      if (result.status === 'error') {
        // Surface to the modal so the caller can render an inline error.
        throw new Error(result.message || 'Purchase failed');
      }
      if (result.status === 'success' && result.transactionId) {
        try {
          await grantExtraCreditsPurchase(pack.id, result.transactionId);
          await refreshUsage();
          return 'success' as const;
        } catch (e: any) {
          throw new Error(e?.message || 'Could not credit purchase');
        }
      }
      // status === 'unavailable' falls through to preview path.
    }

    // Preview path (Expo Go / web): synthesise a deterministic-enough
    // transaction id. Server still de-duplicates on it.
    const txnId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await grantExtraCreditsPurchase(pack.id, txnId);
      await refreshUsage();
      return 'success' as const;
    } catch {
      return 'cancelled' as const;
    }
  }, [refreshUsage]);

  // ---- effects ----
  useEffect(() => { setNameDraft(user?.name || ''); }, [user?.name]);

  const loadAll = useCallback(async () => {
    const [info, enabled, s, iv] = await Promise.all([
      isBiometricAvailable(),
      isBiometricEnabled(),
      getStorageStats(),
      getCleanupInterval(),
    ]);
    setBioAvail({ available: info.available, type: info.type });
    setBioOn(info.available && enabled);
    setStats(s);
    setInterval(iv);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([refreshUser(), loadAll()]); } finally { setRefreshing(false); }
  };

  // ---- actions ----
  const saveName = async () => {
    const next = nameDraft.trim();
    if (!next || next === user?.name) { setEditOpen(false); return; }
    setBusy(true);
    const r = await updateProfile({ name: next });
    setBusy(false);
    if (!r.ok) { Alert.alert('Could not update', (r as any).reason); return; }
    setEditOpen(false);
  };

  const toggleBio = async (next: boolean) => {
    if (next && sessionToken) {
      const ok = await enableBiometric(sessionToken);
      if (!ok) { Alert.alert('Could not enable', 'Biometric enrollment was cancelled or failed.'); return; }
      setBioOn(true);
    } else {
      await disableBiometric();
      setBioOn(false);
    }
  };

  const pickInterval = async (days: CleanupInterval) => {
    setIntervalPickerOpen(false);
    setInterval(days);
    await setCleanupInterval(days);
  };

  const onCleanupOld = () => {
    Alert.alert(
      `Clean up images older than ${interval} days?`,
      'This permanently deletes old map images from this device. Your scan history and analysis results are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clean Up',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const n = await cleanupOlderThan(interval);
            setBusy(false);
            await loadAll();
            Alert.alert('Cleanup complete', n === 0 ? 'No images were older than the interval.' : `Removed ${n} image${n === 1 ? '' : 's'}.`);
          },
        },
      ],
    );
  };

  const onClearAll = () => {
    Alert.alert(
      'Clear ALL local images?',
      'This permanently deletes every map image stored on this device. Your scan history and analysis results are not affected, but thumbnails will disappear.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const n = await clearAllLocalImages();
            setBusy(false);
            await loadAll();
            Alert.alert('All local images cleared', `Removed ${n} file${n === 1 ? '' : 's'} from this device.`);
          },
        },
      ],
    );
  };

  const doChangePw = async () => {
    // Branch: Google-only users call setPassword (no current_password);
    // everyone else calls changePassword.
    const hasPw = !!user?.has_password;
    if ((hasPw && (!curPw || !newPw)) || (!hasPw && !newPw)) return;
    if (newPw !== confirmPw) { Alert.alert('Passwords do not match'); return; }
    setBusy(true);
    const r = hasPw
      ? await changePassword(curPw, newPw)
      : await setPassword(newPw);
    setBusy(false);
    if (!r.ok) {
      Alert.alert(hasPw ? 'Could not change password' : 'Could not set password', (r as any).reason);
      return;
    }
    setCurPw(''); setNewPw(''); setConfirmPw('');
    setPwModalOpen(false);
    Alert.alert(
      hasPw ? 'Password updated' : 'Password created',
      hasPw ? 'Other devices have been signed out.' : 'You can now sign in with either Google or your new email/password.',
    );
  };

  const openUrl = async (url: string) => {
    try {
      if (url.startsWith('mailto:')) { await Linking.openURL(url); return; }
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert('Could not open link', url);
    }
  };

  const onRestore = async () => {
    // Branch A: native build → drive a real Purchases.restorePurchases()
    // and sync the resulting entitlements with the backend so the user
    // sees their tier flip immediately.
    if (isPurchasesAvailable()) {
      setBusy(true);
      try {
        const result = await rcRestorePurchases();
        if (result.status === 'unavailable') {
          // Fall through to preview-mode message below.
        } else if (result.status === 'error') {
          Alert.alert('Could not restore purchases', result.message || 'Try again later.');
          return;
        } else if (result.status === 'success') {
          const ents = entitlementsPayload(result.customerInfo);
          const restoredTier = tierFromCustomerInfo(result.customerInfo);
          // Forward to backend regardless — even an empty entitlements
          // map signals "no active subs found" so the server can clear
          // a stale tier flag.
          try {
            await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/subscription/sync-revenuecat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${sessionToken}`,
              },
              body: JSON.stringify({
                revenuecat_user_id: user?.user_id,
                entitlements: ents,
              }),
            });
          } catch { /* offline — backend will catch up via webhook */ }
          await refreshUser();
          await refreshUsage();
          if (restoredTier) {
            Alert.alert(
              'Purchases restored',
              `Welcome back — your ${restoredTier.toUpperCase()} subscription is now active on this device.`,
            );
          } else {
            Alert.alert(
              'No active subscriptions',
              'We didn’t find any active Raven Scout subscriptions linked to this Apple ID / Google account.',
            );
          }
          return;
        }
      } finally {
        setBusy(false);
      }
    }

    // Branch B: preview / web — best-effort tier resync from the backend.
    Alert.alert(
      'Restore Purchases',
      'Checking the store for active Raven Scout subscriptions linked to your Apple ID or Google account…',
      [{ text: 'OK' }],
    );
    try { await refreshUser(); } catch { /* noop */ }
  };

  const onCheckUpdates = async () => {
    if (__DEV__ || Platform.OS === 'web') {
      Alert.alert('Updates', 'OTA updates are only available in production builds.');
      return;
    }
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        await Updates.fetchUpdateAsync();
        Alert.alert('Update ready', 'Restart Raven Scout to apply the latest update.', [
          { text: 'Later', style: 'cancel' },
          { text: 'Restart', onPress: () => Updates.reloadAsync() },
        ]);
      } else {
        Alert.alert('Up to date', 'You are running the latest version.');
      }
    } catch (err: any) {
      Alert.alert('Could not check for updates', err?.message || 'Try again later.');
    }
  };

  const onSignOut = async () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        await logout();
        router.replace('/login');
      } },
    ]);
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your hunts, history, and subscription link. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Are you absolutely sure?',
            'Type nothing — just confirm. Your data will be removed from our servers immediately.',
            [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Yes, delete', style: 'destructive', onPress: async () => {
                const r = await deleteAccount();
                if (!r.ok) { Alert.alert('Could not delete', (r as any).reason); return; }
                router.replace('/login');
              } },
            ],
          ),
        },
      ],
    );
  };

  // ---- derived ----
  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.center}><ActivityIndicator color={COLORS.accent} /></View>
      </SafeAreaView>
    );
  }
  const tier = (user.tier || 'trial').toLowerCase();
  const tierCopy = TIER_COPY[tier] || TIER_COPY.trial;
  const usernameSuggestion = (user.email || '').split('@')[0] || user.name;
  const bioLabel = bioAvail.type === 'face' ? 'Fingerprint Login' : bioAvail.type === 'fingerprint' ? 'Fingerprint Login' : 'Biometric Login';
  const bioIcon: keyof typeof Ionicons.glyphMap = bioAvail.type === 'face' ? 'happy-outline' : 'finger-print';
  const version = Constants.expoConfig?.version || '1.0.0';
  const buildNumber = (Constants as any).nativeBuildVersion || Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber || '—';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerSide} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={COLORS.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={() => setEditOpen(true)} style={[styles.headerSide, styles.editBtn]} activeOpacity={0.7} accessibilityLabel="Edit profile">
          <Ionicons name="create-outline" size={20} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        {/* Identity row */}
        <View style={styles.identityRow}>
          <View style={styles.avatarContainer}>
            {user.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {(user.name || user.email || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.identityInfo}>
            <Text style={styles.displayName} numberOfLines={1}>{user.name || 'Unnamed Hunter'}</Text>
            <Text style={styles.username} numberOfLines={1}>{usernameSuggestion}</Text>
            <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
          </View>
          <View style={styles.tierPill}>
            <Text style={styles.tierPillText}>{tier.toUpperCase()}</Text>
          </View>
        </View>

        {/* Subscription status card */}
        <View style={styles.subscriptionCard}>
          <View style={styles.subscriptionIcon}>
            <Ionicons name={tierCopy.icon} size={28} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.subscriptionTitle}>{tierCopy.title}</Text>
            <Text style={styles.subscriptionSubtitle}>{tierCopy.subtitle}</Text>
          </View>
        </View>

        {/* Analytics usage card — backend is source of truth. Surfaces
            monthly used / remaining, extra-credit balance, and a
            top-off CTA that opens the OutOfCreditsModal. */}
        {usage && (
          <View style={styles.analyticsCard} testID="analytics-usage-card">
            <View style={styles.analyticsHeader}>
              <Ionicons name="analytics-outline" size={18} color={COLORS.accent} />
              <Text style={styles.analyticsHeaderText}>HUNT ANALYTICS</Text>
            </View>
            <View style={styles.analyticsRow}>
              <Text style={styles.analyticsLine}>
                Monthly analytics:{' '}
                <Text style={styles.analyticsStrong}>
                  {usage.monthlyAnalyticsUsed} of {usage.monthlyAnalyticsLimit} used
                </Text>
              </Text>
              <Text style={styles.analyticsLine}>
                Extra credits:{' '}
                <Text style={styles.analyticsStrong}>
                  {usage.extraAnalyticsCredits} available
                </Text>
              </Text>
              {usage.resetDate && (
                <Text style={styles.analyticsHint}>
                  Monthly limit resets on {formatShortDate(usage.resetDate)}
                </Text>
              )}
            </View>
            <TouchableOpacity
              testID="buy-extra-analytics-btn"
              style={styles.buyExtraBtn}
              onPress={() => setCreditsModalOpen(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle" size={16} color={COLORS.primary} />
              <Text style={styles.buyExtraBtnText}>BUY EXTRA ANALYTICS</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Local Storage */}
        <Text style={styles.sectionLabel}>LOCAL STORAGE</Text>
        <View style={styles.card}>
          <View style={styles.storageHeader}>
            <Ionicons name="albums-outline" size={20} color={COLORS.accent} />
            <Text style={styles.storageTitle}>Local Storage</Text>
          </View>

          {!stats ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 12 }} />
          ) : (
            <>
              <Text style={styles.statLine}>{stats.imageCount} image{stats.imageCount === 1 ? '' : 's'} stored</Text>
              <Text style={styles.statLine}>{formatBytes(stats.bytesUsed)} used</Text>
              <Text style={styles.statLine}>Oldest: {formatShortDate(stats.oldestCreatedAt)}</Text>

              {/* Cleanup interval picker */}
              <TouchableOpacity style={styles.rowItem} onPress={() => setIntervalPickerOpen(true)} activeOpacity={0.7}>
                <Ionicons name="time-outline" size={18} color={COLORS.textSecondary} />
                <Text style={styles.rowItemLabel}>Cleanup Interval</Text>
                <Text style={styles.rowItemValue}>{interval} days</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>

              {/* Clean up old */}
              <TouchableOpacity style={styles.cleanupRow} onPress={onCleanupOld} disabled={busy || stats.imageCount === 0} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={18} color={COLORS.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cleanupText, stats.imageCount === 0 && { opacity: 0.4 }]}>
                    Clean Up Old Images ({interval}+ days)
                  </Text>
                  {stats.nextScheduledCleanupAt && (
                    <Text style={styles.cleanupHint}>Next cleanup: {formatShortDate(stats.nextScheduledCleanupAt)}</Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* Clear all */}
              <TouchableOpacity style={styles.destructiveBtn} onPress={onClearAll} disabled={busy || stats.imageCount === 0} activeOpacity={0.85}>
                <Ionicons name="trash" size={18} color={COLORS.error} />
                <Text style={styles.destructiveText}>Clear All Local Images</Text>
              </TouchableOpacity>

              <Text style={styles.helpText}>
                Images are stored only on your device. Deleting them does not affect your scan history or saved analysis results.
              </Text>
            </>
          )}
        </View>

        {/* Manage Subscription + About */}
        <View style={styles.groupedList}>
          <TouchableOpacity style={styles.listRow} onPress={() => router.push('/subscription')} activeOpacity={0.7}>
            <View style={styles.listIconCircle}><Ionicons name="card-outline" size={18} color={COLORS.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listRowTitle}>Manage Subscription</Text>
              <Text style={styles.listRowSubtitle}>Billing, payment &amp; cancel</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={styles.listDivider} />
          <TouchableOpacity style={styles.listRow} onPress={() => setAboutOpen(true)} activeOpacity={0.7}>
            <View style={styles.listIconCircle}><Ionicons name="information-circle-outline" size={18} color={COLORS.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listRowTitle}>About Raven Scout</Text>
              <Text style={styles.listRowSubtitle}>App information</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          {user.tier !== 'trial' && (
            <>
              <View style={styles.listDivider} />
              <TouchableOpacity style={styles.listRow} onPress={() => setPwModalOpen(true)} activeOpacity={0.7}>
                <View style={styles.listIconCircle}><Ionicons name="key-outline" size={18} color={COLORS.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowTitle}>{user.has_password ? 'Change Password' : 'Set Password'}</Text>
                  <Text style={styles.listRowSubtitle}>
                    {user.has_password
                      ? 'Update your sign-in password'
                      : 'Add a password so you can sign in without Google'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <View style={styles.listDivider} />
              <TouchableOpacity
                style={styles.listRow}
                onPress={() => router.push({ pathname: '/forgot-password', params: { email: user.email } })}
                activeOpacity={0.7}
              >
                <View style={styles.listIconCircle}><Ionicons name="mail-unread-outline" size={18} color={COLORS.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowTitle}>Forgot / Reset Password</Text>
                  <Text style={styles.listRowSubtitle}>Email a verification code to reset via OTP</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Security */}
        {bioAvail.available && (
          <>
            <Text style={styles.sectionLabel}>SECURITY</Text>
            <View style={styles.securityRow}>
              <View style={styles.securityIconCircle}>
                <Ionicons name={bioIcon} size={22} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listRowTitle}>{bioLabel}</Text>
                <Text style={styles.listRowSubtitle}>{bioOn ? 'Enabled — tap to disable' : 'Disabled — tap to enable'}</Text>
              </View>
              <Switch value={bioOn} onValueChange={toggleBio} trackColor={{ false: '#3A4A52', true: COLORS.accent }} thumbColor={COLORS.white} />
            </View>
          </>
        )}

        {/* Privacy & Legal */}
        <Text style={styles.sectionLabel}>PRIVACY &amp; LEGAL</Text>
        <View style={styles.groupedList}>
          <TouchableOpacity style={styles.listRow} onPress={() => openUrl(PRIVACY_POLICY_URL)} activeOpacity={0.7}>
            <View style={styles.listIconCircle}><Ionicons name="document-text-outline" size={18} color={COLORS.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listRowTitle}>Privacy Policy</Text>
              <Text style={styles.listRowSubtitle}>How we protect your data</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={styles.listDivider} />
          <TouchableOpacity style={styles.listRow} onPress={() => openUrl(TERMS_OF_SERVICE_URL)} activeOpacity={0.7}>
            <View style={styles.listIconCircle}><Ionicons name="reader-outline" size={18} color={COLORS.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listRowTitle}>Terms of Service</Text>
              <Text style={styles.listRowSubtitle}>Usage terms and conditions</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={styles.listDivider} />
          <TouchableOpacity style={styles.listRow} onPress={() => openUrl(DATA_DELETION_MAILTO)} activeOpacity={0.7}>
            <View style={[styles.listIconCircle, { backgroundColor: 'rgba(200,155,60,0.9)' }]}>
              <Ionicons name="trash-outline" size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listRowTitle}>Request Data Deletion</Text>
              <Text style={styles.listRowSubtitle}>Delete your data from our servers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Account Actions */}
        <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut} activeOpacity={0.85}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreBtn} onPress={onRestore} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color={COLORS.accent} />
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteAccountBtn} onPress={onDeleteAccount} activeOpacity={0.85}>
          <Ionicons name="trash-outline" size={18} color={COLORS.error} />
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </TouchableOpacity>

        {/* App Version */}
        <View style={styles.versionCard}>
          <View style={styles.versionHeader}>
            <Ionicons name="phone-portrait-outline" size={18} color={COLORS.textSecondary} />
            <Text style={styles.versionHeaderText}>App Version</Text>
          </View>
          <View style={styles.versionRow}>
            <Text style={styles.versionMain}>v{version}</Text>
            <Text style={styles.versionBuild}>Build {buildNumber}</Text>
          </View>
          <TouchableOpacity style={styles.updatesBtn} onPress={onCheckUpdates} activeOpacity={0.85}>
            <Ionicons name="cloud-download-outline" size={18} color={COLORS.accent} />
            <Text style={styles.updatesText}>Check for Updates</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Ionicons name="shield-outline" size={16} color={COLORS.textSecondary} style={{ opacity: 0.7 }} />
          <Text style={styles.footerTagline}>Forged in Asgard, Scouted in the Field</Text>
          <Text style={styles.footerCopy}>© 2026 Asgard Solutions LLC</Text>
        </View>
      </ScrollView>

      {/* Edit Name Modal */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Text style={styles.modalSubtitle}>Update your display name. Email cannot be changed.</Text>
            <TextInput
              style={styles.modalInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Display name"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="words"
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setEditOpen(false); setNameDraft(user.name || ''); }} activeOpacity={0.85}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveName} disabled={busy} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cleanup Interval Picker */}
      <Modal visible={intervalPickerOpen} transparent animationType="fade" onRequestClose={() => setIntervalPickerOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIntervalPickerOpen(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Cleanup Interval</Text>
            <Text style={styles.modalSubtitle}>How old must an image be to qualify for cleanup?</Text>
            {CLEANUP_INTERVAL_OPTIONS.map(days => (
              <TouchableOpacity key={days} style={styles.pickerRow} onPress={() => pickInterval(days)} activeOpacity={0.7}>
                <Text style={styles.pickerRowText}>{days} days</Text>
                {interval === days && <Ionicons name="checkmark" size={20} color={COLORS.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Change / Set Password Modal */}
      <Modal visible={pwModalOpen} transparent animationType="slide" onRequestClose={() => setPwModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{user.has_password ? 'Change Password' : 'Set Password'}</Text>
            <Text style={styles.modalSubtitle}>
              {user.has_password
                ? 'Other devices will be signed out for safety.'
                : 'Add a password to this account. Google sign-in still works — this just adds a second way in.'}
            </Text>
            {user.has_password && (
              <TextInput style={styles.modalInput} placeholder="Current password" placeholderTextColor={COLORS.textSecondary} value={curPw} onChangeText={setCurPw} secureTextEntry />
            )}
            <TextInput style={styles.modalInput} placeholder="New password" placeholderTextColor={COLORS.textSecondary} value={newPw} onChangeText={setNewPw} secureTextEntry />
            <TextInput style={styles.modalInput} placeholder="Confirm new password" placeholderTextColor={COLORS.textSecondary} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry />
            <Text style={styles.helpText}>10+ chars · upper · lower · number · symbol</Text>
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setPwModalOpen(false); setCurPw(''); setNewPw(''); setConfirmPw(''); }} activeOpacity={0.85}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={doChangePw}
                disabled={busy || !newPw || (user.has_password && !curPw)}
                activeOpacity={0.85}
              >
                {busy ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.modalSaveText}>{user.has_password ? 'Update' : 'Save'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* About Modal */}
      <Modal visible={aboutOpen} transparent animationType="fade" onRequestClose={() => setAboutOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>About Raven Scout</Text>
            <Text style={styles.aboutBody}>
              Raven Scout is a tactical hunt-planning assistant. Upload your map, dial in weather and conditions, and get AI-assisted stand, corridor, and access-route overlays in seconds.{'\n\n'}
              Raven Scout is a decision-support tool only. You remain responsible for verifying land ownership, regulations, and safety.
            </Text>
            <Text style={styles.aboutMeta}>v{version} · Build {buildNumber}</Text>
            <Text style={styles.aboutMeta}>© 2026 Asgard Solutions LLC</Text>
            <TouchableOpacity style={styles.modalSave} onPress={() => setAboutOpen(false)} activeOpacity={0.85}>
              <Text style={styles.modalSaveText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Out-of-credits / extra-pack purchase modal */}
      <OutOfCreditsModal
        visible={creditsModalOpen}
        usage={usage}
        onClose={() => setCreditsModalOpen(false)}
        onUpgradePress={() => router.push('/subscription')}
        onPackPurchase={handlePackPurchase}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 60 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1,
    borderBottomColor: 'rgba(154,164,169,0.08)',
  },
  headerSide: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  editBtn: {
    borderRadius: 22, borderWidth: 1, borderColor: COLORS.accent,
    width: 40, height: 40,
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '800', letterSpacing: 1 },

  // Identity
  identityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginTop: 8, marginBottom: 18,
  },
  avatarContainer: { width: 72, height: 72 },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.accent,
    backgroundColor: 'rgba(200,155,60,0.1)',
  },
  avatarInitial: { color: COLORS.accent, fontSize: 30, fontWeight: '900' },
  identityInfo: { flex: 1 },
  displayName: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '800' },
  username: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  email: { color: COLORS.textSecondary, fontSize: 13, marginTop: 1, opacity: 0.85 },
  tierPill: {
    borderWidth: 1, borderColor: COLORS.accent, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(200,155,60,0.08)',
  },
  tierPillText: { color: COLORS.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },

  // Subscription card
  subscriptionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, padding: 16, marginBottom: 22,
    borderWidth: 1, borderColor: COLORS.accent,
    backgroundColor: 'rgba(200,155,60,0.06)',
  },
  subscriptionIcon: {
    width: 54, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(200,155,60,0.15)', borderWidth: 1, borderColor: 'rgba(200,155,60,0.35)',
  },
  subscriptionTitle: { color: COLORS.accent, fontSize: 18, fontWeight: '800' },
  subscriptionSubtitle: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  // Analytics usage card
  analyticsCard: {
    backgroundColor: 'rgba(11, 31, 42, 0.6)', borderRadius: 12,
    padding: 16, marginBottom: 18,
    borderWidth: 1, borderColor: 'rgba(200, 155, 60, 0.25)',
  },
  analyticsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  analyticsHeaderText: {
    color: COLORS.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1,
  },
  analyticsRow: { gap: 4, marginBottom: 12 },
  analyticsLine: { color: COLORS.textPrimary, fontSize: 13 },
  analyticsStrong: { color: COLORS.accent, fontWeight: '800' },
  analyticsHint: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
  buyExtraBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: COLORS.accent,
    borderRadius: 10, paddingVertical: 10,
  },
  buyExtraBtnText: {
    color: COLORS.primary, fontSize: 12, fontWeight: '900', letterSpacing: 0.6,
  },

  sectionLabel: {
    color: COLORS.textSecondary, fontSize: 11, fontWeight: '800',
    letterSpacing: 2, marginTop: 18, marginBottom: 10,
  },

  // Generic card
  card: {
    backgroundColor: 'rgba(58,74,82,0.35)', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(154,164,169,0.15)',
  },

  // Storage
  storageHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  storageTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  statLine: { color: COLORS.textPrimary, fontSize: 15, marginTop: 2 },
  rowItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, marginTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(154,164,169,0.1)',
  },
  rowItemLabel: { flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  rowItemValue: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  cleanupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(154,164,169,0.1)',
  },
  cleanupText: { color: COLORS.accent, fontSize: 15, fontWeight: '700' },
  cleanupHint: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  destructiveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, borderRadius: 10, marginTop: 12,
    borderWidth: 1, borderColor: COLORS.error,
    backgroundColor: 'rgba(198,40,40,0.08)',
  },
  destructiveText: { color: COLORS.error, fontSize: 15, fontWeight: '700' },
  helpText: {
    color: COLORS.textSecondary, fontSize: 12, lineHeight: 17,
    textAlign: 'center', marginTop: 12, opacity: 0.85,
  },

  // Grouped list (Manage Subscription / About / Privacy)
  groupedList: {
    backgroundColor: 'rgba(58,74,82,0.35)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(154,164,169,0.15)', overflow: 'hidden',
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  listIconCircle: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(200,155,60,0.3)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  listRowTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  listRowSubtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  listDivider: { height: 1, backgroundColor: 'rgba(154,164,169,0.1)', marginHorizontal: 16 },

  // Security
  securityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    backgroundColor: 'rgba(58,74,82,0.35)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(154,164,169,0.15)',
  },
  securityIconCircle: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(200,155,60,0.35)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },

  // Buttons (bottom actions)
  signOutBtn: {
    alignItems: 'center', paddingVertical: 16, marginTop: 22,
    borderRadius: 10, backgroundColor: 'rgba(58,74,82,0.6)',
    borderWidth: 1, borderColor: 'rgba(154,164,169,0.2)',
  },
  signOutText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  restoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 16, marginTop: 12,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.accent,
    backgroundColor: 'rgba(200,155,60,0.06)',
  },
  restoreText: { color: COLORS.accent, fontSize: 15, fontWeight: '700' },
  deleteAccountBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 16, marginTop: 12,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.error,
    backgroundColor: 'rgba(198,40,40,0.06)',
  },
  deleteAccountText: { color: COLORS.error, fontSize: 15, fontWeight: '700' },

  // Version
  versionCard: {
    marginTop: 26, padding: 16, borderRadius: 14,
    backgroundColor: 'rgba(58,74,82,0.35)',
    borderWidth: 1, borderColor: 'rgba(154,164,169,0.15)',
  },
  versionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  versionHeaderText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  versionRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8, marginBottom: 14 },
  versionMain: { color: COLORS.textPrimary, fontSize: 26, fontWeight: '900' },
  versionBuild: { color: COLORS.textSecondary, fontSize: 13 },
  updatesBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.accent,
    backgroundColor: 'rgba(200,155,60,0.05)',
  },
  updatesText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },

  // Footer
  footer: { alignItems: 'center', marginTop: 20, gap: 6 },
  footerTagline: { color: COLORS.textSecondary, fontStyle: 'italic', fontSize: 12 },
  footerCopy: { color: COLORS.textSecondary, fontSize: 11, opacity: 0.75 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', maxWidth: 400,
    backgroundColor: COLORS.primary, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: COLORS.accent,
  },
  modalTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  modalSubtitle: { color: COLORS.textSecondary, fontSize: 13, marginTop: 6, marginBottom: 14 },
  modalInput: {
    borderWidth: 1, borderColor: 'rgba(200,155,60,0.3)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, color: COLORS.textPrimary,
    marginBottom: 10, fontSize: 15,
  },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(154,164,169,0.3)', alignItems: 'center',
  },
  modalCancelText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  modalSave: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: COLORS.accent, alignItems: 'center', marginTop: 6,
  },
  modalSaveText: { color: COLORS.primary, fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },

  // Picker
  pickerCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: COLORS.primary, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.accent,
  },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(154,164,169,0.12)',
  },
  pickerRowText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '600' },

  // About
  aboutBody: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  aboutMeta: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 3 },
});
