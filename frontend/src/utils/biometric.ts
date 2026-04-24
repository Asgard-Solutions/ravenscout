// ===================================================================
// biometric.ts — Face ID / Touch ID / Fingerprint unlock helpers.
// ===================================================================
//
// Flow:
//   1. After the user successfully signs in with password (first time
//      on this device) we call `offerBiometricEnrollment()`. If the
//      device reports a biometric sensor enrolled, we prompt "Enable
//      Face ID/Fingerprint for quick unlock?"
//   2. On Yes, we store the current session token in expo-secure-store
//      under a biometric-protected key. We also save a small flag in
//      AsyncStorage so the login screen knows this device has
//      biometric unlock enabled.
//   3. Next app open: login screen reads the flag, shows a "Use
//      Biometric" button. Tapping it runs authenticateWithBiometric()
//      which prompts the OS-native biometric dialog. On success we
//      read the stored token from SecureStore and reinstate the
//      session.
//   4. Fallback: after 3 failures we fall through to the normal
//      password/Google login options.
//
// SECURE STORE NOTES:
//   - On iOS: tokens are stored in the Keychain, protected with
//     kSecAccessControlBiometryCurrentSet (requires the biometric
//     enrollment to still match — disables if the user adds a new
//     fingerprint).
//   - On Android: uses EncryptedSharedPreferences via expo-secure-store.
//     Not hardware-backed on every device but AES-256 at rest.

import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORE_KEY = 'raven_biometric_session';
const FLAG_KEY = 'raven_biometric_enabled';

export async function isBiometricAvailable(): Promise<{
  available: boolean;
  type: 'face' | 'fingerprint' | 'iris' | 'none';
  reason?: string;
}> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return { available: false, type: 'none', reason: 'no_hardware' };
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return { available: false, type: 'none', reason: 'not_enrolled' };
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION))
      return { available: true, type: 'face' };
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT))
      return { available: true, type: 'fingerprint' };
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS))
      return { available: true, type: 'iris' };
    return { available: true, type: 'fingerprint' };
  } catch (err: any) {
    return { available: false, type: 'none', reason: err?.message || 'error' };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(FLAG_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function enableBiometric(sessionToken: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(STORE_KEY, sessionToken, {
      requireAuthentication: true,
      authenticationPrompt: 'Confirm to enable biometric unlock',
    });
    await AsyncStorage.setItem(FLAG_KEY, '1');
    return true;
  } catch (err) {
    return false;
  }
}

export async function disableBiometric(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
  } catch {}
  await AsyncStorage.removeItem(FLAG_KEY);
}

export async function authenticateWithBiometric(reason = 'Unlock Raven Scout'): Promise<
  { ok: true; sessionToken: string } | { ok: false; reason: string }
> {
  try {
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      disableDeviceFallback: false,
      fallbackLabel: 'Use password',
      cancelLabel: 'Cancel',
    });
    if (!auth.success) {
      return { ok: false, reason: (auth as any).error || 'cancelled' };
    }
    const token = await SecureStore.getItemAsync(STORE_KEY, {
      requireAuthentication: Platform.OS === 'ios' ? true : false,
      authenticationPrompt: reason,
    });
    if (!token) return { ok: false, reason: 'no_stored_token' };
    return { ok: true, sessionToken: token };
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'error' };
  }
}
