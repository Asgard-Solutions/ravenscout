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

export type EnableBiometricResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'cancelled' | 'auth_failed' | 'storage_failed'; detail?: string };

// Show a real biometric scan during enrollment so the user actively
// confirms with their finger / face. Without this step the switch flips
// silently, the user never feels like anything was "saved", and a
// later unlock attempt feels like the feature is broken.
export async function enableBiometric(sessionToken: string): Promise<EnableBiometricResult> {
  // 1. Make sure the device actually has biometrics set up.
  const info = await isBiometricAvailable();
  if (!info.available) {
    return { ok: false, reason: 'unavailable', detail: info.reason };
  }

  // 2. Force a real OS-native biometric prompt. Both platforms run
  //    through the same path so the UX is identical: tap toggle ->
  //    fingerprint / Face ID prompt -> success toast.
  try {
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm to enable biometric unlock',
      // Don't fall back to the device PIN/passcode here — we only want
      // to enable the feature if a real biometric is registered and
      // works, otherwise users get stuck with PIN-only "biometric".
      disableDeviceFallback: true,
      cancelLabel: 'Cancel',
    });
    if (!auth.success) {
      const err = (auth as any).error || 'cancelled';
      const reason: 'cancelled' | 'auth_failed' =
        err === 'user_cancel' || err === 'app_cancel' || err === 'system_cancel' || err === 'cancelled'
          ? 'cancelled'
          : 'auth_failed';
      return { ok: false, reason, detail: err };
    }
  } catch (err: any) {
    return { ok: false, reason: 'auth_failed', detail: err?.message || 'authenticate_threw' };
  }

  // 3. Persist the session token. On iOS we still pin the keychain
  //    entry to the current biometric set so a device-level bypass
  //    can't read it; on Android we keep the token in
  //    EncryptedSharedPreferences and gate reads at unlock time via
  //    a separate authenticateAsync call (the path that broke
  //    silently when requireAuthentication was true on Android).
  try {
    if (Platform.OS === 'ios') {
      await SecureStore.setItemAsync(STORE_KEY, sessionToken, {
        requireAuthentication: true,
        authenticationPrompt: 'Confirm to enable biometric unlock',
      });
    } else {
      await SecureStore.setItemAsync(STORE_KEY, sessionToken);
    }
    await AsyncStorage.setItem(FLAG_KEY, '1');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: 'storage_failed', detail: err?.message || 'setItem_threw' };
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
    if (Platform.OS === 'android') {
      // Android path: single biometric prompt (no "Use PIN" fallback),
      // then read the un-gated token from SecureStore.
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        // CRITICAL: disable the device lock-screen PIN/password fallback.
        // Users never set an app-level PIN, and the device PIN fallback
        // is not what they expect to see here.
        disableDeviceFallback: true,
        cancelLabel: 'Cancel',
      });
      if (!auth.success) {
        return { ok: false, reason: (auth as any).error || 'cancelled' };
      }
      const token = await SecureStore.getItemAsync(STORE_KEY);
      if (!token) return { ok: false, reason: 'no_stored_token' };
      return { ok: true, sessionToken: token };
    }

    // iOS path: the Keychain biometric ACL prompts for Face/Touch ID
    // during getItemAsync, so we don't need a separate authenticateAsync.
    // This keeps it a single, native-looking prompt.
    const token = await SecureStore.getItemAsync(STORE_KEY, {
      requireAuthentication: true,
      authenticationPrompt: reason,
    });
    if (!token) return { ok: false, reason: 'no_stored_token' };
    return { ok: true, sessionToken: token };
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'error' };
  }
}
