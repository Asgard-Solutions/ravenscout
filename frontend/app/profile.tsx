import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Image, ActivityIndicator, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/constants/theme';
import { useAuth } from '../src/hooks/useAuth';
import { isBiometricAvailable, isBiometricEnabled, enableBiometric, disableBiometric } from '../src/utils/biometric';

// User profile — avatar tap from home lands here. Lets the user:
//   - Edit their display name (email is immutable)
//   - Change their password (only if email/password account)
//   - Toggle biometric unlock
//   - Sign out
//   - Delete account (double-confirmed)
export default function ProfileScreen() {
  const router = useRouter();
  const { user, sessionToken, updateProfile, changePassword, deleteAccount, logout } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [busy, setBusy] = useState(false);
  const [bioAvail, setBioAvail] = useState<{ available: boolean; type: string } | null>(null);
  const [bioOn, setBioOn] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  useEffect(() => { setName(user?.name || ''); }, [user?.name]);
  useEffect(() => {
    (async () => {
      const [info, enabled] = await Promise.all([isBiometricAvailable(), isBiometricEnabled()]);
      setBioAvail({ available: info.available, type: info.type });
      setBioOn(info.available && enabled);
    })();
  }, []);

  const saveName = async () => {
    if (!name.trim() || name === user?.name) return;
    setBusy(true);
    const r = await updateProfile({ name: name.trim() });
    setBusy(false);
    if (!r.ok) Alert.alert('Could not update', (r as any).reason);
  };

  const toggleBio = async (next: boolean) => {
    if (next && sessionToken) {
      const ok = await enableBiometric(sessionToken);
      if (!ok) { Alert.alert('Could not enable', 'Biometric enrollment failed.'); return; }
      setBioOn(true);
    } else {
      await disableBiometric();
      setBioOn(false);
    }
  };

  const doChangePw = async () => {
    if (!currentPw || !newPw) return;
    if (newPw !== confirmPw) { Alert.alert('Passwords do not match'); return; }
    setBusy(true);
    const r = await changePassword(currentPw, newPw);
    setBusy(false);
    if (!r.ok) { Alert.alert('Could not change password', (r as any).reason); return; }
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    Alert.alert('Password updated', 'Your password has been changed. Other sessions were signed out.');
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your hunts, history, and subscription data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const r = await deleteAccount();
          if (!r.ok) { Alert.alert('Could not delete', (r as any).reason); return; }
          router.replace('/login');
        } },
      ],
    );
  };

  const bioLabel = bioAvail?.type === 'face' ? 'Face ID' : bioAvail?.type === 'fingerprint' ? 'Fingerprint' : 'Biometric';

  if (!user) {
    return <SafeAreaView style={styles.safeArea} edges={['top','bottom','left','right']}><View style={styles.center}><ActivityIndicator color={COLORS.accent} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top','bottom','left','right']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={COLORS.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>PROFILE</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.avatarWrap}>
          {user.picture ? <Image source={{ uri: user.picture }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarInitial}>{(user.name || user.email || '?').charAt(0).toUpperCase()}</Text></View>}
          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.tierBadge}>{(user.tier || 'trial').toUpperCase()} · {user.usage?.remaining ?? '?'}/{user.usage?.limit ?? '?'} left</Text>
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={COLORS.textSecondary} onBlur={saveName} />
        </View>

        {bioAvail?.available && <>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={[styles.card, styles.row]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Unlock with {bioLabel}</Text>
              <Text style={styles.help}>Skip password on this device.</Text>
            </View>
            <Switch value={bioOn} onValueChange={toggleBio} trackColor={{ true: COLORS.accent }} />
          </View>
        </>}

        <Text style={styles.sectionTitle}>Change password</Text>
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder="Current password" placeholderTextColor={COLORS.textSecondary} value={currentPw} onChangeText={setCurrentPw} secureTextEntry />
          <TextInput style={styles.input} placeholder="New password" placeholderTextColor={COLORS.textSecondary} value={newPw} onChangeText={setNewPw} secureTextEntry />
          <TextInput style={styles.input} placeholder="Confirm new password" placeholderTextColor={COLORS.textSecondary} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry />
          <TouchableOpacity style={[styles.primaryBtn, (!currentPw || !newPw) && { opacity: 0.5 }]} onPress={doChangePw} disabled={busy || !currentPw || !newPw} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.primaryBtnText}>UPDATE PASSWORD</Text>}
          </TouchableOpacity>
          <Text style={styles.help}>Note: Google-only accounts should use &quot;Forgot password&quot; from the sign-in screen to set one.</Text>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={async () => { await logout(); router.replace('/login'); }} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} activeOpacity={0.85}>
          <Text style={styles.deleteText}>Delete account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  avatarWrap: { alignItems: 'center', marginVertical: 20 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(200,155,60,0.15)' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.accent },
  avatarInitial: { color: COLORS.accent, fontSize: 36, fontWeight: '900' },
  email: { color: COLORS.textPrimary, fontSize: 14, marginTop: 12 },
  tierBadge: { color: COLORS.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 6 },
  sectionTitle: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: 'rgba(58,74,82,0.25)', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: 'rgba(200,155,60,0.15)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { color: COLORS.textPrimary, fontSize: 13, marginBottom: 6 },
  help: { color: COLORS.textSecondary, fontSize: 11, marginTop: 6 },
  input: { borderWidth: 1, borderColor: 'rgba(200,155,60,0.25)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, color: COLORS.textPrimary, marginBottom: 8, fontSize: 14 },
  primaryBtn: { backgroundColor: COLORS.accent, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  primaryBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(154,164,169,0.25)', borderRadius: 10 },
  signOutText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  deleteText: { color: '#d15b5b', fontSize: 13, fontWeight: '600' },
});
