import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { BACKEND_URL } from '../constants/theme';
import { identifyUser as rcIdentifyUser, logoutPurchases as rcLogoutPurchases } from '../lib/purchases';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT
// URLS, THIS BREAKS THE AUTH.
//
// The Google Web Client ID comes from EXPO_PUBLIC_GOOGLE_CLIENT_ID.
// Read once here so the rest of the hook can call configure()
// lazily the first time loginWithGoogle() is invoked.
const GOOGLE_WEB_CLIENT_ID =
  (Constants.expoConfig?.extra as any)?.googleWebClientId ||
  (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID as string | undefined) ||
  '';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture: string;
  tier: string;
  has_password?: boolean;
  usage: {
    allowed: boolean;
    remaining: number;
    limit: number;
    tier: string;
    message?: string;
    rollover?: number;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sessionToken: string | null;
  login: (sessionId: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  loginWithPassword: (email: string, password: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  loginWithToken: (sessionToken: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  registerWithPassword: (email: string, password: string, name: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  requestPasswordReset: (email: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  verifyOtp: (email: string, otp: string) => Promise<{ ok: true; resetToken: string } | { ok: false; reason: string }>;
  resetPassword: (resetToken: string, newPassword: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  updateProfile: (patch: { name?: string; picture?: string }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  changePassword: (currentPw: string, newPw: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  setPassword: (newPw: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  deleteAccount: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, sessionToken: null,
  login: async () => false,
  loginWithGoogle: async () => ({ ok: false, reason: 'not_ready' }),
  loginWithPassword: async () => ({ ok: false, reason: 'not_ready' }),
  loginWithToken: async () => ({ ok: false, reason: 'not_ready' }),
  registerWithPassword: async () => ({ ok: false, reason: 'not_ready' }),
  requestPasswordReset: async () => ({ ok: false, reason: 'not_ready' }),
  verifyOtp: async () => ({ ok: false, reason: 'not_ready' }),
  resetPassword: async () => ({ ok: false, reason: 'not_ready' }),
  updateProfile: async () => ({ ok: false, reason: 'not_ready' }),
  changePassword: async () => ({ ok: false, reason: 'not_ready' }),
  setPassword: async () => ({ ok: false, reason: 'not_ready' }),
  deleteAccount: async () => ({ ok: false, reason: 'not_ready' }),
  logout: async () => {}, refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const fetchUser = useCallback(async (token: string): Promise<User | null> => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!sessionToken) return;
    const u = await fetchUser(sessionToken);
    if (u) setUser(u);
  }, [sessionToken, fetchUser]);

  // Check existing session on mount
  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        const u = await fetchUser(token);
        if (u) {
          setUser(u);
          setSessionToken(token);
        } else {
          await AsyncStorage.removeItem('session_token');
        }
      }
      setLoading(false);
    })();
  }, [fetchUser]);

  // Mirror auth state into RevenueCat: alias the anonymous RC user to
  // our backend `user_id` after sign-in so that subscription
  // entitlements survive reinstalls and cross-device installs, then
  // call `Purchases.logOut()` on sign-out so the next sign-in starts
  // a fresh session. No-op when the SDK is unavailable (Expo Go / web).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (user?.user_id) {
        await rcIdentifyUser(user.user_id);
      } else if (!loading) {
        await rcLogoutPurchases();
      }
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [user?.user_id, loading]);

  const login = async (sessionId: string): Promise<boolean> => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      const token = data.session_token;
      await AsyncStorage.setItem('session_token', token);
      setSessionToken(token);
      // Fetch full user with usage
      const u = await fetchUser(token);
      if (u) setUser(u);
      return true;
    } catch {
      return false;
    }
  };

  // ------------------------------------------------------------------
  // Google Sign-In (native flow, portable — used with Railway backend)
  // ------------------------------------------------------------------
  // Uses @react-native-google-signin/google-signin. iOS needs the
  // reversed-client-ID URL scheme in app.json (see iosUrlScheme in the
  // plugin config). Android uses Google Play Services — the user's
  // Google accounts appear in a native picker.
  //
  // Flow:
  //   1. GoogleSignin.configure({ webClientId }) — idempotent.
  //   2. GoogleSignin.signIn() → returns { idToken, user, ... }
  //   3. POST idToken → /api/auth/google → backend verifies signature
  //      against Google's JWKS, upserts user by email, mints our
  //      session token.
  //   4. Store session token in AsyncStorage, hydrate user.
  //
  // Not supported on Platform.OS === 'web' — the native library has no
  // web implementation. The app's web blocker already prevents end
  // users from reaching a login screen on web anyway.
  const loginWithGoogle = async (): Promise<
    { ok: true } | { ok: false; reason: string }
  > => {
    if (Platform.OS === 'web') {
      return { ok: false, reason: 'web_not_supported' };
    }
    if (!GOOGLE_WEB_CLIENT_ID) {
      return { ok: false, reason: 'missing_google_client_id_env' };
    }
    try {
      // Dynamic import so web bundle never pulls in native-only code.
      const GoogleSignin = (
        await import('@react-native-google-signin/google-signin')
      ).GoogleSignin;

      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        // We only need an ID token (no access token, no offline).
        offlineAccess: false,
      });

      // Make sure Play Services is present on Android. No-op on iOS.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const result = await GoogleSignin.signIn();
      // v13+ shape: { type: 'success', data: { idToken, user, ... } }
      // Older shape: { idToken, user, ... } directly. Support both.
      const idToken: string | null =
        (result as any)?.data?.idToken ?? (result as any)?.idToken ?? null;
      if (!idToken) {
        return { ok: false, reason: 'no_id_token_returned' };
      }

      const resp = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      if (!resp.ok) {
        return { ok: false, reason: `backend_${resp.status}` };
      }
      const data = await resp.json();
      const token = data.session_token;
      if (!token) return { ok: false, reason: 'no_session_token' };
      await AsyncStorage.setItem('session_token', token);
      setSessionToken(token);
      const u = await fetchUser(token);
      if (u) setUser(u);
      return { ok: true };
    } catch (err: any) {
      const code = err?.code || err?.message || String(err);
      // User-cancelled flow isn't an error in the UX sense — return
      // ok:false with a known reason so the login screen can stay
      // idle rather than showing a scary alert.
      if (code === 'SIGN_IN_CANCELLED' || code === '-5') {
        return { ok: false, reason: 'cancelled' };
      }
      return { ok: false, reason: code || 'unknown' };
    }
  };

  // ------------------------------------------------------------------
  // Email + password auth (for users without / not wanting Google).
  // Each fn is non-throwing: returns {ok:true} on success, or
  // {ok:false, reason} where reason is the backend's `detail` string.
  // ------------------------------------------------------------------
  const authJsonFetch = async (path: string, body: any): Promise<{ ok: true; data: any } | { ok: false; reason: string }> => {
    try {
      const resp = await fetch(`${BACKEND_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : JSON.stringify(data?.detail || data);
        return { ok: false, reason: detail || `http_${resp.status}` };
      }
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, reason: err?.message || 'network_error' };
    }
  };

  const _installSession = async (data: any): Promise<void> => {
    const token = data?.session_token;
    if (!token) return;
    await AsyncStorage.setItem('session_token', token);
    setSessionToken(token);
    const u = await fetchUser(token);
    if (u) setUser(u);
  };

  const loginWithPassword = async (email: string, password: string) => {
    const r = await authJsonFetch('/api/auth/login', { email, password });
    if (!r.ok) return r;
    await _installSession(r.data);
    return { ok: true as const };
  };

  // Re-install a session from a stored biometric-protected token.
  // Validates the token against /api/users/me before committing it,
  // so a stale/expired token can't put the app in a half-signed-in
  // state. On failure the caller should clear local biometric state.
  const loginWithToken = async (token: string) => {
    if (!token) return { ok: false as const, reason: 'no_token' };
    const u = await fetchUser(token);
    if (!u) return { ok: false as const, reason: 'invalid_token' };
    await AsyncStorage.setItem('session_token', token);
    setSessionToken(token);
    setUser(u);
    return { ok: true as const };
  };

  const registerWithPassword = async (email: string, password: string, name: string) => {
    const r = await authJsonFetch('/api/auth/register', { email, password, name });
    if (!r.ok) return r;
    await _installSession(r.data);
    return { ok: true as const };
  };

  const requestPasswordReset = async (email: string) => {
    const r = await authJsonFetch('/api/auth/request-password-reset', { email });
    if (!r.ok) return r;
    return { ok: true as const };
  };

  const verifyOtp = async (email: string, otp: string) => {
    const r = await authJsonFetch('/api/auth/verify-otp', { email, otp });
    if (!r.ok) return r;
    const resetToken: string = r.data?.reset_token || '';
    if (!resetToken) return { ok: false as const, reason: 'no_reset_token' };
    return { ok: true as const, resetToken };
  };

  const resetPassword = async (resetToken: string, newPassword: string) => {
    const r = await authJsonFetch('/api/auth/reset-password', {
      reset_token: resetToken,
      new_password: newPassword,
    });
    if (!r.ok) return r;
    await _installSession(r.data);
    return { ok: true as const };
  };

  const updateProfile = async (patch: { name?: string; picture?: string }) => {
    if (!sessionToken) return { ok: false as const, reason: 'no_session' };
    try {
      const resp = await fetch(`${BACKEND_URL}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(patch),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return { ok: false as const, reason: data?.detail || `http_${resp.status}` };
      // Refresh user so UI reflects the change.
      await refreshUser();
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, reason: err?.message || 'network_error' };
    }
  };

  const changePassword = async (currentPw: string, newPw: string) => {
    if (!sessionToken) return { ok: false as const, reason: 'no_session' };
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return { ok: false as const, reason: data?.detail || `http_${resp.status}` };
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, reason: err?.message || 'network_error' };
    }
  };

  // First-time password attach for Google-only users. No `current_password`
  // because there isn't one yet. Backend rejects with 409 if the user
  // already has a password_hash — UI should route them to changePassword.
  const setPassword = async (newPw: string) => {
    if (!sessionToken) return { ok: false as const, reason: 'no_session' };
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/set-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ new_password: newPw }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return { ok: false as const, reason: data?.detail || `http_${resp.status}` };
      // Refresh user so has_password flips to true immediately.
      await refreshUser();
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, reason: err?.message || 'network_error' };
    }
  };

  const deleteAccount = async () => {
    if (!sessionToken) return { ok: false as const, reason: 'no_session' };
    try {
      const resp = await fetch(`${BACKEND_URL}/api/users/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        return { ok: false as const, reason: data?.detail || `http_${resp.status}` };
      }
      await AsyncStorage.removeItem('session_token');
      setSessionToken(null);
      setUser(null);
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, reason: err?.message || 'network_error' };
    }
  };

  const logout = async () => {
    if (sessionToken) {
      try {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      } catch {}
    }
    await AsyncStorage.removeItem('session_token');
    setUser(null);
    setSessionToken(null);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, sessionToken,
      login, loginWithGoogle, loginWithPassword, loginWithToken, registerWithPassword,
      requestPasswordReset, verifyOtp, resetPassword,
      updateProfile, changePassword, setPassword, deleteAccount,
      logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
