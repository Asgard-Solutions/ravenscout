import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';

// Three-step password reset flow, all on one screen.
// Step 1: enter email -> backend emails an OTP via Microsoft Graph.
// Step 2: enter OTP -> backend returns a short-lived reset_token.
// Step 3: choose new password -> backend swaps the hash + signs user in.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset, verifyOtp, resetPassword } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);

  const pwOk = newPw.length >= 10 && /[A-Z]/.test(newPw) && /[a-z]/.test(newPw) && /\d/.test(newPw) && /[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\/;']/.test(newPw);

  const step1 = async () => {
    if (!email.trim()) return;
    setBusy(true);
    const r = await requestPasswordReset(email.trim().toLowerCase());
    setBusy(false);
    if (!r.ok) { Alert.alert('Error', (r as any).reason); return; }
    setStep(2);
    Alert.alert('Check your email', 'We sent a 6-digit code to your inbox if an account exists. Enter it below.');
  };
  const step2 = async () => {
    if (!otp.trim()) return;
    setBusy(true);
    const r = await verifyOtp(email.trim().toLowerCase(), otp.trim());
    setBusy(false);
    if (!r.ok) { Alert.alert('Code incorrect', (r as any).reason); return; }
    setResetToken(r.resetToken); setStep(3);
  };
  const step3 = async () => {
    if (!pwOk) { Alert.alert('Weak password', 'Password does not meet all requirements.'); return; }
    if (newPw !== confirmPw) { Alert.alert('Passwords do not match'); return; }
    setBusy(true);
    const r = await resetPassword(resetToken, newPw);
    setBusy(false);
    if (!r.ok) { Alert.alert('Error', (r as any).reason); return; }
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top','bottom','left','right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backRow} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
            <Text style={styles.backText}>Back to sign-in</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Reset your password</Text>
          {step === 1 && <>
            <Text style={styles.subtitle}>Enter your email. We'll send you a 6-digit code.</Text>
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textSecondary} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <TouchableOpacity style={styles.primaryBtn} onPress={step1} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.primaryBtnText}>SEND CODE</Text>}
            </TouchableOpacity>
          </>}
          {step === 2 && <>
            <Text style={styles.subtitle}>Enter the 6-digit code we sent to {email}. Code expires in 15 minutes.</Text>
            <TextInput style={[styles.input, { fontSize: 22, letterSpacing: 8, textAlign: 'center' }]} placeholder="000000" placeholderTextColor={COLORS.textSecondary} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />
            <TouchableOpacity style={styles.primaryBtn} onPress={step2} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.primaryBtnText}>VERIFY</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep(1)} style={{ marginTop: 16 }}><Text style={styles.link}>Didn't receive it? Start over</Text></TouchableOpacity>
          </>}
          {step === 3 && <>
            <Text style={styles.subtitle}>Choose a new password.</Text>
            <TextInput style={styles.input} placeholder="New password" placeholderTextColor={COLORS.textSecondary} value={newPw} onChangeText={setNewPw} secureTextEntry autoComplete="new-password" />
            <TextInput style={styles.input} placeholder="Confirm new password" placeholderTextColor={COLORS.textSecondary} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry autoComplete="new-password" />
            <Text style={styles.helpText}>10+ chars · upper · lower · number · symbol</Text>
            <TouchableOpacity style={[styles.primaryBtn, !pwOk && { opacity: 0.5 }]} onPress={step3} disabled={busy || !pwOk} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.primaryBtnText}>SAVE &amp; SIGN IN</Text>}
            </TouchableOpacity>
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  container: { padding: 24 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backText: { color: COLORS.accent, fontSize: 14, marginLeft: 4 },
  title: { color: COLORS.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: COLORS.textSecondary, marginTop: 6, marginBottom: 22, fontSize: 14, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: 'rgba(200,155,60,0.25)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, color: COLORS.textPrimary, marginBottom: 12, fontSize: 15 },
  helpText: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 14 },
  primaryBtn: { backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  link: { color: COLORS.accent, fontSize: 13, textAlign: 'center' },
});
