// Raven Scout — Mobile-only gate.
//
// The product is a native iOS/Android hunting field app. Web support
// is explicitly out of scope — the web-preview bundle exists ONLY to
// let the Emergent preview + dev agents render screenshots. For all
// other visitors on Platform.OS === 'web' we show a blocker with
// install instructions.
//
// Dev bypass:
//   - localStorage key `raven_dev_web_bypass = "1"` skips the blocker
//   - URL param `?dev=1` sets that key and reloads bypassed
//
// This runs BEFORE any app navigation, so even a shared
// `https://…/results?huntId=…` link on web will show the blocker
// instead of attempting to hydrate a hunt record.

import React, { useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DEV_BYPASS_KEY = 'raven_dev_web_bypass';

function readBypass(): boolean {
  if (Platform.OS !== 'web') return true;
  try {
    // Honor ?dev=1 in the URL by stamping localStorage, so subsequent
    // reloads inside the preview keep bypassing without the param.
    if (typeof window !== 'undefined' && window.location) {
      const search = window.location.search || '';
      if (/(^|[?&])dev=1(&|$)/.test(search)) {
        window.localStorage.setItem(DEV_BYPASS_KEY, '1');
      }
    }
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(DEV_BYPASS_KEY) === '1';
  } catch {
    return false;
  }
}

export function useWebBlocked(): boolean {
  const [blocked, setBlocked] = useState<boolean>(() => {
    if (Platform.OS !== 'web') return false;
    return !readBypass();
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Re-check on mount in case the URL param was added after SSR.
    setBlocked(!readBypass());
  }, []);

  return blocked;
}

export function WebBlockerScreen() {
  const enableDevBypass = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(DEV_BYPASS_KEY, '1');
        window.location.reload();
      }
    } catch {}
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="phone-portrait" size={56} color="#C89B3C" />
        </View>
        <Text style={styles.title}>RAVEN SCOUT</Text>
        <Text style={styles.subtitle}>MOBILE APP</Text>
        <View style={styles.divider} />

        <Text style={styles.heading}>This app runs on your phone.</Text>
        <Text style={styles.body}>
          Raven Scout is a field-first hunting companion — GPS, camera, map
          capture, and offline analysis are tuned for iOS and Android only.
          The web build is not supported.
        </Text>

        <View style={styles.storeRow}>
          {/* Apple Guideline 2.3.10: do NOT show "Google Play" inside
              the iOS binary. The web build is mobile-agnostic, but
              if it ever ships as part of the iOS binary, only the
              App Store CTA should render. We platform-gate here so
              both builds remain compliant. */}
          {Platform.OS !== 'android' && (
            <TouchableOpacity
              testID="open-ios"
              style={styles.storeBtn}
              onPress={() => Linking.openURL('https://apps.apple.com/').catch(() => {})}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-apple" size={22} color="#0B1F2A" />
              <Text style={styles.storeText}>APP STORE</Text>
            </TouchableOpacity>
          )}
          {Platform.OS !== 'ios' && (
            <TouchableOpacity
              testID="open-android"
              style={styles.storeBtn}
              onPress={() => Linking.openURL('https://play.google.com/').catch(() => {})}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-google-playstore" size={22} color="#0B1F2A" />
              <Text style={styles.storeText}>GOOGLE PLAY</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tipCard}>
          <Ionicons name="information-circle" size={18} color="#9AA4A9" />
          <Text style={styles.tipText}>
            Already have Expo Go?  Scan the QR code from the Expo tunnel URL
            on your phone — it will open the app in Expo Go directly.
          </Text>
        </View>
      </View>

      {/* Dev-only: lets the main agent / E2E tests click past the blocker
          in the preview without needing a real install. Visually small so
          end users ignore it. */}
      <TouchableOpacity
        testID="web-dev-bypass"
        style={styles.devBypass}
        onPress={enableDevBypass}
        activeOpacity={0.7}
      >
        <Text style={styles.devBypassText}>dev bypass</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B1F2A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: 'rgba(58, 74, 82, 0.4)',
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(200, 155, 60, 0.25)',
    alignItems: 'center',
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(200, 155, 60, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(200, 155, 60, 0.3)',
  },
  title: {
    color: '#F5F5F0',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
  },
  subtitle: {
    color: '#C89B3C',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    marginTop: 4,
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: '#C89B3C',
    marginVertical: 20,
    opacity: 0.6,
    borderRadius: 1,
  },
  heading: {
    color: '#F5F5F0',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    color: '#9AA4A9',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
  },
  storeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  storeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#C89B3C',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 48,
  },
  storeText: {
    color: '#0B1F2A',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(200, 155, 60, 0.06)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(200, 155, 60, 0.15)',
  },
  tipText: {
    color: '#9AA4A9',
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  devBypass: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    opacity: 0.35,
  },
  devBypassText: {
    color: '#9AA4A9',
    fontSize: 10,
    letterSpacing: 1.2,
  },
});
