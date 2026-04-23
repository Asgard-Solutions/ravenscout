import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading, loginWithGoogle } = useAuth();
  const [authLoading, setAuthLoading] = useState(false);

  // If already logged in, redirect
  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [loading, user]);

  // Direct Google Sign-In via native SDK. Works the same in Expo Go
  // (dev client) and EAS production builds. No web redirect URLs,
  // no Emergent-managed auth proxy.
  //
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT
  // URLS, THIS BREAKS THE AUTH.
  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    try {
      const result = await loginWithGoogle();
      if (result.ok) {
        router.replace('/');
        return;
      }
      // Silent on user-cancelled
      if (result.reason === 'cancelled') return;
      if (result.reason === 'web_not_supported') {
        Alert.alert(
          'Mobile-only',
          'Raven Scout runs on iOS and Android. Please install the mobile app to sign in.',
        );
        return;
      }
      if (result.reason === 'missing_google_client_id_env') {
        Alert.alert(
          'Configuration error',
          'Google Client ID not configured. Set EXPO_PUBLIC_GOOGLE_CLIENT_ID in the build.',
        );
        return;
      }
      Alert.alert('Sign-in failed', `Could not sign in (${result.reason}). Please try again.`);
    } catch (err) {
      console.error('Auth error:', err);
      Alert.alert('Sign-in failed', 'Unexpected error — please try again.');
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
