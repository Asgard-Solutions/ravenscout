import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';
import { RavenSpinner } from '../src/components/RavenSpinner';
import { isBiometricAvailable, isBiometricEnabled, enableBiometric, authenticateWithBiometric } from '../src/utils/biometric';

// Sign-in screen: email+password, Google OAuth, and biometric unlock.
// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT
// URLS, THIS BREAKS THE AUTH.
export default function LoginScreen() {
  const router = useRouter();
  const { user, loading, loginWithGoogle, loginWithPassword, sessionToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);

  useEffect(() => { if (!loading && user) router.replace('/'); }, [loading, user]);

  // Check biometric availability + opt-in flag on mount. We don't need
  // the specific biometric type (face vs fingerprint) for the button
  // label — "Use Biometrics" works universally, and the OS prompt itself
  // already shows the right artwork (Face ID / Touch ID / Android BiometricPrompt).
  useEffect(() => {
    (async () => {
      const [info, enabled] = await Promise.all([isBiometricAvailable(), isBiometricEnabled()]);
      if (info.available && enabled) setBioEnabled(true);
    })();
  }, []);

  // After any successful sign-in, if the device has biometrics enrolled
  // and the user hasn't opted in yet, offer one-tap enrollment so the
  // next session skips password entry entirely.
  const offerBiometricEnrollment = useCallback(async (tokenForStore?: string | null) => {
    try {
      const [info, enabled] = await Promise.all([isBiometricAvailable(), isBiometricEnabled()]);
      if (!info.available || enabled) return;
      const label = info.type === 'face' ? 'Face ID' : info.type === 'fingerprint' ? 'Fingerprint' : 'Biometric';
      // Try the incoming param, fall back to the context token, finally storage.
      let token: string | null = tokenForStore ?? sessionToken ?? null;
      if (!token) token = await AsyncStorage.getItem('session_token');
      if (!token) return;
      Alert.alert(
        `Enable ${label}?`,
        `Unlock Raven Scout with ${label} next time — no password required.`,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Enable',
            onPress: async () => {
              const ok = await enableBiometric(token!);
              if (!ok) Alert.alert('Could not enable', 'You can try again later from your profile.');
            },
          },
        ],
      );
    } catch {
      /* enrollment offer is best-effort */
    }
  }, [sessionToken]);

  const handlePasswordLogin = useCallback(async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Enter your email and password to sign in.');
      return;
    }
    setBusy(true);
    const r = await loginWithPassword(email.trim().toLowerCase(), password);
    setBusy(false);
    if (r.ok) {
      // Give AsyncStorage a beat to flush before the enrollment flow reads it.
      const token = await AsyncStorage.getItem('session_token');
      await offerBiometricEnrollment(token);
      router.replace('/');
      return;
    }
    Alert.alert('Sign-in failed', (r as any).reason || 'Please try again.');
  }, [email, password, loginWithPassword, router, offerBiometricEnrollment]);

  const handleGoogle = async () => {
    setBusy(true);
    const r = await loginWithGoogle();
    setBusy(false);
    if (r.ok) {
      const token = await AsyncStorage.getItem('session_token');
      await offerBiometricEnrollment(token);
      router.replace('/');
      return;
    }
    if (r.reason === 'cancelled') return;
    Alert.alert('Sign-in failed', `Could not sign in (${r.reason}). Please try again.`);
  };

  const handleBiometric = async () => {
    const r = await authenticateWithBiometric('Unlock Raven Scout');
    if (!r.ok) {
      if (r.reason === 'cancelled' || r.reason === 'user_cancel') return;
      Alert.alert('Biometric failed', 'Sign in with your password instead.');
      return;
    }
    // Token is already valid — just persist it and reload.
    await AsyncStorage.setItem('session_token', r.sessionToken);
    // Force full reload so useAuth re-hydrates with the new token.
    router.replace('/');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top','bottom','left','right']}>
        <View style={styles.loadingContainer}><RavenSpinner size={120} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top','bottom','left','right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brandSection}>
            <Image source={require('../assets/images/rslogo.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="Raven Scout" />
            <Text style={styles.tagline}>A smarter way to plan your hunt.</Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={COLORS.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
          />

          <TouchableOpacity style={styles.primaryBtn} onPress={handlePasswordLogin} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.primaryBtnText}>SIGN IN</Text>}
          </TouchableOpacity>

          <View style={styles.rowLinks}>
            <TouchableOpacity onPress={() => router.push('/register')}>
              <Text style={styles.link}>Create account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/forgot-password')}>
              <Text style={styles.link}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dividerRow}><View style={styles.dividerLine} /><Text style={styles.dividerText}>or</Text><View style={styles.dividerLine} /></View>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleGoogle} disabled={busy} activeOpacity={0.85}>
            <Ionicons name="logo-google" size={18} color={COLORS.textPrimary} />
            <Text style={styles.secondaryBtnText}>Continue with Google</Text>
          </TouchableOpacity>

          {bioEnabled && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleBiometric} disabled={busy} activeOpacity={0.85}>
              <Ionicons name="finger-print" size={20} color={COLORS.accent} />
              <Text style={styles.secondaryBtnText}>Use Biometrics</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 24, paddingBottom: 48 },
  brandSection: { alignItems: 'center', marginBottom: 24 },
  brandLogo: { width: 300, height: 300, marginBottom: 0 },
  tagline: { color: COLORS.textSecondary, fontSize: 14, marginTop: 8 },
  input: { borderWidth: 1, borderColor: 'rgba(200,155,60,0.25)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, color: COLORS.textPrimary, marginBottom: 12, fontSize: 15 },
  primaryBtn: { backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  rowLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  link: { color: COLORS.accent, fontSize: 13 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 22 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(154,164,169,0.2)' },
  dividerText: { color: COLORS.textSecondary, marginHorizontal: 12, fontSize: 12 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(200,155,60,0.3)', paddingVertical: 14, borderRadius: 10, marginBottom: 10 },
  secondaryBtnText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
});
