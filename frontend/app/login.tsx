import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Platform, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, BACKEND_URL } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [authLoading, setAuthLoading] = useState(false);
  const params = useLocalSearchParams();

  // If already logged in, redirect
  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [loading, user]);

  // Handle session_id from redirect (web)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      if (hash.includes('session_id=')) {
        const sessionId = hash.split('session_id=')[1]?.split('&')[0];
        if (sessionId) {
          handleSessionExchange(sessionId);
          // Clean hash
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      }
    }
  }, []);

  const handleSessionExchange = async (sessionId: string) => {
    setAuthLoading(true);
    const success = await login(sessionId);
    setAuthLoading(false);
    if (success) {
      router.replace('/');
    }
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    try {
      if (Platform.OS === 'web') {
        // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
        const redirectUrl = (typeof window !== 'undefined' ? window.location.origin : '') + '/login';
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
        return;
      }

      // Mobile: Use WebBrowser
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
      const redirectUrl = `${BACKEND_URL}/login`;
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

      if (result.type === 'success' && result.url) {
        const url = result.url;
        const hashPart = url.split('#')[1] || '';
        const sessionId = new URLSearchParams(hashPart).get('session_id');
        if (sessionId) {
          await handleSessionExchange(sessionId);
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Brand */}
        <View style={styles.brandSection}>
          <Ionicons name="navigate" size={56} color={COLORS.accent} />
          <Text style={styles.brandName}>RAVEN SCOUT</Text>
          <Text style={styles.tagline}>A smarter way to plan your hunt.</Text>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <FeatureRow icon="map" text="AI-powered map analysis" />
          <FeatureRow icon="layers" text="Tactical overlay recommendations" />
          <FeatureRow icon="paw" text="Species-specific strategies" />
          <FeatureRow icon="partly-sunny" text="Real-time weather integration" />
        </View>

        {/* Login Button */}
        <View style={styles.authSection}>
          <TouchableOpacity
            testID="google-login-button"
            style={styles.googleButton}
            onPress={handleGoogleLogin}
            disabled={authLoading}
            activeOpacity={0.8}
          >
            {authLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <>
                <Ionicons name="logo-google" size={22} color={COLORS.primary} />
                <Text style={styles.googleButtonText}>SIGN IN WITH GOOGLE</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.authNote}>
            Free to start · 3 AI analyses included
          </Text>
        </View>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureRow}>
      <Ionicons name={icon as any} size={18} color={COLORS.accent} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, padding: 32, justifyContent: 'center' },
  brandSection: { alignItems: 'center', marginBottom: 48 },
  brandName: { color: COLORS.textPrimary, fontSize: 32, fontWeight: '900', letterSpacing: 4, marginTop: 16 },
  tagline: { color: COLORS.fogGray, fontSize: 15, marginTop: 8, letterSpacing: 0.5 },
  featuresSection: { marginBottom: 48, gap: 16 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '500' },
  authSection: { alignItems: 'center', gap: 16 },
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 18,
    paddingHorizontal: 32, minHeight: 60, width: '100%',
  },
  googleButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: '800', letterSpacing: 1.5 },
  authNote: { color: COLORS.fogGray, fontSize: 13 },
  disclaimer: { color: COLORS.fogGray, fontSize: 10, textAlign: 'center', marginTop: 32, opacity: 0.6, lineHeight: 16 },
});
