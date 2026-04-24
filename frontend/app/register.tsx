import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';

// Create an email/password account. Enforces the strict policy:
//   10+ chars, 1 uppercase, 1 lowercase, 1 digit, 1 symbol.
// Server validates again; we show inline feedback here so users don't
// get kicked to an Alert on every keystroke.
export default function RegisterScreen() {
  const router = useRouter();
  const { registerWithPassword } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const pwChecks = {
    length: password.length >= 10,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /\d/.test(password),
    symbol: /[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\/;']/.test(password),
  };
  const pwOk = Object.values(pwChecks).every(Boolean);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Missing info', 'Please fill out all fields.'); return;
    }
    if (!pwOk) { Alert.alert('Weak password', 'Password does not meet all requirements.'); return; }
    if (password !== confirm) { Alert.alert('Passwords do not match'); return; }
    setBusy(true);
    const r = await registerWithPassword(email.trim().toLowerCase(), password, name.trim());
    setBusy(false);
    if (r.ok) { router.replace('/'); return; }
    Alert.alert('Could not create account', (r as any).reason || 'Please try again.');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top','bottom','left','right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backRow} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Start your Raven Scout trial — 3 hunt analyses, free.</Text>
          <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={COLORS.textSecondary} value={name} onChangeText={setName} autoCapitalize="words" />
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textSecondary} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor={COLORS.textSecondary} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <TextInput style={styles.input} placeholder="Confirm password" placeholderTextColor={COLORS.textSecondary} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />
          <View style={styles.checksWrap}>
            {[['At least 10 characters', pwChecks.length],['One uppercase letter', pwChecks.upper],['One lowercase letter', pwChecks.lower],['One number', pwChecks.digit],['One symbol (!@#…)', pwChecks.symbol]].map(([label, ok]) => (
              <View key={label as string} style={styles.checkRow}>
                <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? '#6dc47a' : COLORS.textSecondary} />
                <Text style={[styles.checkText, ok && { color: COLORS.textPrimary }]}>{label as string}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={[styles.primaryBtn, !pwOk && { opacity: 0.5 }]} onPress={submit} disabled={busy || !pwOk} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.primaryBtnText}>CREATE ACCOUNT</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  container: { padding: 24, paddingBottom: 48 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backText: { color: COLORS.accent, fontSize: 14, marginLeft: 4 },
  title: { color: COLORS.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: COLORS.textSecondary, marginTop: 6, marginBottom: 22, fontSize: 14 },
  input: { borderWidth: 1, borderColor: 'rgba(200,155,60,0.25)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, color: COLORS.textPrimary, marginBottom: 12, fontSize: 15 },
  checksWrap: { marginTop: 4, marginBottom: 18 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  checkText: { color: COLORS.textSecondary, fontSize: 13 },
  primaryBtn: { backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: '900', letterSpacing: 2 },
});
